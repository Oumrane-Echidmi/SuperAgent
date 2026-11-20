import { Router } from 'express';
import type { Request } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { Database, HttpError } from './database.ts';
import { readBearerToken } from './auth.ts';
import { draftPaginationSchema, parseBuilder, requireTenant } from './builder.ts';
import { GenerationFailure, validateGenerated } from './workflow-generator.ts';
import type { WorkflowGenerator } from './workflow-generator.ts';

const createSchema = z.strictObject({ id: z.uuid(), goal: z.string().trim().min(1).max(1000), language: z.enum(['darija', 'fr']), consentToOpenAI: z.literal(true) });
const columns = `id, goal, language, status, workflow, fixtures, report, model, created_by AS "createdBy", created_at AS "createdAt",
  approved_by AS "approvedBy", approved_at AS "approvedAt"`;

export function generatedWorkflowRoutes(db: Database, generator?: WorkflowGenerator) {
  const router = Router(); const base = '/tenants/:tenantId/generated-workflows';
  router.use(base, (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  function scoped<T>(req: Request, owner: boolean, work: (client: PoolClient, tenantId: string, actor: string) => Promise<T>) {
    return db.authenticated(readBearerToken(req.headers.authorization), async (client, actor) => {
      const tenantId = parseBuilder(z.uuid(), req.params.tenantId); await requireTenant(client, tenantId, owner);
      return work(client, tenantId, actor);
    });
  }
  router.post(base, async (req, res) => {
    const input = parseBuilder(createSchema, req.body);
    // Phase 1 (transaction): authorise, replay, reserve quota. No provider call happens inside a transaction.
    const gate = await scoped(req, true, async (client, tenantId) => {
      const existing = await client.query(`SELECT ${columns} FROM generated_workflows WHERE tenant_id = $1 AND id = $2`, [tenantId, input.id]);
      if (existing.rowCount) {
        if (existing.rows[0].goal !== input.goal || existing.rows[0].language !== input.language) throw new HttpError(409, 'GENERATION_ID_REUSED', 'This ID was used with a different request.');
        return { tenantId, existing: existing.rows[0] };
      }
      if (!generator) throw new HttpError(503, 'BUILDER_AI_DISABLED', 'Builder AI is not configured.');
      const quota = await client.query(`INSERT INTO builder_ai_quota AS q(tenant_id, day, reserved) VALUES ($1, (now() AT TIME ZONE 'UTC')::date, 1)
        ON CONFLICT (tenant_id, day) DO UPDATE SET reserved = q.reserved + 1 WHERE q.reserved < 20 RETURNING reserved`, [tenantId]);
      if (!quota.rowCount) throw new HttpError(429, 'BUILDER_LIMIT', 'The daily Builder request limit has been reached.');
      return { tenantId, existing: null };
    });
    if (gate.existing) { res.json(gate.existing); return; }
    // Phase 2 (no transaction): ask the model, then validate everything it returned.
    let generated: Awaited<ReturnType<WorkflowGenerator['generate']>>;
    try { generated = await generator!.generate({ goal: input.goal, language: input.language }); }
    catch (error) {
      throw new HttpError(502, 'GENERATION_FAILED', 'The assistant could not build a workflow. Try again or rephrase the goal.',
        { code: error instanceof GenerationFailure ? error.code : 'PROVIDER_ERROR' });
    }
    const checked = validateGenerated(generated.raw);
    // Phase 3 (transaction): persist the result, whether valid or not, so the owner sees why.
    const row = await scoped(req, true, async (client, tenantId, actor) => {
      await client.query(`INSERT INTO generated_workflows(tenant_id, id, goal, language, status, workflow, fixtures, report, model, usage, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (tenant_id, id) DO NOTHING`,
      [tenantId, input.id, input.goal, input.language, checked.status, checked.workflow ?? {}, JSON.stringify(checked.fixtures ?? []), checked.report, generated.model, generated.usage ?? null, actor]);
      return (await client.query(`SELECT ${columns} FROM generated_workflows WHERE tenant_id = $1 AND id = $2`, [tenantId, input.id])).rows[0];
    });
    res.status(201).json(row);
  });
  router.get(base, async (req, res) => {
    res.json(await scoped(req, false, async (client, tenantId) => {
      const p = parseBuilder(draftPaginationSchema, req.query);
      const rows = await client.query(`SELECT ${columns} FROM generated_workflows WHERE tenant_id = $1 ORDER BY created_at DESC, id LIMIT $2 OFFSET $3`, [tenantId, p.pageSize, (p.page - 1) * p.pageSize]);
      const count = await client.query('SELECT count(*)::integer AS total FROM generated_workflows WHERE tenant_id = $1', [tenantId]);
      return { data: rows.rows, pagination: { page: p.page, pageSize: p.pageSize, totalItems: count.rows[0].total, totalPages: Math.ceil(count.rows[0].total / p.pageSize) } };
    }));
  });
  router.get(base + '/:id', async (req, res) => {
    res.json(await scoped(req, false, async (client, tenantId) => {
      const row = await client.query(`SELECT ${columns} FROM generated_workflows WHERE tenant_id = $1 AND id = $2`, [tenantId, parseBuilder(z.uuid(), req.params.id)]);
      if (!row.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Generated workflow not found.');
      return row.rows[0];
    }));
  });
  router.post(base + '/:id/approve', async (req, res) => {
    parseBuilder(z.strictObject({}), req.body);
    res.json(await scoped(req, true, async (client, tenantId, actor) => {
      const id = parseBuilder(z.uuid(), req.params.id);
      const row = await client.query(`SELECT ${columns} FROM generated_workflows WHERE tenant_id = $1 AND id = $2 FOR UPDATE`, [tenantId, id]);
      if (!row.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Generated workflow not found.');
      if (row.rows[0].approvedAt) return row.rows[0];
      if (row.rows[0].status !== 'READY') throw new HttpError(422, 'DRAFT_NOT_READY', 'Only a workflow that passed its simulation can be approved.');
      return (await client.query(`UPDATE generated_workflows SET approved_by = $3, approved_at = clock_timestamp() WHERE tenant_id = $1 AND id = $2 RETURNING ${columns}`, [tenantId, id, actor])).rows[0];
    }));
  });
  return router;
}
