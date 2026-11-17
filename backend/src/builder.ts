import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { HttpError } from './database.ts';
import { simulateWorkflow } from './simulator.ts';
import { parameterValuesSchema, resolveScenario } from './scenario-contracts.ts';

// Bump when simulation semantics change; old reports/approvals remain historical evidence.
export const SIMULATOR_VERSION = 'local-1.1.0';
export const draftContentSchema = z.strictObject({ name: z.string().trim().min(1).max(120),
  goal: z.string().trim().min(1).max(4000), language: z.enum(['darija', 'fr']), parameters: parameterValuesSchema.optional() });
export const expectedRevisionSchema = z.strictObject({ expectedRevision: z.number().int().min(1).max(2147483646) });
export const draftPaginationSchema = z.strictObject({ page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50) });
export function parseBuilder<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new HttpError(422, 'INVALID_INPUT', 'Check the draft request fields.');
  return parsed.data;
}
interface Snapshot {
  tenantId: string; draftId: string; revision: number; scenarioId: string; scenarioRevision: number;
  content: z.infer<typeof draftContentSchema>;
}
export function revisionHash(snapshot: Snapshot): string {
  const { tenantId, draftId, revision, scenarioId, scenarioRevision, content } = snapshot;
  return createHash('sha256').update(JSON.stringify({ tenantId, draftId, revision, scenarioId, scenarioRevision,
    content: { name: content.name, goal: content.goal, language: content.language,
      ...(content.parameters === undefined ? {} : { parameters: Object.fromEntries(Object.entries(content.parameters).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) }) } })).digest('hex');
}
export interface DraftRecord {
  id: string; tenantId: string; revision: number; scenarioId: string; scenarioRevision: number;
  content: z.infer<typeof draftContentSchema>; revisionHash: string; editedBy: string; updatedAt: Date;
}
export async function requireTenant(client: PoolClient, tenantId: string, owner: boolean) {
  const member = await client.query('SELECT role FROM memberships WHERE tenant_id = $1', [tenantId]);
  if (!member.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Business not found.');
  if (owner && member.rows[0].role !== 'OWNER') throw new HttpError(403, 'FORBIDDEN', 'Only an owner can change or approve a draft.');
}
export async function loadDraft(client: PoolClient, tenantId: string, id: string, lock = false): Promise<DraftRecord> {
  if (lock) {
    // Lock the head alone; a joined revision can disappear from the lock query's
    // original snapshot while waiting for a competing edit to commit.
    const head = await client.query('SELECT id FROM builder_drafts WHERE tenant_id = $1 AND id = $2 FOR UPDATE', [tenantId, id]);
    if (!head.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Draft not found.');
  }
  const result = await client.query<DraftRecord>(`SELECT d.id, d.tenant_id AS "tenantId", d.current_revision AS revision,
    d.scenario_id AS "scenarioId", d.scenario_revision AS "scenarioRevision", d.updated_at AS "updatedAt",
    r.content, r.revision_hash AS "revisionHash", r.created_by AS "editedBy"
    FROM builder_drafts d JOIN draft_revisions r ON r.tenant_id = d.tenant_id AND r.draft_id = d.id AND r.revision = d.current_revision
    WHERE d.tenant_id = $1 AND d.id = $2`, [tenantId, id]);
  if (!result.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Draft not found.');
  return result.rows[0]!;
}
export async function appendRevision(client: PoolClient, draft: Omit<DraftRecord, 'revisionHash' | 'editedBy' | 'updatedAt'>, actor: string) {
  const hash = revisionHash({ ...draft, draftId: draft.id });
  await client.query('INSERT INTO draft_revisions(tenant_id, draft_id, revision, content, revision_hash, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
    [draft.tenantId, draft.id, draft.revision, draft.content, hash, actor]);
}
export const approvalColumns = 'tenant_id AS "tenantId", draft_id AS "draftId", revision, simulator_version AS "simulatorVersion", revision_hash AS "revisionHash", approved_by AS "approvedBy", approved_at AS "approvedAt"';
export async function reviewDraft(client: PoolClient, draft: DraftRecord) {
  const keys = [draft.tenantId, draft.id, draft.revision, SIMULATOR_VERSION];
  const approval = await client.query(`SELECT ${approvalColumns} FROM draft_approvals WHERE tenant_id = $1 AND draft_id = $2 AND revision = $3 AND simulator_version = $4`, keys);
  const simulation = await client.query('SELECT report FROM draft_simulations WHERE tenant_id = $1 AND draft_id = $2 AND revision = $3 AND simulator_version = $4', keys);
  const scenario = await client.query('SELECT definition FROM scenario_releases WHERE scenario_id = $1 AND revision = $2', [draft.scenarioId, draft.scenarioRevision]);
  const resolved = resolveScenario(scenario.rows[0].definition, draft.content.parameters ?? {});
  return { ...draft, scenarioDefinition: scenario.rows[0].definition, simulatorVersion: SIMULATOR_VERSION,
    effectiveWorkflow: resolved.workflow, effectiveFixtures: resolved.fixtures, effectiveParameters: resolved.parameters,
    simulation: simulation.rows[0]?.report ?? null, approval: approval.rows[0] ?? null };
}
export async function simulateDraft(client: PoolClient, draft: DraftRecord) {
  const release = await client.query('SELECT definition FROM scenario_releases WHERE scenario_id = $1 AND revision = $2', [draft.scenarioId, draft.scenarioRevision]);
  const resolved = resolveScenario(release.rows[0].definition, draft.content.parameters ?? {});
  return simulateWorkflow({ workflow: resolved.workflow, fixtures: resolved.fixtures });
}
export async function validateDraftContent(client: PoolClient, draft: DraftRecord, content: z.infer<typeof draftContentSchema>) {
  const release = await client.query('SELECT definition FROM scenario_releases WHERE scenario_id = $1 AND revision = $2', [draft.scenarioId, draft.scenarioRevision]);
  resolveScenario(release.rows[0].definition, content.parameters ?? {});
}
export function requireRevision(draft: DraftRecord, expected: number) {
  if (draft.revision !== expected) throw new HttpError(409, 'STALE_REVISION', 'Reload the current draft revision.');
}
