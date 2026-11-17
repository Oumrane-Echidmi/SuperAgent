import { Router } from 'express';
import { z } from 'zod';
import { Database, HttpError } from './database.ts';
import { readBearerToken } from './auth.ts';
import { draftPaginationSchema, parseBuilder, requireTenant } from './builder.ts';
import { matchCatalog } from './matching.ts';

const inputSchema = z.strictObject({ id: z.uuid(), goal: z.string().trim().min(2).max(4000), language: z.enum(['darija', 'fr']) });
const columns = 'id, tenant_id AS "tenantId", goal, language, result, created_by AS "createdBy", created_at AS "createdAt"';

export function matchingRoutes(db: Database) {
  const router = Router();
  const base = '/tenants/:tenantId/builder/matches';
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.post(base, async (req, res) => {
    const outcome = await db.authenticated(readBearerToken(req.headers.authorization), async (client, actor) => {
      const tenantId = parseBuilder(z.uuid(), req.params.tenantId);
      await requireTenant(client, tenantId, true);
      const input = parseBuilder(inputSchema, req.body);
      function replay(row: { goal: string; language: string }) {
        if (row.goal !== input.goal || row.language !== input.language) throw new HttpError(409, 'REQUEST_ID_REUSED', 'This request ID was used for a different goal.');
        return { created: false, row };
      }
      const existing = await client.query(`SELECT ${columns} FROM builder_match_requests WHERE tenant_id = $1 AND id = $2`, [tenantId, input.id]);
      if (existing.rowCount) return replay(existing.rows[0]);
      const releases = await client.query(`SELECT DISTINCT ON (scenario_id) scenario_id AS "scenarioId", revision, definition
        FROM scenario_releases ORDER BY scenario_id, revision DESC LIMIT 201`);
      if (releases.rowCount! > 200) throw new HttpError(503, 'CATALOG_LIMIT', 'The matching catalog exceeds the current processing limit.');
      const result = matchCatalog(input.goal, input.language, releases.rows);
      const inserted = await client.query(`INSERT INTO builder_match_requests(tenant_id, id, goal, language, result, created_by)
        VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (tenant_id, id) DO NOTHING RETURNING ${columns}`, [tenantId, input.id, input.goal, input.language, result, actor]);
      if (inserted.rowCount) return { created: true, row: inserted.rows[0] };
      const concurrent = await client.query(`SELECT ${columns} FROM builder_match_requests WHERE tenant_id = $1 AND id = $2`, [tenantId, input.id]);
      return replay(concurrent.rows[0]);
    });
    res.status(outcome.created ? 201 : 200).json(outcome.row);
  });
  router.get(base + '/:id', async (req, res) => {
    res.json(await db.authenticated(readBearerToken(req.headers.authorization), async client => {
      const tenantId = parseBuilder(z.uuid(), req.params.tenantId);
      await requireTenant(client, tenantId, false);
      const id = parseBuilder(z.uuid(), req.params.id);
      const result = await client.query(`SELECT ${columns} FROM builder_match_requests WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
      if (!result.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Builder match request not found.');
      return result.rows[0];
    }));
  });
  router.get('/admin/builder-requests', async (req, res) => {
    res.json(await db.platformAdmin(readBearerToken(req.headers.authorization), async client => {
      const { page, pageSize } = parseBuilder(draftPaginationSchema, req.query);
      const rows = await client.query(`SELECT ${columns} FROM builder_match_requests WHERE result->>'state' = 'UNSUPPORTED'
        ORDER BY created_at, tenant_id, id LIMIT $1 OFFSET $2`, [pageSize, (page - 1) * pageSize]);
      const count = await client.query("SELECT count(*)::integer AS total FROM builder_match_requests WHERE result->>'state' = 'UNSUPPORTED'");
      return { data: rows.rows, pagination: { page, pageSize, totalItems: count.rows[0].total, totalPages: Math.ceil(count.rows[0].total / pageSize) } };
    }));
  });
  return router;
}
