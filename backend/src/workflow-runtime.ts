import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { Database, HttpError } from './database.ts';
import { executeLocalCapability, getCapability } from './capabilities.ts';
import type { Scalar } from './capabilities.ts';
import { workflowSchema } from './workflow-compiler.ts';
import { loadAttempt, recordDecision } from './cod-store.ts';

export class RunFailure extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; }
}
interface Context { phoneNumberId: string; client: PoolClient; tenantId: string; runId: string; nodeId: string; actor: string; event: Record<string, Scalar> }
type Effect = (context: Context, inputs: Record<string, Scalar>) => Promise<Record<string, Scalar>>;

function deterministicId(...parts: string[]) {
  const hex = createHash('sha256').update(parts.join(':')).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
async function decide(context: Context, inputs: Record<string, Scalar>, decision: 'CONFIRM' | 'DECLINE') {
  const phone = String(context.event.customerPhone);
  const conversation = await context.client.query('SELECT id FROM conversations WHERE tenant_id = $1 AND customer_reference = ANY($2) ORDER BY created_at DESC LIMIT 1',
    [context.tenantId, [`+${phone}`, phone]]);
  if (!conversation.rowCount) throw new RunFailure('NO_CONVERSATION');
  const pending = await context.client.query("SELECT id FROM order_attempts WHERE tenant_id = $1 AND conversation_id = $2 AND status = 'PENDING'",
    [context.tenantId, conversation.rows[0].id]);
  if (!pending.rowCount) throw new RunFailure('NO_PENDING_ORDER');
  const attempt = await loadAttempt(context.client, context.tenantId, pending.rows[0].id);
  try {
    const result = await recordDecision(context.client, context.tenantId, attempt.id, {
      id: deterministicId(context.tenantId, context.runId, context.nodeId), expectedRevision: attempt.revision, summaryHash: attempt.summaryHash,
      decision, evidence: String(inputs.evidence).trim().slice(0, 500) || 'WhatsApp reply' }, context.actor);
    return result.row as { orderId: string | null; status: string };
  } catch (error) {
    if (error instanceof HttpError) throw new RunFailure(error.code);
    throw error;
  }
}
// Registered side-effecting actions. Each runs inside the step transaction that journals it.
const effects: Record<string, Effect> = {
  // Records the intent only; the outbox sender delivers it. One row per run and node makes replays harmless.
  'whatsapp.reply': async (context, inputs) => {
    const text = String(inputs.text).trim().slice(0, 4096);
    if (!text) throw new RunFailure('EMPTY_REPLY');
    await context.client.query(`INSERT INTO whatsapp_outbox(tenant_id, id, run_id, node_id, phone_number_id, to_phone, body)
      VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (tenant_id, run_id, node_id) DO NOTHING`,
    [context.tenantId, deterministicId(context.tenantId, context.runId, context.nodeId, 'outbox'), context.runId, context.nodeId,
      context.phoneNumberId, String(context.event.customerPhone), text]);
    return { status: 'QUEUED' };
  },
  'cod.order.confirm': async (context, inputs) => ({ orderId: (await decide(context, inputs, 'CONFIRM')).orderId ?? '' }),
  'cod.order.decline': async (context, inputs) => ({ status: (await decide(context, inputs, 'DECLINE')).status }),
};

// Executes one node and journals it atomically. Returns true when the run reached its end node.
async function runStep(client: PoolClient, tenantId: string, runId: string, actor: string): Promise<boolean> {
  const run = await client.query(`SELECT r.status, r.message_id, p.manifest FROM workflow_runs r
    JOIN workflow_publications p ON p.tenant_id = r.tenant_id AND p.id = r.publication_id
    WHERE r.tenant_id = $1 AND r.id = $2 FOR UPDATE OF r`, [tenantId, runId]);
  if (!run.rowCount || run.rows[0].status !== 'RUNNING') return true;
  const workflow = workflowSchema.parse(run.rows[0].manifest.workflow);
  const nodes = new Map(workflow.nodes.map(node => [node.id, node]));
  const edges = new Map(workflow.edges.map(edge => [`${edge.from}:${edge.route}`, edge]));
  const steps = (await client.query('SELECT node_id, route, outputs FROM workflow_run_steps WHERE tenant_id = $1 AND run_id = $2 ORDER BY seq', [tenantId, runId])).rows;
  const outputs = new Map<string, Record<string, Scalar>>(steps.map(step => [step.node_id, step.outputs]));
  let current;
  if (!steps.length) current = workflow.nodes.find(node => getCapability(node.capability.name, node.capability.version)!.family === 'trigger');
  else {
    const last = steps[steps.length - 1];
    const edge = last.route ? edges.get(`${last.node_id}:${last.route}`) : undefined;
    current = edge ? nodes.get(edge.to) : undefined;
  }
  if (!current) throw new RunFailure('WORKFLOW_STATE_INVALID');
  const message = await client.query('SELECT body, customer_phone, phone_number_id FROM whatsapp_messages WHERE tenant_id = $1 AND message_id = $2', [tenantId, run.rows[0].message_id]);
  if (!message.rowCount) throw new RunFailure('MESSAGE_MISSING');
  const event: Record<string, Scalar> = { text: message.rows[0].body ?? '', customerPhone: message.rows[0].customer_phone };
  const inputs: Record<string, Scalar> = Object.fromEntries(Object.entries(current.inputs).map(([key, binding]) => [key,
    binding.kind === 'literal' ? binding.value : outputs.get(binding.nodeId)?.[binding.field] as Scalar]));
  const { name, version } = current.capability;
  const effect = effects[name];
  const isTrigger = getCapability(name, version)!.family === 'trigger';
  let result;
  try {
    if (effect) {
      // Validate inputs against the same contract first; the real effect then supplies the outputs.
      executeLocalCapability(name, version, inputs);
      result = { outputs: await effect({ client, tenantId, runId, nodeId: current.id, actor, event, phoneNumberId: message.rows[0].phone_number_id }, inputs), route: 'next' as 'next' | 'match' | 'default' | null };
    } else result = executeLocalCapability(name, version, inputs, isTrigger ? event : {});
  } catch (error) {
    if (error instanceof RunFailure || error instanceof HttpError) throw error;
    throw new RunFailure('NODE_EXECUTION_FAILED');
  }
  await client.query('INSERT INTO workflow_run_steps(tenant_id, run_id, seq, node_id, route, outputs) VALUES ($1, $2, $3, $4, $5, $6)',
    [tenantId, runId, steps.length, current.id, result.route, result.outputs]);
  if (result.route === null) {
    await client.query("UPDATE workflow_runs SET status = 'SUCCEEDED', reason = $3, lease_until = NULL, updated_at = clock_timestamp() WHERE tenant_id = $1 AND id = $2",
      [tenantId, runId, String(inputs.reason ?? '').slice(0, 4000)]);
    return true;
  }
  await client.query("UPDATE workflow_runs SET lease_until = clock_timestamp() + interval '60 seconds', updated_at = clock_timestamp() WHERE tenant_id = $1 AND id = $2", [tenantId, runId]);
  return false;
}

export async function processRun(db: Database, claim: { tenantId: string; runId: string; actingUser: string }) {
  for (let guard = 0; guard < 101; guard++) {
    try {
      if (await db.actingAs(claim.actingUser, client => runStep(client, claim.tenantId, claim.runId, claim.actingUser))) return;
    } catch (error) {
      if (error instanceof RunFailure || error instanceof HttpError) {
        const code = error.code;
        await db.actingAs(claim.actingUser, client => client.query(
          "UPDATE workflow_runs SET status = 'FAILED', error_code = $3, lease_until = NULL, updated_at = clock_timestamp() WHERE tenant_id = $1 AND id = $2 AND status = 'RUNNING'",
          [claim.tenantId, claim.runId, code.slice(0, 80)]));
        return;
      }
      return; // Transient failure: the lease expires and the run is claimed again, resuming from the journal.
    }
  }
  await db.actingAs(claim.actingUser, client => client.query(
    "UPDATE workflow_runs SET status = 'FAILED', error_code = 'STEP_LIMIT', lease_until = NULL, updated_at = clock_timestamp() WHERE tenant_id = $1 AND id = $2 AND status = 'RUNNING'",
    [claim.tenantId, claim.runId]));
}

// Claims and processes one queued or expired-lease run. Returns false when the queue is empty.
export async function processNextRun(db: Database): Promise<boolean> {
  const claimed = await db.pool.query('SELECT tenant_id AS "tenantId", run_id AS "runId", acting_user AS "actingUser" FROM claim_workflow_run()');
  if (!claimed.rowCount) return false;
  await processRun(db, claimed.rows[0]);
  return true;
}
export function startWorkflowRunner(db: Database, intervalMs = 2000) {
  let stopped = false;
  const done = (async () => {
    while (!stopped) {
      let worked = false;
      try { worked = await processNextRun(db); } catch { /* keep polling; leases protect in-flight runs */ }
      if (!worked) await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  })();
  return { stop: async () => { stopped = true; await done; } };
}
