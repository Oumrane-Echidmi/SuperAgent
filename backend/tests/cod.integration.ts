import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import pg from 'pg';
import { Database, hashToken } from '../src/database.ts';
import { createApp } from '../src/app.ts';

for (const key of ['DATABASE_URL', 'ADMIN_DATABASE_URL']) {
  if (!process.env[key] || new URL(process.env[key]!).pathname !== '/superagent_test') throw new Error('Dedicated test database required.');
}
test('COD confirmations are revision-bound, atomic, deduplicated and tenant-isolated', async () => {
  const db = new Database(process.env.DATABASE_URL!); const maintenance = new pg.Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
  const users = [randomUUID(), randomUUID(), randomUUID()]; const tenants = [randomUUID(), randomUUID()]; const tokens = users.map(() => randomBytes(32).toString('base64url'));
  const server = createApp(db).listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address();
  assert.ok(address && typeof address !== 'string'); const base = `http://127.0.0.1:${address.port}/v1`;
  const root = `/tenants/${tenants[0]}`;
  async function request(path: string, method = 'GET', body?: unknown, token = tokens[0]!) {
    const res = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, body: await res.json() };
  }
  const details = { item: 'Article', quantity: 2, recipient: 'Client', phone: '+212612345678', address: 'Casablanca', unitAmountMinor: 12550, deliveryAmountMinor: 3000 };
  async function attempt(complete = false, token = tokens[0]!) {
    const conversationId = randomUUID(); const id = randomUUID();
    assert.equal((await request(root + '/conversations', 'POST', { id: conversationId, customerReference: randomUUID(), language: 'darija' }, token)).status, 201);
    const input = { id, conversationId, details: complete ? details : {} };
    const created = await request(root + '/order-attempts', 'POST', input, token);
    assert.equal(created.status, 201, JSON.stringify(created));
    return { id, conversationId, input, review: created.body };
  }
  try {
    for (let i = 0; i < users.length; i++) {
      await maintenance.query('INSERT INTO users(id, email, password_hash) VALUES ($1, $2, $3)', [users[i], `${users[i]}@example.test`, 'cod-test-fixture']);
      await maintenance.query("INSERT INTO sessions(token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '1 hour')", [hashToken(tokens[i]!), users[i]]);
      if (i >= tenants.length) continue;
      await maintenance.query('INSERT INTO tenants(id, name, created_by) VALUES ($1, $2, $3)', [tenants[i], 'COD test shop', users[i]]);
      await maintenance.query("INSERT INTO memberships(tenant_id, user_id, role) VALUES ($1, $2, 'OWNER')", [tenants[i], users[i]]);
      await maintenance.query("INSERT INTO business_profiles(tenant_id, timezone) VALUES ($1, 'Etc/GMT-1')", [tenants[i]]);
    }
    await maintenance.query("INSERT INTO memberships(tenant_id, user_id, role) VALUES ($1, $2, 'STAFF')", [tenants[0], users[2]]);
    const first = await attempt(); const path = root + '/order-attempts/' + first.id;
    assert.equal(first.review.review.ready, false);
    const incomplete = { id: randomUUID(), expectedRevision: 1, summaryHash: first.review.summaryHash, decision: 'CONFIRM', evidence: 'Customer confirmed by phone.' };
    assert.equal((await request(path + '/decisions', 'POST', incomplete)).body.error.code, 'ORDER_INCOMPLETE');
    const ambiguous = { ...incomplete, id: randomUUID(), decision: 'AMBIGUOUS' };
    assert.equal((await request(path + '/decisions', 'POST', ambiguous)).body.status, 'PENDING');
    assert.equal((await request(path + '/decisions', 'POST', ambiguous)).status, 200);
    assert.equal((await request(path + '/decisions', 'POST', { ...ambiguous, decision: 'DECLINE' })).status, 409);
    const edit = await request(path, 'PUT', { expectedRevision: 1, details });
    assert.equal(edit.status, 200); assert.equal(edit.body.review.amountMinor, 28100);
    assert.equal((await request(path + '/decisions', 'POST', incomplete)).status, 409);
    const confirm = { ...incomplete, id: randomUUID(), expectedRevision: 2, summaryHash: edit.body.summaryHash };
    assert.equal((await request(path + '/decisions', 'POST', { ...confirm, summaryHash: 'a'.repeat(64) })).body.error.code, 'SUMMARY_CHANGED');
    await maintenance.query('REVOKE INSERT ON sheet_sync_requests FROM superagent_app');
    try {
      assert.equal((await request(path + '/decisions', 'POST', confirm)).status, 500);
      assert.equal((await request(path)).body.status, 'PENDING');
      assert.equal((await maintenance.query('SELECT 1 FROM orders WHERE tenant_id = $1', [tenants[0]])).rowCount, 0);
      assert.equal((await maintenance.query('SELECT 1 FROM order_decision_receipts WHERE tenant_id = $1 AND id = $2', [tenants[0], confirm.id])).rowCount, 0);
    } finally { await maintenance.query('GRANT INSERT ON sheet_sync_requests TO superagent_app'); }
    const confirmations = await Promise.all([request(path + '/decisions', 'POST', confirm), request(path + '/decisions', 'POST', confirm)]);
    assert.deepEqual(confirmations.map(row => row.status).sort(), [200, 201]);
    assert.deepEqual(confirmations[0]!.body, confirmations[1]!.body);
    assert.equal(confirmations[0]!.body.orderId, first.id);
    assert.equal((await request(path + '/decisions', 'POST', { ...confirm, id: randomUUID() })).body.error.code, 'ATTEMPT_CLOSED');
    assert.equal((await request(path, 'PUT', { expectedRevision: 2, details: { ...details, quantity: 3 } })).status, 409);
    assert.equal((await request(path + '/revisions')).body.data.length, 2);
    assert.equal((await request(path + '/decisions')).body.data.length, 2);
    assert.equal((await request(root + '/order-attempts', 'POST', first.input)).status, 200);
    const order = await request(root + '/orders/' + first.id);
    assert.equal(order.body.amountMinor, '28100'); assert.equal(order.body.sheetSync.status, 'AWAITING_CONNECTION');
    assert.equal(order.body.sheetSync.payload.amountMad, '281.00');
    assert.equal((await maintenance.query('SELECT 1 FROM sheet_sync_requests WHERE tenant_id = $1', [tenants[0]])).rowCount, 1);
    const second = await attempt(true);
    const decline = { id: randomUUID(), expectedRevision: 1, summaryHash: second.review.summaryHash, decision: 'DECLINE', evidence: 'Customer refused the reviewed summary.' };
    assert.equal((await request(root + '/order-attempts/' + second.id + '/decisions', 'POST', decline)).body.status, 'DECLINED');
    const third = await attempt();
    assert.equal((await request(root + '/order-attempts', 'POST', { ...third.input, id: randomUUID() })).body.error.code, 'OPEN_ATTEMPT_EXISTS');
    const outside = await attempt();
    await maintenance.query("UPDATE order_attempts SET started_at = '2026-11-16T23:30:00Z' WHERE tenant_id = $1 AND id = ANY($2::uuid[])", [tenants[0], [first.id, second.id, third.id]]);
    await maintenance.query("UPDATE order_attempts SET started_at = '2026-11-16T22:30:00Z' WHERE tenant_id = $1 AND id = $2", [tenants[0], outside.id]);
    const dashboard = await request(root + '/dashboard/outcomes?from=2026-11-17&to=2026-11-17');
    assert.equal(dashboard.status, 200);
    assert.deepEqual(dashboard.body.totals, { pending: 1, confirmed: 1, declined: 1, confirmationRate: 0.5, confirmedOrderValueMinor: '28100', sheetSyncWaiting: 1 });
    assert.equal(dashboard.body.days[0].date, '2026-11-17');
    const undecided = await request(root + '/dashboard/outcomes?from=2026-11-16&to=2026-11-16');
    assert.equal(undecided.body.totals.confirmationRate, null);
    assert.equal((await request(path + '/decisions', 'POST', confirm)).status, 200);
    assert.deepEqual((await request(root + '/dashboard/outcomes?from=2026-11-17&to=2026-11-17')).body.totals, dashboard.body.totals);
    assert.equal((await request(path, 'GET', undefined, tokens[1])).status, 404);
    assert.equal((await request(root + '/orders/' + first.id, 'GET', undefined, tokens[1])).status, 404);
    const staffAttempt = await attempt(true, tokens[2]);
    assert.equal((await request(root + '/order-attempts/' + staffAttempt.id + '/decisions', 'POST', {
      id: randomUUID(), expectedRevision: 1, summaryHash: staffAttempt.review.summaryHash, decision: 'CONFIRM', evidence: 'Staff recorded explicit customer confirmation.',
    }, tokens[2])).status, 201);
    assert.equal((await request(root + '/orders/' + staffAttempt.id)).body.confirmedBy, users[2]);
    await db.authenticated(tokens[1]!, async client => {
      for (const table of ['conversations', 'order_attempts', 'order_attempt_revisions', 'order_decision_receipts', 'orders', 'sheet_sync_requests']) {
        assert.equal((await client.query(`SELECT * FROM ${table} WHERE tenant_id = $1`, [tenants[0]])).rowCount, 0);
      }
    });
    await assert.rejects(db.authenticated(tokens[0]!, client => client.query('UPDATE orders SET amount_minor = 0 WHERE tenant_id = $1', [tenants[0]])), { code: '42501' });
    await assert.rejects(db.authenticated(tokens[0]!, client => client.query('DELETE FROM order_decision_receipts WHERE tenant_id = $1', [tenants[0]])), { code: '42501' });
    await db.authenticated(tokens[0]!, async client => {
      assert.equal((await client.query("UPDATE order_attempts SET status = 'PENDING', confirmed_order_id = NULL WHERE tenant_id = $1 AND id = $2", [tenants[0], first.id])).rowCount, 0);
    });
    const worker = new Database(process.env.BUILDER_WORKER_DATABASE_URL!);
    try { await assert.rejects(worker.pool.query('SELECT * FROM orders'), { code: '42501' }); } finally { await worker.pool.end(); }
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await maintenance.query('DELETE FROM tenants WHERE id = ANY($1::uuid[])', [tenants]);
    await maintenance.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
    await db.pool.end(); await maintenance.end();
  }
});
