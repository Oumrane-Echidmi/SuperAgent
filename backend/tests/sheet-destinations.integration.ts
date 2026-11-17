import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import pg from 'pg';
import { Database, hashToken } from '../src/database.ts';
import { createApp } from '../src/app.ts';
import { CredentialVault } from '../src/credentials.ts';
import { GoogleSheetsProvider } from '../src/google-sheets.ts';
import { GOOGLE_FILE_SCOPE } from '../src/google-oauth.ts';
import { cleanupGoogleConnections } from '../src/google-connection-maintenance.ts';

for (const key of ['DATABASE_URL', 'ADMIN_DATABASE_URL']) {
  if (!process.env[key] || new URL(process.env[key]!).pathname !== '/superagent_test') throw new Error('Dedicated test database required.');
}
test('sheet destinations verify access, preserve immutable selection and fence refresh, disconnect and ownership races', async () => {
  const db = new Database(process.env.DATABASE_URL!); const maintenance = new pg.Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
  const users = [randomUUID(), randomUUID(), randomUUID()]; const tenants = [randomUUID(), randomUUID()]; const connections = [randomUUID(), randomUUID(), randomUUID()];
  const tokens = users.map(() => randomBytes(32).toString('base64url'));
  const vault = new CredentialVault('test-key', { 'test-key': randomBytes(32).toString('base64') });
  const config = { clientId: 'client', clientSecret: 'secret', redirectUri: 'https://app.example.test/callback', vault };
  let calls = 0; let refreshes = 0; let mode = 'normal'; let expectedRefresh = 'refresh-secret'; let release: (() => void) | undefined;
  async function waitForProvider() {
    for (let i = 0; !release && i < 200; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(release, 'Provider request should start.');
  }
  function resume() { assert.ok(release); release(); release = undefined; }
  const provider = new GoogleSheetsProvider({ clientId: 'client', clientSecret: 'secret' }, async (url, init) => {
    calls++; const target = new URL(String(url));
    if (target.hostname === 'oauth2.googleapis.com') {
      refreshes++; assert.equal(new URLSearchParams(String(init?.body)).get('refresh_token'), expectedRefresh);
      if (mode === 'refresh-failure') return Response.json({ error: 'invalid_grant' }, { status: 400 });
      if (mode === 'rotate-read-only') {
        expectedRefresh = 'rotated-secret';
        return Response.json({ access_token: 'access-secret', token_type: 'Bearer', expires_in: 3600, refresh_token: expectedRefresh });
      }
      return Response.json({ access_token: 'access-secret', token_type: 'Bearer', expires_in: 3600 });
    }
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer access-secret');
    assert.equal(init?.method, 'GET');
    if (target.hostname === 'www.googleapis.com') return Response.json({ id: 'sheet-123', mimeType: 'application/vnd.google-apps.spreadsheet', trashed: false, capabilities: { canEdit: !['read-only','rotate-read-only'].includes(mode) } });
    if (mode === 'block') { mode = 'normal'; await new Promise<void>(resolve => { release = resolve; }); }
    return Response.json({ spreadsheetId: 'sheet-123', properties: { title: 'Shop orders' }, sheets: [{ properties: { sheetId: 0, title: 'Orders', sheetType: 'GRID', gridProperties: { rowCount: 1000, columnCount: 26 } } }] });
  });
  const server = createApp(db, { google: config, googleSheets: provider }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string'); const base = `http://127.0.0.1:${address.port}/v1`;
  const root = `/tenants/${tenants[0]}/sheet-destinations`;
  const inspection = `/tenants/${tenants[0]}/connections/google/${connections[0]}/spreadsheet-inspections`;
  const selection = { id: randomUUID(), connectionId: connections[0], spreadsheetId: 'sheet-123', sheetId: 0 };
  async function request(path: string, method = 'GET', body?: unknown, bearer = tokens[0]!) {
    const res = await fetch(base + path, { method, headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') };
  }
  const inspect = () => request(inspection, 'POST', { spreadsheetId: 'sheet-123' });
  try {
    for (let i = 0; i < users.length; i++) {
      await maintenance.query('INSERT INTO users(id,email,password_hash) VALUES ($1,$2,$3)', [users[i], `${users[i]}@example.test`, 'sheet-test-fixture']);
      await maintenance.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '1 hour')", [hashToken(tokens[i]!), users[i]]);
      if (i < tenants.length) {
        await maintenance.query('INSERT INTO tenants(id,name,created_by) VALUES ($1,$2,$3)', [tenants[i], 'Sheet test shop', users[i]]);
        await maintenance.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES ($1,$2,'OWNER')", [tenants[i], users[i]]);
      }
    }
    await maintenance.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES ($1,$2,'STAFF')", [tenants[0], users[2]]);
    for (let i = 0; i < connections.length; i++) {
      const tid = tenants[i === 1 ? 1 : 0]!; const actor = users[i === 1 ? 1 : 0];
      await maintenance.query(`INSERT INTO google_connections(tenant_id,id,created_by,oauth_client_id,redirect_uri,status,credential_envelope,scopes,connected_at)
        VALUES ($1,$2,$3,'client',$4,'CONNECTED',$5,$6,now())`, [tid, connections[i], actor, config.redirectUri, JSON.stringify(vault.seal('refresh-secret', { tenantId: tid, connectionId: connections[i]!, provider: 'google' })), [GOOGLE_FILE_SCOPE]]);
    }
    assert.equal((await request(root, 'POST', selection, '')).status, 401);
    assert.equal((await request(root, 'POST', selection, tokens[1])).status, 404);
    assert.equal((await request(root, 'POST', selection, tokens[2])).status, 403);
    assert.equal((await request(root, 'POST', { ...selection, connectionId: connections[1] })).status, 404); assert.equal(calls, 0);
    const preview = await inspect(); assert.equal(preview.status, 200); assert.equal(preview.cache, 'no-store'); assert.equal(preview.body.tabs[0].sheetId, 0);
    assert.ok(!JSON.stringify(preview.body).includes('secret'));
    const created = await request(root, 'POST', selection); assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.tabTitle, 'Orders'); assert.equal(created.body.status, 'ACCESS_CHECKED'); assert.equal(created.body.sheetId, 0);
    const beforeReplay = calls;
    assert.deepEqual((await request(root, 'POST', selection)).body, created.body); assert.equal(calls, beforeReplay);
    assert.equal((await request(root, 'POST', { ...selection, sheetId: 1 })).status, 409); assert.equal(calls, beforeReplay);
    assert.equal((await request(root + '/' + selection.id)).status, 200); assert.equal((await request(root)).body.data.length, 1);
    assert.equal((await request(root + '/' + selection.id, 'GET', undefined, tokens[1])).status, 404);
    await db.authenticated(tokens[1]!, async client => assert.equal((await client.query('SELECT * FROM sheet_destinations WHERE tenant_id=$1', [tenants[0]])).rowCount, 0));
    await db.authenticated(tokens[2]!, async client => assert.equal((await client.query('SELECT * FROM sheet_destinations WHERE tenant_id=$1', [tenants[0]])).rowCount, 0));
    await assert.rejects(db.authenticated(tokens[0]!, client => client.query('UPDATE sheet_destinations SET sheet_id=1 WHERE tenant_id=$1', [tenants[0]])), { code: '42501' });
    await assert.rejects(db.authenticated(tokens[0]!, client => client.query('DELETE FROM sheet_destinations WHERE tenant_id=$1', [tenants[0]])), { code: '42501' });
    assert.equal((await request(root, 'POST', { ...selection, id: randomUUID(), sheetId: 999 })).status, 422);
    mode = 'read-only'; assert.equal((await request(root, 'POST', { ...selection, id: randomUUID() })).status, 403);
    mode = 'refresh-failure'; assert.equal((await inspect()).body.error.code, 'GOOGLE_RECONNECT_REQUIRED');
    mode = 'block'; const pending = inspect(); await waitForProvider(); const count = refreshes;
    assert.equal((await inspect()).body.error.code, 'GOOGLE_BUSY'); assert.equal(refreshes, count);
    // Simulate a crashed/slow lease holder; a replacement check succeeds, but the old result is fenced out.
    await maintenance.query("UPDATE google_connections SET access_lease_until=now()-interval '1 second' WHERE tenant_id=$1 AND id=$2", [tenants[0], connections[0]]);
    assert.equal((await inspect()).status, 200); resume(); assert.equal((await pending).status, 409);
    mode = 'block'; const lostOwner = inspect(); await waitForProvider();
    await maintenance.query("UPDATE memberships SET role='STAFF' WHERE tenant_id=$1 AND user_id=$2", [tenants[0], users[0]]);
    resume(); assert.equal((await lostOwner).status, 403);
    await maintenance.query("UPDATE memberships SET role='OWNER' WHERE tenant_id=$1 AND user_id=$2", [tenants[0], users[0]]);
    await maintenance.query("UPDATE google_connections SET access_lease_until=now()-interval '1 second' WHERE tenant_id=$1 AND id=$2 AND access_lease_id IS NOT NULL", [tenants[0], connections[0]]);
    mode = 'block'; const lateId = randomUUID(); const lateBinding = request(root, 'POST', { ...selection, id: lateId }); await waitForProvider();
    assert.equal((await request(`/tenants/${tenants[0]}/connections/google/${connections[0]}`, 'DELETE')).status, 200);
    resume(); assert.equal((await lateBinding).status, 409);
    assert.equal((await request(root + '/' + lateId)).status, 404);
    assert.equal((await request(root + '/' + selection.id)).body.status, 'CONNECTION_UNAVAILABLE');
    assert.equal((await inspect()).body.error.code, 'GOOGLE_RECONNECT_REQUIRED');
    await maintenance.query("UPDATE google_connections SET inspection_count=20,inspection_window=now() WHERE tenant_id=$1 AND id=$2", [tenants[0], connections[2]]);
    const quotaPath = `/tenants/${tenants[0]}/connections/google/${connections[2]}/spreadsheet-inspections`;
    assert.equal((await request(quotaPath, 'POST', { spreadsheetId: 'sheet-123' })).status, 429);
    await maintenance.query("UPDATE google_connections SET inspection_window=now()-interval '16 minutes' WHERE tenant_id=$1 AND id=$2", [tenants[0], connections[2]]);
    assert.equal((await request(quotaPath, 'POST', { spreadsheetId: 'sheet-123' })).status, 200);
    mode = 'rotate-read-only';
    assert.equal((await request(quotaPath, 'POST', { spreadsheetId: 'sheet-123' })).status, 403);
    const rotated = (await maintenance.query('SELECT credential_envelope FROM google_connections WHERE tenant_id=$1 AND id=$2', [tenants[0], connections[2]])).rows[0];
    assert.equal(vault.open(rotated.credential_envelope, { tenantId: tenants[0]!, connectionId: connections[2]!, provider: 'google' }), 'rotated-secret');
    mode = 'normal'; assert.equal((await request(quotaPath, 'POST', { spreadsheetId: 'sheet-123' })).status, 200);
    const client = await maintenance.connect();
    try {
      await client.query('BEGIN');
      await client.query("UPDATE google_connections SET updated_at=now()-interval '31 days' WHERE tenant_id=$1 AND id=$2", [tenants[0], connections[0]]);
      await cleanupGoogleConnections(client);
      assert.equal((await client.query('SELECT 1 FROM sheet_destinations WHERE tenant_id=$1 AND id=$2', [tenants[0], selection.id])).rowCount, 1);
      await client.query('ROLLBACK');
    } finally { await client.query('ROLLBACK'); client.release(); }
    const worker = new Database(process.env.BUILDER_WORKER_DATABASE_URL!);
    try { await assert.rejects(worker.pool.query('SELECT * FROM sheet_destinations'), { code: '42501' }); } finally { await worker.pool.end(); }
    assert.equal((await maintenance.query('SELECT 1 FROM sheet_sync_requests WHERE tenant_id=$1', [tenants[0]])).rowCount, 0);
  } finally {
    release?.(); server.close(); await once(server, 'close');
    for (const tenant of tenants) await maintenance.query('DELETE FROM tenants WHERE id=$1', [tenant]);
    for (const user of users) await maintenance.query('DELETE FROM users WHERE id=$1', [user]);
    await db.pool.end(); await maintenance.end();
  }
});
