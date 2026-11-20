import { createHash } from 'node:crypto';
import { Router } from 'express';
import type { Request } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { Database, HttpError } from './database.ts';
import { readBearerToken } from './auth.ts';
import { validateGenerated } from './workflow-generator.ts';
import { draftPaginationSchema, expectedRevisionSchema, loadDraft, parseBuilder, requireRevision, requireTenant, reviewDraft, SIMULATOR_VERSION } from './builder.ts';

const publishSchema = z.union([
  z.strictObject({ id: z.uuid(), draftId: z.uuid(), expectedRevision: expectedRevisionSchema.shape.expectedRevision, whatsappNumberId: z.uuid() }),
  z.strictObject({ id: z.uuid(), generatedWorkflowId: z.uuid(), whatsappNumberId: z.uuid() }),
]);
const columns = `id, generated_workflow_id AS "generatedWorkflowId", draft_id AS "draftId", draft_revision AS "draftRevision", scenario_id AS "scenarioId", scenario_revision AS "scenarioRevision",
  whatsapp_number_id AS "whatsappNumberId", manifest_hash AS "manifestHash", status, published_by AS "publishedBy", published_at AS "publishedAt", updated_at AS "updatedAt"`;
const page = (rows: unknown[], p: { page: number; pageSize: number }, total: number) =>
  ({ data: rows, pagination: { page: p.page, pageSize: p.pageSize, totalItems: total, totalPages: Math.ceil(total / p.pageSize) } });

