import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { Database, hashToken } from '../src/database.ts';
import { createApp } from '../src/app.ts';
import { processNextRun } from '../src/workflow-runtime.ts';

for (const key of ['DATABASE_URL', 'ADMIN_DATABASE_URL']) {
  if (!process.env[key] || new URL(process.env[key]!).pathname !== '/superagent_test') throw new Error('Dedicated test database required.');
}
test('an approved COD scenario is published and durably executes WhatsApp replies', async () => {
  const db = new Database(process.env.DATABASE_URL!);
  const admin = new pg.Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
  const users = [randomUUID(), randomUUID()], tenant = randomUUID(), scenarioId = randomUUID();
  const tokens = users.map(() => randomBytes(32).toString('base64url'));
  const config = { appSecret: 's'.repeat(24), verifyToken: 'v'.repeat(24) };
  const phoneNumberId = String(Math.floor(1e11 + Math.random() * 9e11));
  const { definition } = JSON.parse(readFileSync(new URL('../examples/cod-confirmation-scenario.json', import.meta.url), 'utf8'));
  const server = createApp(db, { whatsapp: config }).listen(0, '127.0.0.1'); await once(server, 'listening');
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
  const runs = async () => (await api(`/tenants/${tenant}/workflow-runs`)).body.data as { id: string; status: string; reason: string | null; errorCode: string | null; attempts: number }[];
  const newAttempt = async (conversationId: string) => {
    const res = await api(`/tenants/${tenant}/order-attempts`, 'POST', { id: randomUUID(), conversationId, details: { item: 'Tea set', quantity: 2, recipient: 'Amina',
      phone: '+212600000000', address: 'Rue 1, Casablanca', unitAmountMinor: 15000, deliveryAmountMinor: 3000 } });
    assert.equal(res.status, 201);
  };
  try {
    for (let i = 0; i < 2; i++) {
      await admin.query('INSERT INTO users(id,email,password_hash) VALUES ($1,$2,$3)', [users[i], `${users[i]}@example.test`, 'rt-fixture']);
      await admin.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '1 hour')", [hashToken(tokens[i]!), users[i]]);
    }
    await admin.query('INSERT INTO tenants(id,name,created_by) VALUES ($1,$2,$3)', [tenant, 'Runtime shop', users[0]]);
    await admin.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES ($1,$2,'OWNER')", [tenant, users[0]]);
    await admin.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES ($1,$2,'STAFF')", [tenant, users[1]]);
    await admin.query('INSERT INTO scenarios(id,initial_definition,draft,created_by) VALUES ($1,$2,$2,$3)', [scenarioId, definition, users[0]]);
    await admin.query('INSERT INTO scenario_releases(scenario_id,revision,definition,validation_report,simulation_report,created_by) VALUES ($1,1,$2,$3,$3,$4)',
      [scenarioId, definition, { valid: true }, users[0]]);

    const number = { id: randomUUID(), phoneNumberId, displayName: 'Shop line' };
    assert.equal((await api(`/tenants/${tenant}/whatsapp-numbers`, 'POST', number)).status, 201);
    const conversation = randomUUID();
    assert.equal((await api(`/tenants/${tenant}/conversations`, 'POST', { id: conversation, customerReference: '+212600000000', language: 'fr' })).status, 201);
    await newAttempt(conversation);

    const draftId = randomUUID();
    const draft = await api(`/tenants/${tenant}/drafts`, 'POST', { id: draftId, scenarioId, scenarioRevision: 1, content: { name: 'COD replies', goal: 'Confirm orders', language: 'fr' } });
    assert.equal(draft.status, 201);
    const publication = { id: randomUUID(), draftId, expectedRevision: 1, whatsappNumberId: number.id };
    const early = await api(`/tenants/${tenant}/publications`, 'POST', publication);
    assert.equal(early.status, 409); assert.equal(early.body.error.code, 'APPROVAL_REQUIRED');
    assert.equal((await api(`/tenants/${tenant}/drafts/${draftId}/simulations`, 'POST', { expectedRevision: 1 })).status, 201);
    assert.equal((await api(`/tenants/${tenant}/drafts/${draftId}/approve`, 'POST', { expectedRevision: 1 })).status, 201);
    assert.equal((await api(`/tenants/${tenant}/publications`, 'POST', publication, tokens[1])).status, 403);
    const published = await api(`/tenants/${tenant}/publications`, 'POST', publication);
    assert.equal(published.status, 201); assert.equal(published.body.status, 'ACTIVE');
    assert.equal((await api(`/tenants/${tenant}/publications`, 'POST', publication)).status, 200);
    const busy = await api(`/tenants/${tenant}/publications`, 'POST', { ...publication, id: randomUUID() });
    assert.equal(busy.status, 409); assert.equal(busy.body.error.code, 'NUMBER_BUSY');

    // Confirmation: the customer reply becomes a confirmed order through the journaled steps.
    await send('Oui, je confirme');
    await drain();
    let [run] = await runs();
    assert.equal(run!.status, 'SUCCEEDED'); assert.equal(run!.reason, 'Order confirmed');
    const detail = (await api(`/tenants/${tenant}/workflow-runs/${run!.id}`)).body;
    assert.deepEqual(detail.steps.map((step: { nodeId: string }) => step.nodeId), ['receive', 'is_confirm', 'confirm', 'confirmed']);
    const orders = await api(`/tenants/${tenant}/orders`);
    assert.equal(orders.body.data.length, 1); assert.equal(orders.body.data[0].amountMinor, '33000');
    await drain();
    assert.equal((await api(`/tenants/${tenant}/orders`)).body.data.length, 1);

    // The same webhook delivery cannot enqueue a second run.
    const before = (await runs()).length;
    counter--; await send('Oui, je confirme'); await drain();
    assert.equal((await runs()).length, before);

    // No pending order: a refusal fails safely and creates nothing.
    await send('non'); await drain();
    assert.equal((await runs())[0]!.errorCode, 'NO_PENDING_ORDER');
    // Unclear text reaches the human handoff end node without side effects.
    await send('combien la livraison ?'); await drain();
    assert.equal((await runs())[0]!.reason, 'Needs a person');

    // Crash recovery: a claimed run whose worker died is re-claimed after its lease and finishes once.
    await newAttempt(conversation);
    await send('non merci');
    const claimed = await db.pool.query('SELECT run_id FROM claim_workflow_run()');
    assert.equal(claimed.rowCount, 1);
    await admin.query("UPDATE workflow_runs SET lease_until = now() - interval '1 second' WHERE id = $1", [claimed.rows[0].run_id]);
    await drain();
    const recovered = (await runs()).find(item => item.id === claimed.rows[0].run_id)!;
    assert.equal(recovered.status, 'SUCCEEDED'); assert.equal(recovered.attempts, 2); assert.equal(recovered.reason, 'Order declined');
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM order_decision_receipts WHERE tenant_id = $1 AND decision = 'DECLINE'", [tenant])).rows[0].n, 1);

    // Pausing stops new runs; staff cannot pause.
    assert.equal((await api(`/tenants/${tenant}/publications/${published.body.id}/pause`, 'POST', {}, tokens[1])).status, 403);
    assert.equal((await api(`/tenants/${tenant}/publications/${published.body.id}/pause`, 'POST', {})).body.status, 'PAUSED');
    const count = (await runs()).length;
    await send('oui'); await drain();
    assert.equal((await runs()).length, count);
    assert.equal((await api(`/tenants/${tenant}/publications/${published.body.id}/resume`, 'POST', {})).body.status, 'ACTIVE');
    // The manifest is immutable for the runtime role.
    await assert.rejects(db.pool.query('UPDATE workflow_publications SET manifest = $1', [{}]), { code: '42501' });
  } finally {
    server.close(); await once(server, 'close');
    await admin.query('DELETE FROM tenants WHERE id=$1', [tenant]);
    await admin.query('DELETE FROM scenarios WHERE id=$1', [scenarioId]);
    for (const user of users) await admin.query('DELETE FROM users WHERE id=$1', [user]);
    await db.pool.end(); await admin.end();
  }
});
