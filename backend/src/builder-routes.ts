import { Router } from 'express';
import type { Request } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { Database, HttpError } from './database.ts';
import { readBearerToken } from './auth.ts';
import { appendRevision, approvalColumns, draftContentSchema, draftPaginationSchema, expectedRevisionSchema,
  loadDraft, parseBuilder, requireRevision, requireTenant, reviewDraft, simulateDraft, validateDraftContent, SIMULATOR_VERSION } from './builder.ts';
import { resolveScenario } from './scenario-contracts.ts';

const createSchema = z.strictObject({ id: z.uuid(), scenarioId: z.uuid(),
  scenarioRevision: expectedRevisionSchema.shape.expectedRevision, content: draftContentSchema });
const simulationColumns = 'tenant_id AS "tenantId", draft_id AS "draftId", revision, simulator_version AS "simulatorVersion", revision_hash AS "revisionHash", report, created_by AS "createdBy", created_at AS "createdAt"';

export function builderRoutes(db: Database) {
  const router = Router();
  const base = '/tenants/:tenantId/drafts';
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  function tenantRequest<T>(req: Request, owner: boolean, work: (client: PoolClient, tenantId: string, actor: string) => Promise<T>) {
    return db.authenticated(readBearerToken(req.headers.authorization), async (client, actor) => {
      const tenantId = parseBuilder(z.uuid(), req.params.tenantId);
      await requireTenant(client, tenantId, owner);
      return work(client, tenantId, actor);
    });
  }
  router.post(base, async (req, res) => {
    const result = await tenantRequest(req, true, async (client, tenantId, actor) => {
      const input = parseBuilder(createSchema, req.body);
      const released = await client.query('SELECT definition FROM scenario_releases WHERE scenario_id = $1 AND revision = $2', [input.scenarioId, input.scenarioRevision]);
      if (!released.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Released scenario not found.');
      resolveScenario(released.rows[0].definition, input.content.parameters ?? {});
      const inserted = await client.query(`INSERT INTO builder_drafts(tenant_id, id, scenario_id, scenario_revision, initial_intent, created_by)
        VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (tenant_id, id) DO NOTHING RETURNING id`, [tenantId, input.id, input.scenarioId, input.scenarioRevision, input, actor]);
      if (inserted.rowCount) {
        await appendRevision(client, { tenantId, id: input.id, scenarioId: input.scenarioId, scenarioRevision: input.scenarioRevision, revision: 1, content: input.content }, actor);
      } else {
        const replay = await client.query('SELECT 1 FROM builder_drafts WHERE tenant_id = $1 AND id = $2 AND initial_intent = $3::jsonb', [tenantId, input.id, input]);
        if (!replay.rowCount) throw new HttpError(409, 'DRAFT_ID_REUSED', 'This draft ID was used with a different setup.');
      }
      return { created: Boolean(inserted.rowCount), row: await reviewDraft(client, await loadDraft(client, tenantId, input.id)) };
    });
    res.status(result.created ? 201 : 200).json(result.row);
  });
  router.get(base, async (req, res) => {
    res.json(await tenantRequest(req, false, async (client, tenantId) => {
      const { page, pageSize } = parseBuilder(draftPaginationSchema, req.query);
      const rows = await client.query(`SELECT d.id, d.current_revision AS revision, d.scenario_id AS "scenarioId",
        d.scenario_revision AS "scenarioRevision", r.content->>'name' AS name, d.updated_at AS "updatedAt"
        FROM builder_drafts d JOIN draft_revisions r ON r.tenant_id = d.tenant_id AND r.draft_id = d.id AND r.revision = d.current_revision
        WHERE d.tenant_id = $1 ORDER BY d.id LIMIT $2 OFFSET $3`, [tenantId, pageSize, (page - 1) * pageSize]);
      const count = await client.query('SELECT count(*)::integer AS total FROM builder_drafts WHERE tenant_id = $1', [tenantId]);
      return { data: rows.rows, pagination: { page, pageSize, totalItems: count.rows[0].total, totalPages: Math.ceil(count.rows[0].total / pageSize) } };
    }));
  });
  router.get(base + '/:id', async (req, res) => {
    res.json(await tenantRequest(req, false, async (client, tenantId) => reviewDraft(client, await loadDraft(client, tenantId, parseBuilder(z.uuid(), req.params.id)))));
  });
  router.put(base + '/:id', async (req, res) => {
    res.json(await tenantRequest(req, true, async (client, tenantId, actor) => {
      const id = parseBuilder(z.uuid(), req.params.id);
      const input = parseBuilder(expectedRevisionSchema.extend({ content: draftContentSchema }), req.body);
      const draft = await loadDraft(client, tenantId, id, true);
      requireRevision(draft, input.expectedRevision);
      await validateDraftContent(client, draft, input.content);
      await client.query('UPDATE builder_drafts SET current_revision = current_revision + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
      await appendRevision(client, { ...draft, revision: draft.revision + 1, content: input.content }, actor);
      return reviewDraft(client, await loadDraft(client, tenantId, id));
    }));
  });
  router.get(base + '/:id/revisions', async (req, res) => {
    res.json(await tenantRequest(req, false, async (client, tenantId) => {
      const id = parseBuilder(z.uuid(), req.params.id);
      await loadDraft(client, tenantId, id);
      const { page, pageSize } = parseBuilder(draftPaginationSchema, req.query);
      const rows = await client.query(`SELECT revision, content, revision_hash AS "revisionHash", created_by AS "createdBy", created_at AS "createdAt"
        FROM draft_revisions WHERE tenant_id = $1 AND draft_id = $2 ORDER BY revision LIMIT $3 OFFSET $4`, [tenantId, id, pageSize, (page - 1) * pageSize]);
      const count = await client.query('SELECT count(*)::integer AS total FROM draft_revisions WHERE tenant_id = $1 AND draft_id = $2', [tenantId, id]);
      return { data: rows.rows, pagination: { page, pageSize, totalItems: count.rows[0].total, totalPages: Math.ceil(count.rows[0].total / pageSize) } };
    }));
  });
  router.post(base + '/:id/simulations', async (req, res) => {
    const result = await tenantRequest(req, true, async (client, tenantId, actor) => {
      const draft = await loadDraft(client, tenantId, parseBuilder(z.uuid(), req.params.id), true);
      requireRevision(draft, parseBuilder(expectedRevisionSchema, req.body).expectedRevision);
      const report = await simulateDraft(client, draft);
      const keys = [tenantId, draft.id, draft.revision, SIMULATOR_VERSION];
      const existing = await client.query(`SELECT ${simulationColumns}, report = $5::jsonb AS matches FROM draft_simulations
        WHERE tenant_id = $1 AND draft_id = $2 AND revision = $3 AND simulator_version = $4`, [...keys, report]);
      if (existing.rowCount) {
        const { matches, ...row } = existing.rows[0];
        if (!matches) throw new HttpError(409, 'SIMULATOR_CHANGED', 'Simulation semantics changed; a new simulator version is required.');
        return { created: false, row };
      }
      const inserted = await client.query(`INSERT INTO draft_simulations(tenant_id, draft_id, revision, simulator_version, revision_hash, report, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${simulationColumns}`, [...keys, draft.revisionHash, report, actor]);
      return { created: true, row: inserted.rows[0] };
    });
    res.status(result.created ? 201 : 200).json(result.row);
  });
  router.post(base + '/:id/approve', async (req, res) => {
    const result = await tenantRequest(req, true, async (client, tenantId, actor) => {
      const draft = await loadDraft(client, tenantId, parseBuilder(z.uuid(), req.params.id), true);
      requireRevision(draft, parseBuilder(expectedRevisionSchema, req.body).expectedRevision);
      const report = await simulateDraft(client, draft);
      const keys = [tenantId, draft.id, draft.revision, SIMULATOR_VERSION];
      const simulation = await client.query(`SELECT report, report = $5::jsonb AS matches FROM draft_simulations
        WHERE tenant_id = $1 AND draft_id = $2 AND revision = $3 AND simulator_version = $4 AND revision_hash = $6`, [...keys, report, draft.revisionHash]);
      if (!simulation.rowCount) throw new HttpError(409, 'SIMULATION_REQUIRED', 'Simulate this draft revision before approval.');
      if (!report.valid || !simulation.rows[0].report.valid) throw new HttpError(422, 'DRAFT_NOT_READY', 'The draft must pass its scenario fixtures before approval.', report);
      if (!simulation.rows[0].matches) throw new HttpError(409, 'SIMULATOR_CHANGED', 'Simulation semantics changed; a new simulator version is required.');
      const existing = await client.query(`SELECT ${approvalColumns} FROM draft_approvals WHERE tenant_id = $1 AND draft_id = $2 AND revision = $3 AND simulator_version = $4`, keys);
      if (existing.rowCount) return { created: false, row: existing.rows[0] };
      const inserted = await client.query(`INSERT INTO draft_approvals(tenant_id, draft_id, revision, simulator_version, revision_hash, approved_by)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${approvalColumns}`, [...keys, draft.revisionHash, actor]);
      return { created: true, row: inserted.rows[0] };
    });
    res.status(result.created ? 201 : 200).json(result.row);
  });
  return router;
}