export function workflowPublicationRoutes(db: Database) {
  const router = Router();
  const base = '/tenants/:tenantId';
  router.use(base, (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  function scoped<T>(req: Request, owner: boolean, work: (client: PoolClient, tenantId: string, actor: string) => Promise<T>) {
    return db.authenticated(readBearerToken(req.headers.authorization), async (client, actor) => {
      const tenantId = parseBuilder(z.uuid(), req.params.tenantId);
      await requireTenant(client, tenantId, owner);
      return work(client, tenantId, actor);
    });
  }
  router.post(base + '/publications', async (req, res) => {
    const result = await scoped(req, true, async (client, tenantId, actor) => {
      const input = parseBuilder(publishSchema, req.body);
      const existing = await client.query(`SELECT ${columns} FROM workflow_publications WHERE tenant_id = $1 AND id = $2`, [tenantId, input.id]);
      if (existing.rowCount) {
        const row = existing.rows[0];
        const same = 'generatedWorkflowId' in input
          ? row.generatedWorkflowId === input.generatedWorkflowId
          : row.draftId === input.draftId && row.draftRevision === input.expectedRevision;
        if (!same || row.whatsappNumberId !== input.whatsappNumberId) throw new HttpError(409, 'PUBLICATION_ID_REUSED', 'This publication ID was used with different details.');
        return { status: 200, row };
      }
      const number = await client.query('SELECT 1 FROM whatsapp_numbers WHERE tenant_id = $1 AND id = $2', [tenantId, input.whatsappNumberId]);
      if (!number.rowCount) throw new HttpError(404, 'NOT_FOUND', 'WhatsApp number not found.');
      let source: { draftId: string | null; draftRevision: number | null; scenarioId: string | null; scenarioRevision: number | null; generatedWorkflowId: string | null };
      let manifest: Record<string, unknown>;
      if ('generatedWorkflowId' in input) {
        const generated = await client.query('SELECT workflow, fixtures, approved_at FROM generated_workflows WHERE tenant_id = $1 AND id = $2', [tenantId, input.generatedWorkflowId]);
        if (!generated.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Generated workflow not found.');
        if (!generated.rows[0].approved_at) throw new HttpError(409, 'APPROVAL_REQUIRED', 'Approve this generated workflow before publishing.');
        // Re-validate at publication so a changed capability catalog cannot publish a stale workflow.
        const checked = validateGenerated({ workflow: generated.rows[0].workflow, fixtures: generated.rows[0].fixtures });
        if (checked.status !== 'READY' || !checked.workflow) throw new HttpError(422, 'NOT_PUBLISHABLE', 'This workflow no longer passes validation.');
        manifest = { schemaVersion: 1, generatedWorkflowId: input.generatedWorkflowId, workflow: checked.workflow };
        source = { draftId: null, draftRevision: null, scenarioId: null, scenarioRevision: null, generatedWorkflowId: input.generatedWorkflowId };
      } else {
        const draft = await loadDraft(client, tenantId, input.draftId, true);
        requireRevision(draft, input.expectedRevision);
        const approval = await client.query('SELECT 1 FROM draft_approvals WHERE tenant_id = $1 AND draft_id = $2 AND revision = $3 AND simulator_version = $4 AND revision_hash = $5',
          [tenantId, draft.id, draft.revision, SIMULATOR_VERSION, draft.revisionHash]);
        if (!approval.rowCount) throw new HttpError(409, 'APPROVAL_REQUIRED', 'Approve this exact draft revision before publishing.');
        const review = await reviewDraft(client, draft);
        manifest = { schemaVersion: 1, scenarioId: draft.scenarioId, scenarioRevision: draft.scenarioRevision, draftId: draft.id,
          draftRevision: draft.revision, revisionHash: draft.revisionHash, parameters: review.effectiveParameters, workflow: review.effectiveWorkflow };
        source = { draftId: draft.id, draftRevision: draft.revision, scenarioId: draft.scenarioId, scenarioRevision: draft.scenarioRevision, generatedWorkflowId: null };
      }
      const nodes = (manifest.workflow as { nodes: { capability: { name: string } }[] }).nodes;
      if (nodes.filter(node => node.capability.name === 'whatsapp.message').length !== 1) throw new HttpError(422, 'NOT_PUBLISHABLE', 'Only workflows that start from a WhatsApp message can be published.');
      const hash = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
      try {
        const inserted = await client.query(`INSERT INTO workflow_publications(tenant_id, id, draft_id, draft_revision, scenario_id, scenario_revision, generated_workflow_id, whatsapp_number_id, manifest, manifest_hash, published_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING ${columns}`,
        [tenantId, input.id, source.draftId, source.draftRevision, source.scenarioId, source.scenarioRevision, source.generatedWorkflowId, input.whatsappNumberId, manifest, hash, actor]);
        return { status: 201, row: inserted.rows[0] };
      } catch (error) {
        if ((error as { code?: string }).code === '23505') throw new HttpError(409, 'NUMBER_BUSY', 'Pause the live workflow on this number before publishing another.');
        throw error;
      }
    });
    res.status(result.status).json(result.row);
  });
  router.get(base + '/publications', async (req, res) => {
    res.json(await scoped(req, false, async (client, tenantId) => {
      const p = parseBuilder(draftPaginationSchema, req.query);
      const rows = await client.query(`SELECT ${columns} FROM workflow_publications WHERE tenant_id = $1 ORDER BY published_at DESC, id LIMIT $2 OFFSET $3`, [tenantId, p.pageSize, (p.page - 1) * p.pageSize]);
      const count = await client.query('SELECT count(*)::integer AS total FROM workflow_publications WHERE tenant_id = $1', [tenantId]);
      return page(rows.rows, p, count.rows[0].total);
    }));
  });
  router.get(base + '/publications/:id', async (req, res) => {
    res.json(await scoped(req, false, async (client, tenantId) => {
      const row = await client.query(`SELECT ${columns}, manifest FROM workflow_publications WHERE tenant_id = $1 AND id = $2`, [tenantId, parseBuilder(z.uuid(), req.params.id)]);
      if (!row.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Publication not found.');
      return row.rows[0];
    }));
  });
  for (const [action, status] of [['pause', 'PAUSED'], ['resume', 'ACTIVE']] as const) {
    router.post(base + `/publications/:id/${action}`, async (req, res) => {
      res.json(await scoped(req, true, async (client, tenantId) => {
        const id = parseBuilder(z.uuid(), req.params.id);
        try {
          const row = await client.query(`UPDATE workflow_publications SET status = $3, updated_at = clock_timestamp() WHERE tenant_id = $1 AND id = $2 RETURNING ${columns}`, [tenantId, id, status]);
          if (!row.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Publication not found.');
          return row.rows[0];
        } catch (error) {
          if ((error as { code?: string }).code === '23505') throw new HttpError(409, 'NUMBER_BUSY', 'Another workflow is live on this number.');
          throw error;
        }
      }));
    });
  }
  const runColumns = 'id, publication_id AS "publicationId", message_id AS "messageId", status, attempts, reason, error_code AS "errorCode", created_at AS "createdAt", updated_at AS "updatedAt"';
  router.get(base + '/workflow-runs', async (req, res) => {
    res.json(await scoped(req, false, async (client, tenantId) => {
      const p = parseBuilder(draftPaginationSchema, req.query);
      const rows = await client.query(`SELECT ${runColumns} FROM workflow_runs WHERE tenant_id = $1 ORDER BY created_at DESC, id LIMIT $2 OFFSET $3`, [tenantId, p.pageSize, (p.page - 1) * p.pageSize]);
      const count = await client.query('SELECT count(*)::integer AS total FROM workflow_runs WHERE tenant_id = $1', [tenantId]);
      return page(rows.rows, p, count.rows[0].total);
    }));
  });
  router.get(base + '/workflow-runs/:id', async (req, res) => {
    res.json(await scoped(req, false, async (client, tenantId) => {
      const id = parseBuilder(z.uuid(), req.params.id);
      const run = await client.query(`SELECT ${runColumns} FROM workflow_runs WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
      if (!run.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Run not found.');
      const steps = await client.query('SELECT seq, node_id AS "nodeId", route, outputs, created_at AS "createdAt" FROM workflow_run_steps WHERE tenant_id = $1 AND run_id = $2 ORDER BY seq', [tenantId, id]);
      return { ...run.rows[0], steps: steps.rows };
    }));
  });
  return router;
}
