import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { Database, hashToken } from '../src/database.ts';
import { createApp } from '../src/app.ts';

// Explicit command, required environment: never silently skip database acceptance tests.
if (!process.env.DATABASE_URL || !process.env.ADMIN_DATABASE_URL) throw new Error('Database URLs are required for integration tests.');
for (const url of [process.env.DATABASE_URL, process.env.ADMIN_DATABASE_URL]) {
  if (new URL(url).pathname !== '/superagent_test') throw new Error('Integration tests require the dedicated superagent_test database.');
}

test('real PostgreSQL: signup, login, tenant isolation, session expiry and rollback', async () => {
  const db = new Database(process.env.DATABASE_URL!);
  const admin = new pg.Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
  const adminDb = new Database(process.env.ADMIN_DATABASE_URL!);
  await assert.rejects(adminDb.checkRuntimeRole(), /runtime role/);
  await adminDb.pool.end();
  await db.checkRuntimeRole();
  const server = createApp(db).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const emails: string[] = [];
  async function request(path: string, method = 'GET', body?: unknown, token?: string) {
    const response = await fetch(`${base}${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  }
  async function register() {
    const email = `${randomUUID()}@example.test`;
    emails.push(email);
    const result = await request('/v1/auth/registrations', 'POST', { email, password: 'strong test password 123', businessName: 'Test Shop' });
    assert.equal(result.status, 201, JSON.stringify(result));
    assert.equal(result.body.passwordHash, undefined);
    return { ...result.body, email };
  }
  try {
    const first = await register();
    const second = await register();
    const duplicate = await request('/v1/auth/registrations', 'POST', { email: first.email, password: 'strong test password 123', businessName: 'Duplicate Shop' });
    assert.equal(duplicate.status, 409);
    const tenantId = first.tenant.id;
    assert.equal((await request(`/v1/tenants/${tenantId}/profile`)).status, 401);
    assert.equal((await request(`/v1/tenants/${tenantId}/profile`, 'GET', undefined, second.token)).status, 404);
    assert.equal((await request(`/v1/tenants/${tenantId}/profile`, 'PUT', { language: 'fr', timezone: 'Africa/Casablanca', description: 'stolen' }, second.token)).status, 404);
    const update = await request(`/v1/tenants/${tenantId}/profile`, 'PUT', { language: 'fr', timezone: 'Africa/Casablanca', description: 'Delivery across Morocco' }, first.token);
    assert.equal(update.status, 200);
    assert.equal(update.body.description, 'Delivery across Morocco');
    assert.equal((await request(`/v1/tenants/${tenantId}/profile`, 'GET', undefined, first.token)).body.language, 'fr');
    assert.equal((await request(`/v1/tenants/${tenantId}/profile`, 'PUT', { language: 'fr', timezone: 'bad/timezone', description: '' }, first.token)).status, 422);

    // Bypass HTTP filters: actual runtime role must still be denied by PostgreSQL policies.
    await db.authenticated(second.token, async client => {
      assert.equal((await client.query('SELECT * FROM business_profiles WHERE tenant_id = $1', [tenantId])).rowCount, 0);
      assert.equal((await client.query("UPDATE business_profiles SET description = 'stolen' WHERE tenant_id = $1", [tenantId])).rowCount, 0);
      assert.equal((await client.query('SELECT * FROM tenants WHERE id = $1', [tenantId])).rowCount, 0);
    });
    await assert.rejects(db.authenticated(second.token, client => client.query('INSERT INTO memberships(tenant_id, user_id, role) VALUES ($1, $2, $3)', [tenantId, second.user.id, 'OWNER'])), { code: '42501' });
    assert.equal((await db.pool.query('SELECT * FROM business_profiles')).rowCount, 0);
    await assert.rejects(db.authenticated(first.token, async client => {
      await client.query("UPDATE business_profiles SET description = 'rolled back' WHERE tenant_id = $1", [tenantId]);
      throw new Error('abort transaction');
    }), /abort transaction/);
    assert.equal((await request(`/v1/tenants/${tenantId}/profile`, 'GET', undefined, first.token)).body.description, 'Delivery across Morocco');

    assert.equal((await request('/v1/auth/sessions', 'POST', { email: first.email, password: 'wrong password 123' })).status, 401);
    const login = await request('/v1/auth/sessions', 'POST', { email: first.email.toUpperCase(), password: 'strong test password 123' });
    assert.equal(login.status, 201);
    assert.notEqual(login.body.token, first.token);
    assert.equal((await request('/v1/me', 'GET', undefined, login.body.token)).body.tenants.length, 1);
    assert.equal((await request('/v1/auth/session', 'DELETE', undefined, login.body.token)).status, 200);
    assert.equal((await request('/v1/me', 'GET', undefined, login.body.token)).status, 401);
    await admin.query("UPDATE sessions SET expires_at = now() - interval '1 second' WHERE token_hash = $1", [hashToken(first.token)]);
    assert.equal((await request('/v1/me', 'GET', undefined, first.token)).status, 401);
    const stored = await admin.query('SELECT password_hash FROM users WHERE email = $1', [first.email]);
    assert.notEqual(stored.rows[0].password_hash, 'strong test password 123');

    await admin.query("INSERT INTO memberships(tenant_id, user_id, role) VALUES ($1, $2, 'STAFF')", [tenantId, second.user.id]);
    assert.equal((await request(`/v1/tenants/${tenantId}/profile`, 'GET', undefined, second.token)).status, 200);
    assert.equal((await request(`/v1/tenants/${tenantId}/profile`, 'PUT', { language: 'fr', timezone: 'Africa/Casablanca', description: 'staff edit' }, second.token)).status, 403);
    await db.authenticated(second.token, async client => {
      assert.equal((await client.query("UPDATE business_profiles SET description = 'staff edit' WHERE tenant_id = $1", [tenantId])).rowCount, 0);
    });
    const memberships = await request('/v1/me', 'GET', undefined, second.token);
    assert.equal(memberships.body.tenants.length, 2);

    // Concurrent counters cannot all claim the final allowed attempt.
    const key = `test-${randomUUID()}`;
    try {
      const attempts = await Promise.allSettled(Array.from({ length: 12 }, () => db.consumeAuthAttempt(key)));
      assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 10);
      assert.equal(attempts.filter(result => result.status === 'rejected').length, 2);
    } finally { await admin.query('DELETE FROM auth_limits WHERE key = $1', [key]); }
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    for (const email of emails) {
      await admin.query('DELETE FROM tenants WHERE created_by IN (SELECT id FROM users WHERE email = $1)', [email]);
      await admin.query('DELETE FROM users WHERE email = $1', [email]);
      await admin.query('DELETE FROM auth_limits WHERE key = $1', [hashToken(`email:${email}`)]);
    }
    await admin.query('DELETE FROM auth_limits WHERE key = $1', [hashToken('ip:127.0.0.1')]);
    await db.pool.end();
    await admin.end();
  }
});
