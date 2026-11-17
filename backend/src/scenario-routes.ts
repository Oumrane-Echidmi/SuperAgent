import { Router } from 'express';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { Database, HttpError } from './database.ts';
import { readBearerToken } from './auth.ts';
import { workflowSchema } from './workflow-compiler.ts';
import { fixtureSchema, simulateWorkflow } from './simulator.ts';

const definitionSchema = z.strictObject({
  name: z.string().trim().min(1).max(120), description: z.string().trim().min(1).max(1000),
  workflow: workflowSchema, fixtures: z.array(fixtureSchema).min(1).max(20),
});
const revision = z.number().int().min(1).max(2147483646);
const expected = z.strictObject({ expectedRevision: revision });
const pagination = z.strictObject({ page: z.coerce.number().int().min(1).max(1_000_000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50) });
const draftColumns = 'id, revision, draft AS definition, updated_at AS "updatedAt"';
const releaseColumns = 'scenario_id AS "scenarioId", revision, definition, validation_report AS "validationReport", simulation_report AS "simulationReport", created_at AS "createdAt"';

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new HttpError(422, 'INVALID_INPUT', 'Check the scenario request fields.');
  return parsed.data;
}
async function readDraft(client: PoolClient, id: string, lock = false) {
  const result = await client.query(`SELECT ${draftColumns} FROM scenarios WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id]);
  if (!result.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Scenario not found.');
  return result.rows[0];
}
async function audit(client: PoolClient, id: string, revision: number, actor: string, action: string, details: unknown = {}) {
  await client.query('INSERT INTO scenario_audit(scenario_id, revision, actor_id, action, details) VALUES ($1, $2, $3, $4, $5)', [id, revision, actor, action, details]);
}

export function scenarioRoutes(db: Database) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.post('/admin/scenarios', async (req, res) => {
    const result = await db.platformAdmin(readBearerToken(req.headers.authorization), async (client, actor) => {
      const input = parse(z.strictObject({ id: z.uuid(), definition: definitionSchema }), req.body);
      const inserted = await client.query(`INSERT INTO scenarios(id, initial_definition, draft, created_by)
        VALUES ($1, $2, $2, $3) ON CONFLICT (id) DO NOTHING RETURNING ${draftColumns}`, [input.id, input.definition, actor]);
      if (inserted.rowCount) {
        await audit(client, input.id, 1, actor, 'CREATE_DRAFT');
        return { created: true, row: inserted.rows[0] };
      }
      const replay = await client.query(`SELECT ${draftColumns} FROM scenarios WHERE id = $1 AND initial_definition = $2::jsonb`, [input.id, input.definition]);
      if (!replay.rowCount) throw new HttpError(409, 'SCENARIO_ID_REUSED', 'This scenario ID was used with a different definition.');
      return { created: false, row: replay.rows[0] };
    });
    res.status(result.created ? 201 : 200).json(result.row);
  });
  router.get('/admin/scenarios/:id', async (req, res) => {
    res.json(await db.platformAdmin(readBearerToken(req.headers.authorization), client => readDraft(client, parse(z.uuid(), req.params.id))));
  });
  router.put('/admin/scenarios/:id/draft', async (req, res) => {
    const row = await db.platformAdmin(readBearerToken(req.headers.authorization), async (client, actor) => {
      const id = parse(z.uuid(), req.params.id);
      const input = parse(expected.extend({ definition: definitionSchema }), req.body);
      const current = await readDraft(client, id, true);
      if (current.revision !== input.expectedRevision) throw new HttpError(409, 'STALE_REVISION', 'Reload the current draft revision before editing.');
      const result = await client.query(`UPDATE scenarios SET draft = $2, revision = revision + 1, updated_at = now() WHERE id = $1 RETURNING ${draftColumns}`, [id, input.definition]);
      await audit(client, id, result.rows[0].revision, actor, 'UPDATE_DRAFT');
      return result.rows[0];
    });
    res.json(row);
  });
  router.post('/admin/scenarios/:id/releases', async (req, res) => {
    const result = await db.platformAdmin(readBearerToken(req.headers.authorization), async (client, actor) => {
      const id = parse(z.uuid(), req.params.id);
      const input = parse(expected, req.body);
      const current = await readDraft(client, id, true);
      const existing = await client.query(`SELECT ${releaseColumns} FROM scenario_releases WHERE scenario_id = $1 AND revision = $2`, [id, input.expectedRevision]);
      if (existing.rowCount) return { created: false, row: existing.rows[0] };
      if (current.revision !== input.expectedRevision) throw new HttpError(409, 'STALE_REVISION', 'Release the current draft revision.');
      const report = simulateWorkflow({ workflow: current.definition.workflow, fixtures: current.definition.fixtures });
      if (!report.valid) throw new HttpError(422, 'SCENARIO_NOT_READY', 'Compiler, fixtures and branch coverage must pass before release.', report);
      const released = await client.query(`INSERT INTO scenario_releases(scenario_id, revision, definition, validation_report, simulation_report, created_by)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${releaseColumns}`, [id, current.revision, current.definition, report.validationReport, report, actor]);
      await audit(client, id, current.revision, actor, 'RELEASE', report);
      return { created: true, row: released.rows[0] };
    });
    res.status(result.created ? 201 : 200).json(result.row);
  });
  router.post('/admin/scenarios/:id/simulations', async (req, res) => {
    const result = await db.platformAdmin(readBearerToken(req.headers.authorization), async client => {
      const id = parse(z.uuid(), req.params.id);
      const input = parse(expected, req.body);
      const current = await readDraft(client, id);
      if (current.revision !== input.expectedRevision) throw new HttpError(409, 'STALE_REVISION', 'Simulate the current draft revision.');
      return { scenarioId: id, revision: current.revision,
        report: simulateWorkflow({ workflow: current.definition.workflow, fixtures: current.definition.fixtures }) };
    });
    res.json(result);
  });
  router.get('/admin/scenarios/:id/audit', async (req, res) => {
    const result = await db.platformAdmin(readBearerToken(req.headers.authorization), async client => {
      const id = parse(z.uuid(), req.params.id);
      await readDraft(client, id);
      const { page, pageSize } = parse(pagination, req.query);
      const rows = await client.query('SELECT id, revision, actor_id AS "actorId", action, details, created_at AS "createdAt" FROM scenario_audit WHERE scenario_id = $1 ORDER BY id LIMIT $2 OFFSET $3', [id, pageSize, (page - 1) * pageSize]);
      const count = await client.query('SELECT count(*)::integer AS total FROM scenario_audit WHERE scenario_id = $1', [id]);
      return { data: rows.rows, pagination: { page, pageSize, totalItems: count.rows[0].total, totalPages: Math.ceil(count.rows[0].total / pageSize) } };
    });
    res.json(result);
  });
  router.get('/scenarios', async (req, res) => {
    const result = await db.authenticated(readBearerToken(req.headers.authorization), async client => {
      const { page, pageSize } = parse(pagination, req.query);
      const rows = await client.query(`SELECT scenario_id AS "scenarioId", revision, definition->>'name' AS name,
        definition->>'description' AS description, created_at AS "createdAt"
        FROM scenario_releases ORDER BY scenario_id, revision LIMIT $1 OFFSET $2`, [pageSize, (page - 1) * pageSize]);
      const count = await client.query('SELECT count(*)::integer AS total FROM scenario_releases');
      return { data: rows.rows, pagination: { page, pageSize, totalItems: count.rows[0].total, totalPages: Math.ceil(count.rows[0].total / pageSize) } };
    });
    res.json(result);
  });
  router.get('/scenarios/:id/releases/:revision', async (req, res) => {
    const row = await db.authenticated(readBearerToken(req.headers.authorization), async client => {
      const id = parse(z.uuid(), req.params.id);
      const releaseRevision = parse(z.coerce.number().int().min(1).max(2147483647), req.params.revision);
      const result = await client.query(`SELECT ${releaseColumns} FROM scenario_releases WHERE scenario_id = $1 AND revision = $2`, [id, releaseRevision]);
      if (!result.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Released scenario not found.');
      return result.rows[0];
    });
    res.json(row);
  });
  return router;
}
