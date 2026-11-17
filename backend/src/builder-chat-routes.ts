import { Router } from 'express';
import type { Request } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { Database, HttpError } from './database.ts';
import { readBearerToken } from './auth.ts';
import { draftPaginationSchema, parseBuilder, requireTenant } from './builder.ts';
import { BUILDER_PROMPT_VERSION } from './builder-ai.ts';

const sessionSchema = z.strictObject({ id: z.uuid(), language: z.enum(['darija', 'fr']), consentToOpenAI: z.literal(true) });
const messageSchema = z.strictObject({ id: z.uuid(), expectedRevision: z.number().int().min(0).max(20), text: z.string().trim().min(1).max(2000) });
const sessionColumns = 'id, tenant_id AS "tenantId", language, revision, consent_to_openai AS "consentToOpenAI", created_by AS "createdBy", created_at AS "createdAt"';
const turnColumns = 'id, revision, text, status, prompt_version AS "promptVersion", result, error_code AS "errorCode", usage, provider_metadata AS "provider", created_by AS "createdBy", created_at AS "createdAt", completed_at AS "completedAt"';

export function builderChatRoutes(db: Database, enabled: boolean) {
  const router = Router(); const base = '/tenants/:tenantId/builder/sessions';
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  function scoped<T>(req: Request, owner: boolean, work: (client: PoolClient, tenantId: string, actor: string) => Promise<T>) {
    return db.authenticated(readBearerToken(req.headers.authorization), async (client, actor) => {
      const tenantId = parseBuilder(z.uuid(), req.params.tenantId); await requireTenant(client, tenantId, owner);
      return work(client, tenantId, actor);
    });
  }
  router.post(base, async (req, res) => {
    const result = await scoped(req, true, async (client, tenantId, actor) => {
      const input = parseBuilder(sessionSchema, req.body);
      const inserted = await client.query(`INSERT INTO builder_chat_sessions(tenant_id, id, language, consent_to_openai, created_by)
        VALUES ($1, $2, $3, true, $4) ON CONFLICT (tenant_id, id) DO NOTHING RETURNING ${sessionColumns}`, [tenantId, input.id, input.language, actor]);
      if (inserted.rowCount) return { created: true, row: inserted.rows[0] };
      const existing = await client.query(`SELECT ${sessionColumns} FROM builder_chat_sessions WHERE tenant_id = $1 AND id = $2`, [tenantId, input.id]);
      if (existing.rows[0].language !== input.language) throw new HttpError(409, 'SESSION_ID_REUSED', 'This session ID was used with a different language.');
      return { created: false, row: existing.rows[0] };
    });
    res.status(result.created ? 201 : 200).json(result.row);
  });
  router.get(base, async (req, res) => {
    res.json(await scoped(req, false, async (client, tenantId) => {
      const { page, pageSize } = parseBuilder(draftPaginationSchema, req.query);
      const rows = await client.query(`SELECT ${sessionColumns} FROM builder_chat_sessions WHERE tenant_id = $1 ORDER BY id LIMIT $2 OFFSET $3`, [tenantId, pageSize, (page - 1) * pageSize]);
      const count = await client.query('SELECT count(*)::integer AS total FROM builder_chat_sessions WHERE tenant_id = $1', [tenantId]);
      return { data: rows.rows, pagination: { page, pageSize, totalItems: count.rows[0].total, totalPages: Math.ceil(count.rows[0].total / pageSize) } };
    }));
  });
  router.get(base + '/:id', async (req, res) => {
    res.json(await scoped(req, false, async (client, tenantId) => {
      const id = parseBuilder(z.uuid(), req.params.id);
      const session = await client.query(`SELECT ${sessionColumns} FROM builder_chat_sessions WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
      if (!session.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Builder session not found.');
      const turns = await client.query(`SELECT ${turnColumns} FROM builder_chat_turns WHERE tenant_id = $1 AND session_id = $2 AND revision <= $3 ORDER BY revision`, [tenantId, id, session.rows[0].revision]);
      return { ...session.rows[0], turns: turns.rows };
    }));
  });
  router.post(base + '/:id/messages', async (req, res) => {
    const result = await scoped(req, true, async (client, tenantId, actor) => {
      const id = parseBuilder(z.uuid(), req.params.id); const input = parseBuilder(messageSchema, req.body);
      const session = await client.query('SELECT revision FROM builder_chat_sessions WHERE tenant_id = $1 AND id = $2 FOR UPDATE', [tenantId, id]);
      if (!session.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Builder session not found.');
      const replay = await client.query(`SELECT ${turnColumns} FROM builder_chat_turns WHERE tenant_id = $1 AND session_id = $2 AND id = $3`, [tenantId, id, input.id]);
      if (replay.rowCount) {
        if (replay.rows[0].text !== input.text || replay.rows[0].revision !== input.expectedRevision + 1) throw new HttpError(409, 'MESSAGE_ID_REUSED', 'This message ID was used with different input.');
        return { created: false, row: replay.rows[0] };
      }
      if (!enabled) throw new HttpError(503, 'BUILDER_AI_DISABLED', 'Builder AI is not configured.');
      if (session.rows[0].revision !== input.expectedRevision) throw new HttpError(409, 'STALE_REVISION', 'Reload the current Builder session.');
      if (input.expectedRevision >= 20) throw new HttpError(429, 'SESSION_LIMIT', 'Start a new Builder session.');
      const active = await client.query("SELECT 1 FROM builder_chat_turns WHERE tenant_id = $1 AND session_id = $2 AND status IN ('QUEUED', 'RUNNING')", [tenantId, id]);
      if (active.rowCount) throw new HttpError(409, 'TURN_PENDING', 'Wait for the current reply before sending another message.');
      const quota = await client.query(`INSERT INTO builder_ai_quota AS q(tenant_id, day, reserved) VALUES ($1, (now() AT TIME ZONE 'UTC')::date, 1)
        ON CONFLICT (tenant_id, day) DO UPDATE SET reserved = q.reserved + 1 WHERE q.reserved < 20 RETURNING reserved`, [tenantId]);
      if (!quota.rowCount) throw new HttpError(429, 'BUILDER_LIMIT', 'The daily Builder request limit has been reached.');
      const inserted = await client.query(`INSERT INTO builder_chat_turns(tenant_id, session_id, id, revision, text, prompt_version, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${turnColumns}`, [tenantId, id, input.id, input.expectedRevision + 1, input.text, BUILDER_PROMPT_VERSION, actor]);
      await client.query('UPDATE builder_chat_sessions SET revision = revision + 1 WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
      return { created: true, row: inserted.rows[0] };
    });
    res.status(result.created ? 202 : 200).json(result.row);
  });
  router.get('/admin/builder-chat-gaps', async (req, res) => {
    res.json(await db.platformAdmin(readBearerToken(req.headers.authorization), async client => {
      const { page, pageSize } = parseBuilder(draftPaginationSchema, req.query);
      const rows = await client.query(`SELECT id, tenant_id AS "tenantId", session_id AS "sessionId", text AS goal,
        result->'gaps' AS gaps, created_by AS "createdBy", created_at AS "createdAt"
        FROM builder_chat_turns WHERE status = 'SUCCEEDED' AND result->>'status' = 'UNSUPPORTED'
        ORDER BY created_at, tenant_id, session_id, id LIMIT $1 OFFSET $2`, [pageSize, (page - 1) * pageSize]);
      const count = await client.query("SELECT count(*)::integer AS total FROM builder_chat_turns WHERE status = 'SUCCEEDED' AND result->>'status' = 'UNSUPPORTED'");
      return { data: rows.rows, pagination: { page, pageSize, totalItems: count.rows[0].total, totalPages: Math.ceil(count.rows[0].total / pageSize) } };
    }));
  });
  return router;
}
