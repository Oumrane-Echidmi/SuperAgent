import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import pg from 'pg';
import { Database, hashToken } from '../src/database.ts';
import { createApp } from '../src/app.ts';

for (const key of ['DATABASE_URL', 'ADMIN_DATABASE_URL']) {
  if (!process.env[key] || new URL(process.env[key]!).pathname !== '/superagent_test') throw new Error('Dedicated test database required.');
}
test('WhatsApp numbers are tenant-scoped and signed inbound messages are stored once', async () => {
  const db = new Database(process.env.DATABASE_URL!);
  const admin = new pg.Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
  const users = [randomUUID(), randomUUID(), randomUUID()], tenants = [randomUUID(), randomUUID()];
  const tokens = users.map(() => randomBytes(32).toString('base64url'));
  const config = { appSecret: 's'.repeat(24), verifyToken: 'v'.repeat(24) };
  const phoneNumberId = String(Math.floor(1e11 + Math.random() * 9e11));
  const server = createApp(db, { whatsapp: config }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/v1`;
  async function request(path: string, method = 'GET', body?: unknown, bearer = tokens[0]!) {
    const res = await fetch(base + path, { method, headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, body: await res.json() };
  }
  async function webhook(payload: unknown, secret = config.appSecret) {
    const raw = JSON.stringify(payload);
    const res = await fetch(base + '/webhooks/whatsapp', { method: 'POST', headers: { 'Content-Type': 'application/json',
      'X-Hub-Signature-256': 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex') }, body: raw });
    return { status: res.status, body: await res.json() };
  }
  const message = (id: string, to = phoneNumberId) => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { metadata: { phone_number_id: to },
    messages: [{ id, from: '212600000000', timestamp: '1700000000', type: 'text', text: { body: 'نعم' } }] } }] }] });
  try {
    for (let i = 0; i < users.length; i++) {
      await admin.query('INSERT INTO users(id,email,password_hash) VALUES ($1,$2,$3)', [users[i], `${users[i]}@example.test`, 'wa-test-fixture']);
      await admin.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '1 hour')", [hashToken(tokens[i]!), users[i]]);
    }
    for (let i = 0; i < 2; i++) {
      await admin.query('INSERT INTO tenants(id,name,created_by) VALUES ($1,$2,$3)', [tenants[i], 'WA test shop', users[i]]);
      await admin.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES ($1,$2,'OWNER')", [tenants[i], users[i]]);
    }
    await admin.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES ($1,$2,'STAFF')", [tenants[0], users[2]]);
    const root = `/tenants/${tenants[0]}/whatsapp-numbers`;
    const number = { id: randomUUID(), phoneNumberId, displayName: 'Main line' };
    assert.equal((await request(root, 'POST', number, tokens[2])).status, 403);
    assert.equal((await request(root, 'POST', number, tokens[1])).status, 404);
    assert.equal((await request(root, 'POST', number)).status, 201);
    assert.equal((await request(root, 'POST', number)).status, 200);
    assert.equal((await request(root, 'POST', { ...number, phoneNumberId: '99999999' })).status, 409);
    const other = await request(`/tenants/${tenants[1]}/whatsapp-numbers`, 'POST', { id: randomUUID(), phoneNumberId, displayName: 'Stolen' }, tokens[1]);
    assert.equal(other.status, 409); assert.equal(other.body.error.code, 'NUMBER_IN_USE');

    assert.equal((await webhook(message('wamid.A'), 'wrong-secret-wrong-secret')).status, 401);
    assert.equal((await webhook(message('wamid.A'))).status, 200);
    assert.equal((await webhook(message('wamid.A'))).status, 200);
    assert.equal((await webhook(message('wamid.B', '55555555555'))).status, 200);
    const list = await request(`/tenants/${tenants[0]}/whatsapp-messages`, 'GET', undefined, tokens[2]);
    assert.equal(list.status, 200); assert.equal(list.body.data.length, 1); assert.equal(list.body.data[0].body, 'نعم');
    assert.equal((await request(`/tenants/${tenants[0]}/whatsapp-messages`, 'GET', undefined, tokens[1])).body.data.length, 0);
    await assert.rejects(db.pool.query("INSERT INTO whatsapp_messages(tenant_id,message_id,phone_number_id,customer_phone,message_type,sent_at) VALUES ($1,'x','1','212600000000','text',now())", [tenants[0]]), { code: '42501' });
  } finally {
    server.close(); await once(server, 'close');
    for (const tenant of tenants) await admin.query('DELETE FROM tenants WHERE id=$1', [tenant]);
    for (const user of users) await admin.query('DELETE FROM users WHERE id=$1', [user]);
    await db.pool.end(); await admin.end();
  }
});
