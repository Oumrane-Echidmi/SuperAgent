import { Router } from 'express';
import { loadSheetDelivery, sheetDeliveryView } from './sheet-delivery.ts';
import type { Request } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { Database, HttpError } from './database.ts';
import { readBearerToken } from './auth.ts';
import { requireTenant, draftPaginationSchema } from './builder.ts';
import { orderDetailsSchema } from './cod.ts';
import { appendOrderRevision, attemptSelect, attemptView, loadAttempt, recordDecision, requirePending } from './cod-store.ts';
import type { AttemptRecord } from './cod-store.ts';

const expectedRevision = z.number().int().min(1).max(2147483646);
const conversationSchema = z.strictObject({ id: z.uuid(), customerReference: z.string().trim().min(1).max(200), language: z.enum(['darija', 'fr']) });
const createSchema = z.strictObject({ id: z.uuid(), conversationId: z.uuid(), details: orderDetailsSchema });
const decisionSchema = z.strictObject({ id: z.uuid(), expectedRevision, summaryHash: z.string().regex(/^[a-f0-9]{64}$/),
  decision: z.enum(['CONFIRM', 'DECLINE', 'AMBIGUOUS']), evidence: z.string().trim().min(1).max(500) });
const conversationColumns = 'id, channel, ownership, customer_reference AS "customerReference", language, created_at AS "createdAt"';
export function parseCod<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new HttpError(422, 'INVALID_INPUT', 'Check the order request fields.');
  return parsed.data;
}
export function codRoutes(db: Database) {
  const router = Router(); const base = '/tenants/:tenantId';
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  function scoped<T>(req: Request, work: (client: PoolClient, tenantId: string, actor: string) => Promise<T>) {
    return db.authenticated(readBearerToken(req.headers.authorization), async (client, actor) => {
      const tenantId = parseCod(z.uuid(), req.params.tenantId); await requireTenant(client, tenantId, false);
      return work(client, tenantId, actor);
    });
  }
  router.post(base + '/conversations', async (req, res) => {
    const result = await scoped(req, async (client, tenantId, actor) => {
      const input = parseCod(conversationSchema, req.body);
      const inserted = await client.query(`INSERT INTO conversations(tenant_id, id, customer_reference, language, created_by)
        VALUES ($1, $2, $3, $4, $5) ON CONFLICT (tenant_id, id) DO NOTHING RETURNING ${conversationColumns}`, [tenantId, input.id, input.customerReference, input.language, actor]);
      if (inserted.rowCount) return { created: true, row: inserted.rows[0] };
      const replay = await client.query(`SELECT ${conversationColumns} FROM conversations WHERE tenant_id = $1 AND id = $2`, [tenantId, input.id]);
      if (replay.rows[0].customerReference !== input.customerReference || replay.rows[0].language !== input.language) throw new HttpError(409, 'CONVERSATION_ID_REUSED', 'This conversation ID was used with different details.');
      return { created: false, row: replay.rows[0] };
    });
    res.status(result.created ? 201 : 200).json(result.row);
  });
  router.get(base + '/conversations/:id', async (req, res) => {
    res.json(await scoped(req, async (client, tenantId) => {
      const result = await client.query(`SELECT ${conversationColumns} FROM conversations WHERE tenant_id = $1 AND id = $2`, [tenantId, parseCod(z.uuid(), req.params.id)]);
      if (!result.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Conversation not found.');
      return result.rows[0];
    }));
  });
  router.post(base + '/order-attempts', async (req, res) => {
    const result = await scoped(req, async (client, tenantId, actor) => {
      const input = parseCod(createSchema, req.body);
      const conversation = await client.query('SELECT 1 FROM conversations WHERE tenant_id = $1 AND id = $2', [tenantId, input.conversationId]);
      if (!conversation.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Conversation not found.');
      const inserted = await client.query(`INSERT INTO order_attempts(tenant_id, id, conversation_id, initial_intent, created_by)
        VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING RETURNING id`, [tenantId, input.id, input.conversationId, input, actor]);
      if (inserted.rowCount) await appendOrderRevision(client, tenantId, input.id, input.conversationId, 1, input.details, actor);
      else {
        const replay = await client.query('SELECT initial_intent = $3::jsonb AS matches FROM order_attempts WHERE tenant_id = $1 AND id = $2', [tenantId, input.id, input]);
        if (!replay.rowCount) throw new HttpError(409, 'OPEN_ATTEMPT_EXISTS', 'This conversation already has a pending order attempt.');
        if (!replay.rows[0].matches) throw new HttpError(409, 'ATTEMPT_ID_REUSED', 'This attempt ID was used with different details.');
      }
      return { created: Boolean(inserted.rowCount), row: attemptView(await loadAttempt(client, tenantId, input.id)) };
    });
    res.status(result.created ? 201 : 200).json(result.row);
  });
  router.get(base + '/order-attempts', async (req, res) => {
    res.json(await scoped(req, async (client, tenantId) => {
      const { page, pageSize } = parseCod(draftPaginationSchema, req.query);
      const rows = await client.query<AttemptRecord>(`${attemptSelect} WHERE a.tenant_id = $1 ORDER BY a.started_at DESC, a.id LIMIT $2 OFFSET $3`, [tenantId, pageSize, (page - 1) * pageSize]);
      const count = await client.query('SELECT count(*)::integer AS total FROM order_attempts WHERE tenant_id = $1', [tenantId]);
      return { data: rows.rows.map(attemptView), pagination: { page, pageSize, totalItems: count.rows[0].total, totalPages: Math.ceil(count.rows[0].total / pageSize) } };
    }));
  });
  router.get(base + '/order-attempts/:id', async (req, res) => {
    res.json(await scoped(req, async (client, tenantId) => attemptView(await loadAttempt(client, tenantId, parseCod(z.uuid(), req.params.id)))));
  });
  router.put(base + '/order-attempts/:id', async (req, res) => {
    res.json(await scoped(req, async (client, tenantId, actor) => {
      const id = parseCod(z.uuid(), req.params.id);
      const input = parseCod(z.strictObject({ expectedRevision, details: orderDetailsSchema }), req.body);
      const attempt = await loadAttempt(client, tenantId, id, true); requirePending(attempt, input.expectedRevision);
      await client.query('UPDATE order_attempts SET current_revision = current_revision + 1 WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
      await appendOrderRevision(client, tenantId, id, attempt.conversationId, attempt.revision + 1, input.details, actor);
      return attemptView(await loadAttempt(client, tenantId, id));
    }));
  });
  router.post(base + '/order-attempts/:id/decisions', async (req, res) => {
    const result = await scoped(req, (client, tenantId, actor) => recordDecision(client, tenantId, parseCod(z.uuid(), req.params.id), parseCod(decisionSchema, req.body), actor));
    res.status(result.created ? 201 : 200).json(result.row);
  });
  for (const kind of ['revisions', 'decisions'] as const) {
    router.get(base + '/order-attempts/:id/' + kind, async (req, res) => {
      res.json(await scoped(req, async (client, tenantId) => {
        const id = parseCod(z.uuid(), req.params.id); await loadAttempt(client, tenantId, id);
        const { page, pageSize } = parseCod(draftPaginationSchema, req.query);
        const table = kind === 'revisions' ? 'order_attempt_revisions' : 'order_decision_receipts';
        const columns = kind === 'revisions' ? 'revision, details, summary_hash AS "summaryHash", policy_version AS "policyVersion", created_by AS "createdBy", created_at AS "createdAt"'
          : 'id, reviewed_revision AS "reviewedRevision", summary_hash AS "summaryHash", decision, source, evidence, outcome, created_by AS "createdBy", created_at AS "createdAt"';
        const rows = await client.query(`SELECT ${columns} FROM ${table} WHERE tenant_id = $1 AND attempt_id = $2 ORDER BY created_at, ${kind === 'revisions' ? 'revision' : 'id'} LIMIT $3 OFFSET $4`, [tenantId, id, pageSize, (page - 1) * pageSize]);
        const count = await client.query(`SELECT count(*)::integer AS total FROM ${table} WHERE tenant_id = $1 AND attempt_id = $2`, [tenantId, id]);
        return { data: rows.rows, pagination: { page, pageSize, totalItems: count.rows[0].total, totalPages: Math.ceil(count.rows[0].total / pageSize) } };
      }));
    });
  }
  router.get(base + '/orders', async (req, res) => {
    res.json(await scoped(req, async (client, tenantId) => {
      const { page, pageSize } = parseCod(draftPaginationSchema, req.query);
      const rows = await client.query(`SELECT o.id, o.attempt_id AS "attemptId", o.amount_minor AS "amountMinor", o.currency, o.status,
        o.confirmed_at AS "confirmedAt", s.status AS "sheetSyncStatus",
        CASE WHEN d.status='DISPATCHED' AND d.lease_until<=clock_timestamp() THEN 'UNKNOWN'
          WHEN d.status='PREPARING' AND d.lease_until<=clock_timestamp() THEN 'READY' ELSE coalesce(d.status,'UNBOUND') END AS "sheetDeliveryStatus"
        FROM orders o JOIN sheet_sync_requests s ON s.tenant_id = o.tenant_id AND s.order_id = o.id
        LEFT JOIN sheet_deliveries d ON d.tenant_id=o.tenant_id AND d.order_id=o.id
        WHERE o.tenant_id = $1 ORDER BY o.confirmed_at DESC, o.id LIMIT $2 OFFSET $3`, [tenantId, pageSize, (page - 1) * pageSize]);
      const count = await client.query('SELECT count(*)::integer AS total FROM orders WHERE tenant_id = $1', [tenantId]);
      return { data: rows.rows, pagination: { page, pageSize, totalItems: count.rows[0].total, totalPages: Math.ceil(count.rows[0].total / pageSize) } };
    }));
  });
  router.get(base + '/orders/:id', async (req, res) => {
    res.json(await scoped(req, async (client, tenantId) => {
      const id = parseCod(z.uuid(), req.params.id);
      const order = await client.query(`SELECT id, attempt_id AS "attemptId", reviewed_revision AS "reviewedRevision", summary_hash AS "summaryHash",
        confirmation_event_id AS "confirmationEventId", details, amount_minor AS "amountMinor", currency, status, policy_version AS "policyVersion",
        confirmed_by AS "confirmedBy", confirmed_at AS "confirmedAt" FROM orders WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
      if (!order.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Order not found.');
      const sync = await client.query('SELECT status, operation_key AS "operationKey", payload FROM sheet_sync_requests WHERE tenant_id = $1 AND order_id = $2', [tenantId, id]);
      const delivery=await client.query('SELECT 1 FROM sheet_deliveries WHERE tenant_id=$1 AND order_id=$2',[tenantId,id]);
      return { ...order.rows[0], sheetSync: sync.rowCount?{...sync.rows[0],delivery:delivery.rowCount?sheetDeliveryView(await loadSheetDelivery(client,tenantId,id)):null}:null };
    }));
  });
  return router;
}
