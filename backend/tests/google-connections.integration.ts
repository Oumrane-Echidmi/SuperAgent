import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { once } from 'node:events';
import pg from 'pg';
import { Database, hashToken } from '../src/database.ts';
import { createApp } from '../src/app.ts';
import { CredentialVault } from '../src/credentials.ts';
import { GoogleOAuthProvider, GOOGLE_FILE_SCOPE } from '../src/google-oauth.ts';
import { cleanupGoogleConnections } from '../src/google-connection-maintenance.ts';

for (const key of ['DATABASE_URL', 'ADMIN_DATABASE_URL']) {
  if (!process.env[key] || new URL(process.env[key]!).pathname !== '/superagent_test') throw new Error('Dedicated test database required.');
}
test('Google connections bind one-use consent to tenant owners and fence concurrent completion and disconnect', async () => {
  const db = new Database(process.env.DATABASE_URL!); const maintenance = new pg.Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
  const users = [randomUUID(), randomUUID(), randomUUID()]; const tenants = [randomUUID(), randomUUID()];
  const tokens = users.map(() => randomBytes(32).toString('base64url'));
  const vault = new CredentialVault('test-key', { 'test-key': randomBytes(32).toString('base64') });
  const config = { clientId: 'client.apps.googleusercontent.com', clientSecret: 'secret', redirectUri: 'https://app.example.test/google/callback', vault };
  let calls = 0; let mode = 'ok'; let release: (() => void) | undefined;
  async function waitForExchange() {
    for (let i = 0; !release && i < 200; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(release, 'Provider exchange should start.');
  }
  function resumeExchange() { assert.ok(release); release(); release = undefined; }
  const oauth = new GoogleOAuthProvider({ clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri }, async (_url, init) => {
    calls++;
    const form = new URLSearchParams(String(init?.body));
    const verifier = form.get('code_verifier')!;
    assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
    if (mode === 'wait') await new Promise<void>(resolve => { release = resolve; });
    if (mode === 'fail') throw new Error('provider-secret');
    return Response.json({ access_token: 'temporary-secret', token_type: 'Bearer', refresh_token: 'refresh-secret', expires_in: 3600, scope: GOOGLE_FILE_SCOPE });
  });
  const server = createApp(db, { google: config, googleOAuth: oauth }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string'); const base = `http://127.0.0.1:${address.port}/v1`;
  const root = `/tenants/${tenants[0]}/connections/google`;
  async function request(path: string, method = 'GET', body?: unknown, bearer = tokens[0]!) {
    const res = await fetch(base + path, { method, headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, body: await res.json(), cacheControl: res.headers.get('cache-control') };
  }
  async function start() {
    const result = await request(root, 'POST', {}); assert.equal(result.status, 201, JSON.stringify(result.body));
    const state = new URL(result.body.authorizationUrl).searchParams.get('state')!;
    return { id: result.body.connection.id as string, state, body: result.body };
  }
  const complete = (id: string, state: string) => request(`${root}/${id}/complete`, 'POST', { state, code: 'code' });
  try {
    for (let i = 0; i < users.length; i++) {
      await maintenance.query('INSERT INTO users(id,email,password_hash) VALUES ($1,$2,$3)', [users[i], `${users[i]}@example.test`, 'google-test-fixture']);
      await maintenance.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '1 hour')", [hashToken(tokens[i]!), users[i]]);
      if (i < tenants.length) {
        await maintenance.query('INSERT INTO tenants(id,name,created_by) VALUES ($1,$2,$3)', [tenants[i], 'Google test shop', users[i]]);
        await maintenance.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES ($1,$2,'OWNER')", [tenants[i], users[i]]);
      }
    }
    await maintenance.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES ($1,$2,'STAFF')", [tenants[0], users[2]]);
    const disabled = createApp(db).listen(0, '127.0.0.1'); await once(disabled, 'listening');
    try {
      const addr = disabled.address(); assert.ok(addr && typeof addr !== 'string');
      const response = await fetch(`http://127.0.0.1:${addr.port}/v1${root}`, { method: 'POST', headers: { Authorization: `Bearer ${tokens[0]}`, 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(response.status, 503); assert.equal((await response.json()).error.code, 'GOOGLE_DISABLED');
    } finally { disabled.close(); await once(disabled, 'close'); }
    assert.equal((await request(root, 'POST', {}, '')).status, 401);
    assert.equal((await request(root, 'POST', {}, tokens[1])).status, 404);
    assert.equal((await request(root, 'POST', {}, tokens[2])).status, 403);
    const first = await start();
    const stored = (await maintenance.query('SELECT * FROM google_connections WHERE tenant_id=$1 AND id=$2', [tenants[0], first.id])).rows[0];
    assert.equal(stored.state_hash, hashToken(first.state));
    const verifier = vault.open(stored.verifier_envelope, { tenantId: tenants[0]!, connectionId: first.id + ':pkce', provider: 'google' });
    assert.equal(new URL(first.body.authorizationUrl).searchParams.get('code_challenge'), createHash('sha256').update(verifier).digest('base64url'));
    assert.ok(!JSON.stringify(stored).includes(first.state)); assert.ok(!JSON.stringify(stored).includes(verifier));
    assert.equal((await complete(first.id, 'x'.repeat(43))).status, 409); assert.equal(calls, 0);
    const connected = await complete(first.id, first.state);
    assert.equal(connected.status, 200); assert.equal(connected.body.status, 'CONNECTED'); assert.equal(connected.cacheControl, 'no-store');
    assert.deepEqual(connected.body.scopes, [GOOGLE_FILE_SCOPE]);
    assert.ok(!JSON.stringify(connected.body).includes('secret')); assert.ok(!('credentialEnvelope' in connected.body));
    const credential = (await maintenance.query('SELECT * FROM google_connections WHERE tenant_id=$1 AND id=$2', [tenants[0], first.id])).rows[0];
    assert.equal(credential.state_hash, null); assert.equal(credential.verifier_envelope, null);
    assert.equal(vault.open(credential.credential_envelope, { tenantId: tenants[0]!, connectionId: first.id, provider: 'google' }), 'refresh-secret');
    assert.ok(!JSON.stringify(credential).includes('refresh-secret')); assert.ok(!JSON.stringify(credential).includes('temporary-secret'));
    assert.equal((await complete(first.id, first.state)).status, 409); assert.equal(calls, 1);
    assert.equal((await request(root + '/' + first.id, 'GET', undefined, tokens[1])).status, 404);
    assert.equal((await request(root + '/' + first.id, 'GET', undefined, tokens[2])).status, 403);
    assert.equal((await request(root)).body.data.length, 1);
    await db.authenticated(tokens[1]!, async client => assert.equal((await client.query('SELECT * FROM google_connections WHERE tenant_id=$1', [tenants[0]])).rowCount, 0));
    await db.authenticated(tokens[2]!, async client => assert.equal((await client.query('SELECT * FROM google_connections WHERE tenant_id=$1', [tenants[0]])).rowCount, 0));
    assert.equal((await request(root + '/' + first.id, 'DELETE')).body.status, 'DISCONNECTED');
    assert.equal((await request(root + '/' + first.id, 'DELETE')).status, 200);
    assert.equal((await maintenance.query('SELECT credential_envelope FROM google_connections WHERE tenant_id=$1 AND id=$2', [tenants[0], first.id])).rows[0].credential_envelope, null);

    const expired = await start();
    await maintenance.query("UPDATE google_connections SET expires_at=now()-interval '1 second' WHERE tenant_id=$1 AND id=$2", [tenants[0], expired.id]);
    assert.equal((await request(root + '/' + expired.id)).body.status, 'EXPIRED');
    assert.equal((await complete(expired.id, expired.state)).status, 409); assert.equal(calls, 1);

    const failed = await start(); mode = 'fail';
    assert.equal((await complete(failed.id, failed.state)).body.error.code, 'GOOGLE_AUTHORIZATION_FAILED');
    assert.equal((await request(root + '/' + failed.id)).body.status, 'FAILED');
    assert.equal((await complete(failed.id, failed.state)).status, 409); assert.equal(calls, 2);

    const racing = await start(); mode = 'wait';
    const pending = complete(racing.id, racing.state);
    await waitForExchange();
    assert.equal((await complete(racing.id, racing.state)).status, 409); assert.equal(calls, 3);
    assert.equal((await request(root + '/' + racing.id, 'DELETE')).status, 200);
    resumeExchange();
    assert.equal((await pending).status, 409);
    assert.equal((await request(root + '/' + racing.id)).body.status, 'DISCONNECTED');
    assert.equal((await maintenance.query('SELECT credential_envelope FROM google_connections WHERE tenant_id=$1 AND id=$2', [tenants[0], racing.id])).rows[0].credential_envelope, null);

    const wrongActor = await start();
    await maintenance.query("UPDATE memberships SET role='OWNER' WHERE tenant_id=$1 AND user_id=$2", [tenants[0], users[2]]);
    assert.equal((await request(`${root}/${wrongActor.id}/complete`, 'POST', { state: wrongActor.state, code: 'code' }, tokens[2])).status, 409);
    assert.equal(calls, 3);
    assert.equal((await request(root, 'POST', {})).status, 429);
    assert.equal((await request(root + '/?limit=1000')).status, 422);
    // Starting again after the quota window creates a fresh identity; old codes stay consumed.
    await maintenance.query("UPDATE google_connections SET created_at=now()-interval '16 minutes' WHERE tenant_id=$1", [tenants[0]]);
    const lostOwnership = await start(); mode = 'wait';
    const finishing = complete(lostOwnership.id, lostOwnership.state);
    await waitForExchange();
    await maintenance.query("UPDATE memberships SET role='STAFF' WHERE tenant_id=$1 AND user_id=$2", [tenants[0], users[0]]);
    resumeExchange();
    assert.equal((await finishing).status, 403);
    assert.equal((await maintenance.query('SELECT credential_envelope FROM google_connections WHERE tenant_id=$1 AND id=$2', [tenants[0], lostOwnership.id])).rows[0].credential_envelope, null);
    await maintenance.query("UPDATE memberships SET role='OWNER' WHERE tenant_id=$1 AND user_id=$2", [tenants[0], users[0]]);
    await assert.rejects(db.authenticated(tokens[0]!, client => client.query('UPDATE google_connections SET created_by=$3 WHERE tenant_id=$1 AND id=$2', [tenants[0], wrongActor.id, users[2]])), { code: '42501' });
    await assert.rejects(db.authenticated(tokens[0]!, client => client.query('DELETE FROM google_connections WHERE tenant_id=$1', [tenants[0]])), { code: '42501' });
    const cleanup = await maintenance.connect();
    try {
      await cleanup.query('BEGIN');
      await cleanup.query("UPDATE google_connections SET expires_at=now()-interval '1 second' WHERE tenant_id=$1 AND id=$2", [tenants[0], lostOwnership.id]);
      await cleanup.query("UPDATE google_connections SET updated_at=now()-interval '31 days' WHERE tenant_id=$1 AND id=$2", [tenants[0], failed.id]);
      await cleanupGoogleConnections(cleanup);
      const wiped = (await cleanup.query('SELECT status,verifier_envelope,state_hash FROM google_connections WHERE tenant_id=$1 AND id=$2', [tenants[0], expired.id])).rows[0];
      assert.deepEqual(wiped, { status: 'FAILED', verifier_envelope: null, state_hash: null });
      assert.equal((await cleanup.query('SELECT 1 FROM google_connections WHERE tenant_id=$1 AND id=$2', [tenants[0], failed.id])).rowCount, 0);
      // Roll back global maintenance so this test changes only its own fixtures.
      await cleanup.query('ROLLBACK');
    } finally { await cleanup.query('ROLLBACK'); cleanup.release(); }
    const worker = new Database(process.env.BUILDER_WORKER_DATABASE_URL!);
    try { await assert.rejects(worker.pool.query('SELECT * FROM google_connections'), { code: '42501' }); } finally { await worker.pool.end(); }
  } finally {
    release?.(); server.close(); await once(server, 'close');
    for (const tenant of tenants) await maintenance.query('DELETE FROM tenants WHERE id=$1', [tenant]);
    for (const user of users) await maintenance.query('DELETE FROM users WHERE id=$1', [user]);
    await db.pool.end(); await maintenance.end();
  }
});
