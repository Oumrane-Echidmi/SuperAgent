import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { Database, hashToken } from '../src/database.ts';
import { createApp } from '../src/app.ts';
import { processNextRun } from '../src/workflow-runtime.ts';
import { SendFailure, processNextOutbox } from '../src/whatsapp-sender.ts';
import type { WhatsAppSender } from '../src/whatsapp-sender.ts';
import type { WorkflowGenerator } from '../src/workflow-generator.ts';

for (const key of ['DATABASE_URL', 'ADMIN_DATABASE_URL']) {
  if (!process.env[key] || new URL(process.env[key]!).pathname !== '/superagent_test') throw new Error('Dedicated test database required.');
}
const library = (name: string) => JSON.parse(readFileSync(new URL(`../examples/scenarios/${name}.json`, import.meta.url), 'utf8')) as { id: string; definition: { workflow: unknown; fixtures: unknown } };

test('replies are queued and delivered once; generated workflows are validated, approved and published', async () => {
  const db = new Database(process.env.DATABASE_URL!);
  const admin = new pg.Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
  const users = [randomUUID(), randomUUID()], tenant = randomUUID();
  const tokens = users.map(() => randomBytes(32).toString('base64url'));
  const config = { appSecret: 's'.repeat(24), verifyToken: 'v'.repeat(24) };
  const phoneNumberId = String(Math.floor(1e11 + Math.random() * 9e11));
  const support = library('support-triage'), replies = library('cod-confirmation-replies');
  const scenarioIds = [randomUUID()];
  let model: unknown = { workflow: support.definition.workflow, fixtures: support.definition.fixtures }, generatorCalls = 0;
  const generator: WorkflowGenerator = { generate: async () => { generatorCalls++; return { raw: model, model: 'fake-model' }; } };
  const server = createApp(db, { whatsapp: config, workflowGenerator: generator }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/v1`;
  const api = async (path: string, method = 'GET', body?: unknown, bearer = tokens[0]!) => {
    const res = await fetch(base + path, { method, headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, body: await res.json() };
  };
  let counter = 0;
  const send = async (text: string) => {
    const raw = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { metadata: { phone_number_id: phoneNumberId },
      messages: [{ id: `wamid.${tenant}.${counter++}`, from: '212600000000', timestamp: '1700000000', type: 'text', text: { body: text } }] } }] }] });
    const res = await fetch(base + '/webhooks/whatsapp', { method: 'POST', headers: { 'Content-Type': 'application/json',
      'X-Hub-Signature-256': 'sha256=' + createHmac('sha256', config.appSecret).update(raw).digest('hex') }, body: raw });
    assert.equal(res.status, 200);
  };
  const drain = async () => { while (await processNextRun(db)); };
  const outbox = async () => (await api(`/tenants/${tenant}/whatsapp-outbox`)).body.data as { body: string; status: string; attempts: number; errorCode: string | null; to: string }[];
  const delivered: string[] = [];
  let failWith: SendFailure | undefined;
  const sender: WhatsAppSender = { send: async message => {
    if (failWith) throw failWith;
    delivered.push(`${message.to}:${message.body}`); return { messageId: `wamid.out.${delivered.length}` };
  } };
  const drainOutbox = async () => { while (await processNextOutbox(db, sender)); };
  try {
    for (let i = 0; i < 2; i++) {
      await admin.query('INSERT INTO users(id,email,password_hash) VALUES ($1,$2,$3)', [users[i], `${users[i]}@example.test`, 'auto-fixture']);
      await admin.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '1 hour')", [hashToken(tokens[i]!), users[i]]);
    }
    await admin.query('INSERT INTO tenants(id,name,created_by) VALUES ($1,$2,$3)', [tenant, 'Automation shop', users[0]]);
    await admin.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES ($1,$2,'OWNER'),($1,$3,'STAFF')", [tenant, users[0], users[1]]);
    const number = { id: randomUUID(), phoneNumberId, displayName: 'Line' };
    assert.equal((await api(`/tenants/${tenant}/whatsapp-numbers`, 'POST', number)).status, 201);

    // 1. A generated workflow: invalid output is stored with its reasons and cannot be approved.
    model = { workflow: replies.definition.workflow, fixtures: replies.definition.fixtures };
    const badId = randomUUID();
    const bad = await api(`/tenants/${tenant}/generated-workflows`, 'POST', { id: badId, goal: 'confirm orders', language: 'fr', consentToOpenAI: true });
    assert.equal(bad.status, 201); assert.equal(bad.body.status, 'INVALID');
    assert.equal((await api(`/tenants/${tenant}/generated-workflows/${badId}/approve`, 'POST', {})).status, 422);
    assert.equal((await api(`/tenants/${tenant}/generated-workflows`, 'POST', { id: randomUUID(), goal: 'x', language: 'fr', consentToOpenAI: false })).status, 422);

    // 2. A valid generated workflow: staff cannot generate or approve; replay does not call the model again.
    model = { workflow: support.definition.workflow, fixtures: support.definition.fixtures };
    const genId = randomUUID();
    const request = { id: genId, goal: 'Answer customers and hand over to a person', language: 'fr', consentToOpenAI: true };
    assert.equal((await api(`/tenants/${tenant}/generated-workflows`, 'POST', request, tokens[1])).status, 403);
    const before = generatorCalls;
    const created = await api(`/tenants/${tenant}/generated-workflows`, 'POST', request);
    assert.equal(created.status, 201); assert.equal(created.body.status, 'READY'); assert.equal(created.body.approvedAt, null);
    assert.equal(generatorCalls, before + 1);
    assert.equal((await api(`/tenants/${tenant}/generated-workflows`, 'POST', request)).status, 200);
    assert.equal(generatorCalls, before + 1);
    assert.equal((await api(`/tenants/${tenant}/generated-workflows`, 'POST', { ...request, goal: 'different' })).status, 409);
    const publication = { id: randomUUID(), generatedWorkflowId: genId, whatsappNumberId: number.id };
    assert.equal((await api(`/tenants/${tenant}/publications`, 'POST', publication)).body.error.code, 'APPROVAL_REQUIRED');
    assert.equal((await api(`/tenants/${tenant}/generated-workflows/${genId}/approve`, 'POST', {}, tokens[1])).status, 403);
    assert.equal((await api(`/tenants/${tenant}/generated-workflows/${genId}/approve`, 'POST', {})).status, 200);
    await assert.rejects(db.pool.query('UPDATE generated_workflows SET workflow = $1', [{}]), { code: '42501' });
    const published = await api(`/tenants/${tenant}/publications`, 'POST', publication);
    assert.equal(published.status, 201); assert.equal(published.body.generatedWorkflowId, genId); assert.equal(published.body.draftId, null);

    // 3. Replies: a customer message queues one reply; the sender delivers it exactly once.
    await send('Quel est le prix ?'); await drain();
    let queued = await outbox();
    assert.equal(queued.length, 1); assert.equal(queued[0]!.status, 'QUEUED'); assert.equal(queued[0]!.to, '212600000000');
    await drain();
    assert.equal((await outbox()).length, 1);
    await drainOutbox(); await drainOutbox();
    assert.equal(delivered.length, 1); assert.match(delivered[0]!, /^212600000000:Merci ! Un conseiller vous envoie le prix/);
    assert.equal((await outbox())[0]!.status, 'SENT');

    // 4. Transient failures retry with backoff; permanent failures stop immediately.
    await send('Bonjour'); await drain();
    failWith = new SendFailure('PROVIDER_503', true);
    await drainOutbox();
    let [latest] = await outbox();
    assert.equal(latest!.status, 'QUEUED'); assert.equal(latest!.errorCode, 'PROVIDER_503'); assert.equal(latest!.attempts, 1);
    assert.equal(await processNextOutbox(db, sender), false); // backing off, not claimable yet
    await admin.query("UPDATE whatsapp_outbox SET lease_until = now() - interval '1 second' WHERE status = 'QUEUED' AND tenant_id = $1", [tenant]);
    failWith = undefined; await drainOutbox();
    [latest] = await outbox();
    assert.equal(latest!.status, 'SENT'); assert.equal(latest!.attempts, 2); assert.equal(delivered.length, 2);
    await send('Où est mon colis'); await drain();
    failWith = new SendFailure('PROVIDER_400', false); await drainOutbox();
    [latest] = await outbox();
    assert.equal(latest!.status, 'FAILED'); assert.equal(latest!.errorCode, 'PROVIDER_400'); assert.equal(delivered.length, 2);
    failWith = undefined;

    // 5. A released scenario with reply nodes also works through the draft path.
    await api(`/tenants/${tenant}/publications/${published.body.id}/pause`, 'POST', {});
    await admin.query('INSERT INTO scenarios(id,initial_definition,draft,created_by) VALUES ($1,$2,$2,$3)', [scenarioIds[0], support.definition, users[0]]);
    await admin.query('INSERT INTO scenario_releases(scenario_id,revision,definition,validation_report,simulation_report,created_by) VALUES ($1,1,$2,$3,$3,$4)', [scenarioIds[0], support.definition, { valid: true }, users[0]]);
    const draftId = randomUUID();
    assert.equal((await api(`/tenants/${tenant}/drafts`, 'POST', { id: draftId, scenarioId: scenarioIds[0], scenarioRevision: 1, content: { name: 'Support', goal: 'Support', language: 'fr' } })).status, 201);
    await api(`/tenants/${tenant}/drafts/${draftId}/simulations`, 'POST', { expectedRevision: 1 });
    await api(`/tenants/${tenant}/drafts/${draftId}/approve`, 'POST', { expectedRevision: 1 });
    assert.equal((await api(`/tenants/${tenant}/publications`, 'POST', { id: randomUUID(), draftId, expectedRevision: 1, whatsappNumberId: number.id })).status, 201);
    const count = (await outbox()).length;
    await send('Bonjour'); await drain(); await drainOutbox();
    assert.equal((await outbox()).length, count + 1);
  } finally {
    server.close(); await once(server, 'close');
    await admin.query('DELETE FROM tenants WHERE id=$1', [tenant]);
    await admin.query('DELETE FROM scenarios WHERE id = ANY($1)', [scenarioIds]);
    for (const user of users) await admin.query('DELETE FROM users WHERE id=$1', [user]);
    await db.pool.end(); await admin.end();
  }
});
