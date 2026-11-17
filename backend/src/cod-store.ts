import type { PoolClient } from 'pg';
import { HttpError } from './database.ts';
import { COD_POLICY_VERSION, formatMad, orderSummaryHash, reviewOrder } from './cod.ts';
import type { OrderDetails } from './cod.ts';

export interface AttemptRecord {
  id: string; tenantId: string; conversationId: string; status: 'PENDING' | 'CONFIRMED' | 'DECLINED';
  revision: number; details: OrderDetails; summaryHash: string; policyVersion: string;
  language: 'darija' | 'fr'; startedAt: Date; confirmedOrderId: string | null;
}
export const attemptSelect = `SELECT a.id, a.tenant_id AS "tenantId", a.conversation_id AS "conversationId", a.status,
  a.current_revision AS revision, r.details, r.summary_hash AS "summaryHash", r.policy_version AS "policyVersion", c.language,
  a.started_at AS "startedAt", a.confirmed_order_id AS "confirmedOrderId"
  FROM order_attempts a JOIN order_attempt_revisions r ON r.tenant_id = a.tenant_id AND r.attempt_id = a.id AND r.revision = a.current_revision
  JOIN conversations c ON c.tenant_id = a.tenant_id AND c.id = a.conversation_id`;
export async function loadAttempt(client: PoolClient, tenantId: string, id: string, lock = false): Promise<AttemptRecord> {
  if (lock) {
    const head = await client.query('SELECT id FROM order_attempts WHERE tenant_id = $1 AND id = $2 FOR UPDATE', [tenantId, id]);
    // Closed heads are immutable and excluded by the UPDATE policy used for locks.
    // Ordinary SELECT still distinguishes a closed attempt from a missing one.
    if (!head.rowCount) return loadAttempt(client, tenantId, id);
  }
  const row = await client.query<AttemptRecord>(`${attemptSelect} WHERE a.tenant_id = $1 AND a.id = $2`, [tenantId, id]);
  if (!row.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Order attempt not found.');
  return row.rows[0]!;
}
export const attemptView = (attempt: AttemptRecord) => ({ ...attempt, review: reviewOrder(attempt.details, attempt.language) });
export async function appendOrderRevision(client: PoolClient, tenantId: string, attemptId: string, conversationId: string, revision: number, details: OrderDetails, actor: string) {
  const hash = orderSummaryHash({ tenantId, conversationId, attemptId }, details);
  await client.query(`INSERT INTO order_attempt_revisions(tenant_id, attempt_id, revision, details, summary_hash, policy_version, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7)`, [tenantId, attemptId, revision, details, hash, COD_POLICY_VERSION, actor]);
}
export function requirePending(attempt: AttemptRecord, expected: number) {
  if (attempt.revision !== expected) throw new HttpError(409, 'STALE_REVISION', 'Reload the current order summary.');
  if (attempt.status !== 'PENDING') throw new HttpError(409, 'ATTEMPT_CLOSED', 'This order attempt already has a final decision.');
}
export interface DecisionInput {
  id: string; expectedRevision: number; summaryHash: string; decision: 'CONFIRM' | 'DECLINE' | 'AMBIGUOUS'; evidence: string;
}
export async function recordDecision(client: PoolClient, tenantId: string, attemptId: string, input: DecisionInput, actor: string) {
  const request = { attemptId, ...input };
  // Serialize the same event ID even when callers target different attempts.
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 73910207))', [`${tenantId}:${input.id}`]);
  const previous = await client.query('SELECT outcome, request = $3::jsonb AS matches FROM order_decision_receipts WHERE tenant_id = $1 AND id = $2', [tenantId, input.id, request]);
  if (previous.rowCount) {
    if (!previous.rows[0].matches) throw new HttpError(409, 'EVENT_ID_REUSED', 'This decision ID was used with different details.');
    return { created: false, row: previous.rows[0].outcome };
  }
  const attempt = await loadAttempt(client, tenantId, attemptId, true);
  requirePending(attempt, input.expectedRevision);
  if (attempt.policyVersion !== COD_POLICY_VERSION) throw new HttpError(409, 'REVIEW_POLICY_CHANGED', 'Save and review the order under the current policy.');
  if (attempt.summaryHash !== input.summaryHash) throw new HttpError(409, 'SUMMARY_CHANGED', 'Review the current order summary before deciding.');
  const review = reviewOrder(attempt.details, attempt.language);
  let status: AttemptRecord['status'] = 'PENDING'; let orderId: string | null = null;
  if (input.decision === 'CONFIRM') {
    if (!review.ready || review.amountMinor === null) throw new HttpError(422, 'ORDER_INCOMPLETE', 'Collect the missing details and shop prices before confirmation.', review);
    status = 'CONFIRMED'; orderId = attempt.id;
    await client.query("UPDATE order_attempts SET status = 'CONFIRMED', confirmed_order_id = id WHERE tenant_id = $1 AND id = $2", [tenantId, attempt.id]);
    await client.query(`INSERT INTO orders(tenant_id, id, attempt_id, reviewed_revision, summary_hash, confirmation_event_id, details, amount_minor, policy_version, confirmed_by)
      VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9)`, [tenantId, orderId, attempt.revision, attempt.summaryHash, input.id, attempt.details, review.amountMinor, COD_POLICY_VERSION, actor]);
    await client.query(`INSERT INTO sheet_sync_requests(tenant_id, order_id, operation_key, payload, created_by)
      VALUES ($1, $2, $3, $4, $5)`, [tenantId, orderId, `cod:sheet:${orderId}`,
      { schemaVersion: 1, orderId, ...attempt.details, amountMinor: review.amountMinor, amountMad: formatMad(review.amountMinor), currency: 'MAD', status: 'CONFIRMED' }, actor]);
  } else if (input.decision === 'DECLINE') {
    status = 'DECLINED';
    await client.query("UPDATE order_attempts SET status = 'DECLINED' WHERE tenant_id = $1 AND id = $2", [tenantId, attempt.id]);
  }
  const outcome = { id: input.id, attemptId, decision: input.decision, status, orderId, reviewedRevision: attempt.revision, summaryHash: attempt.summaryHash, source: 'STAFF_RECORDED' };
  await client.query(`INSERT INTO order_decision_receipts(tenant_id, id, attempt_id, reviewed_revision, summary_hash, decision, evidence, request, outcome, order_id, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`, [tenantId, input.id, attemptId, attempt.revision, attempt.summaryHash, input.decision, input.evidence, request, outcome, orderId, actor]);
  return { created: true, row: outcome };
}
