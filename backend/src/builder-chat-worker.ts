import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { Database } from './database.ts';
import { AiFailure, BUILDER_PROMPT_VERSION, catalogForModel, validateExtraction } from './builder-ai.ts';
import type { AiCatalogEntry, BuilderAiInput, BuilderAiProvider, BuilderAiResponse, BuilderAiResult } from './builder-ai.ts';

interface Job { tenant_id: string; session_id: string; id: string; revision: number; text: string; requested_model: string | null; prompt_version: string; created_by: string; leaseId: string }
async function ownerStillActive(client: PoolClient, job: Job) {
  await client.query("SELECT set_config('app.user_id', $1, true)", [job.created_by]);
  const role = await client.query("SELECT 1 FROM memberships WHERE tenant_id = $1 AND user_id = $2 AND role = 'OWNER'", [job.tenant_id, job.created_by]);
  return Boolean(role.rowCount);
}
async function prepare(db: Database, job: Job) {
  return db.transaction(async client => {
    if (!await ownerStillActive(client, job)) throw new AiFailure('AUTHORIZATION_REVOKED');
    if (job.prompt_version !== BUILDER_PROMPT_VERSION) throw new AiFailure('PROMPT_VERSION_CHANGED');
    const session = await client.query('SELECT language, consent_to_openai, consent_to_mcp FROM builder_chat_sessions WHERE tenant_id = $1 AND id = $2', [job.tenant_id, job.session_id]);
    if (!session.rowCount || !session.rows[0].consent_to_openai) throw new AiFailure('CONSENT_REQUIRED');
    const history = await client.query<{ text: string; result: BuilderAiResult }>(`SELECT text, result FROM builder_chat_turns
      WHERE tenant_id = $1 AND session_id = $2 AND revision < $3 AND status = 'SUCCEEDED' ORDER BY revision DESC LIMIT 5`, [job.tenant_id, job.session_id, job.revision]);
    const releases = await client.query<AiCatalogEntry>(`SELECT DISTINCT ON (scenario_id) scenario_id AS "scenarioId", revision, definition
      FROM scenario_releases ORDER BY scenario_id, revision DESC LIMIT 21`);
    const catalog = catalogForModel(releases.rows);
    const input: BuilderAiInput = { language: session.rows[0].language, message: job.text, consentToMcp: session.rows[0].consent_to_mcp === true,
      ...(job.requested_model ? { model: job.requested_model } : {}),
      history: history.rows.reverse().map(row => ({ message: row.text, result: row.result })), catalog };
    if (Buffer.byteLength(JSON.stringify(input)) > 32000) throw new AiFailure('CONTEXT_LIMIT');
    const saved = await client.query(`UPDATE builder_chat_turns SET catalog_snapshot = $5 WHERE tenant_id = $1 AND session_id = $2 AND id = $3
      AND status = 'RUNNING' AND lease_id = $4 AND lease_expires_at > clock_timestamp() RETURNING id`, [job.tenant_id, job.session_id, job.id, job.leaseId, JSON.stringify(catalog)]);
    if (!saved.rowCount) throw new AiFailure('LEASE_LOST');
    return { input, catalog: releases.rows };
  });
}

// A single provider attempt per durable turn. Ambiguous/exhausted leases are never requeued.
export async function processBuilderTurn(db: Database, provider: BuilderAiProvider, signal?: AbortSignal): Promise<boolean> {
  signal?.throwIfAborted();
  await db.pool.query(`UPDATE builder_chat_turns SET status = 'FAILED', error_code = 'MODEL_OUTCOME_UNKNOWN', completed_at = now()
    WHERE status = 'RUNNING' AND lease_expires_at <= clock_timestamp()`);
  await db.pool.query(`UPDATE builder_chat_turns SET status = 'FAILED', error_code = 'REQUEST_EXPIRED', completed_at = now()
    WHERE status = 'QUEUED' AND created_at < date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`);
  const job = await db.transaction(async client => {
    const selected = await client.query<Omit<Job, 'leaseId'>>(`SELECT tenant_id, session_id, id, revision, text, requested_model, prompt_version, created_by
      FROM builder_chat_turns WHERE status = 'QUEUED' ORDER BY created_at, tenant_id, session_id, id LIMIT 1 FOR UPDATE SKIP LOCKED`);
    if (!selected.rowCount) return null;
    const row = selected.rows[0]!; const leaseId = randomUUID();
    await client.query("UPDATE builder_chat_turns SET status = 'RUNNING', lease_id = $4, lease_expires_at = clock_timestamp() + interval '60 seconds' WHERE tenant_id = $1 AND session_id = $2 AND id = $3", [row.tenant_id, row.session_id, row.id, leaseId]);
    return { ...row, leaseId };
  });
  if (!job) return false;
  let response: BuilderAiResponse | undefined; let result: BuilderAiResult | null = null; let errorCode: string | null = null;
  try {
    const context = await prepare(db, job);
    response = await provider.infer(context.input, signal);
    result = validateExtraction(response.extraction, context.catalog);
  } catch (error) {
    errorCode = error instanceof AiFailure ? error.code : 'BUILDER_PROCESSING_FAILED';
  }
  await db.transaction(async client => {
    if (!await ownerStillActive(client, job)) { errorCode = 'AUTHORIZATION_REVOKED'; result = null; }
    await client.query(`UPDATE builder_chat_turns SET status = $5, result = $6, error_code = $7, usage = $8, provider_metadata = $9, completed_at = now()
      WHERE tenant_id = $1 AND session_id = $2 AND id = $3 AND lease_id = $4 AND status = 'RUNNING' AND lease_expires_at > clock_timestamp()`,
    [job.tenant_id, job.session_id, job.id, job.leaseId, errorCode ? 'FAILED' : 'SUCCEEDED', result, errorCode,
      response?.usage ?? null, response ? { responseId: response.responseId, model: response.model } : null]);
  });
  return true;
}
