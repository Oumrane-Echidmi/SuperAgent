import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import pg from 'pg';
import { Database, hashToken } from '../src/database.ts';
import { createApp } from '../src/app.ts';

for (const key of ['DATABASE_URL', 'ADMIN_DATABASE_URL']) {
  if (!process.env[key] || new URL(process.env[key]!).pathname !== '/superagent_test') throw new Error('Dedicated superagent_test database required.');
}
const definition = () => ({
  name: 'Text routing demo', description: 'Routes an exact text match for local testing.',
  workflow: JSON.parse(readFileSync(new URL('../examples/typed-workflow.json', import.meta.url), 'utf8')),
  fixtures: [
    { name: 'match', event: { text: 'yes' }, expectedPath: ['receive', 'decision', 'matched'], expectedReason: 'Text matched' },
    { name: 'fallback', event: { text: 'no' }, expectedPath: ['receive', 'decision', 'unmatched'], expectedReason: 'Text did not match' },
  ],
});

test('scenario releases enforce admin role, fixture gates, exact revision, replay and immutability', async () => {
  const db = new Database(process.env.DATABASE_URL!);
  const maintenance = new pg.Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
  const adminId = randomUUID();
  const ownerId = randomUUID();
  const scenarioId = randomUUID();
  const failedId = randomUUID();
  const tenantId = randomUUID();
  const adminToken = randomBytes(32).toString('base64url');
  const ownerToken = randomBytes(32).toString('base64url');
  const server = createApp(db).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  async function request(path: string, method = 'GET', body?: unknown, token = adminToken) {
    const res = await fetch(`${base}/v1${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, body: await res.json() };
  }
  try {
    for (const [id, token] of [[adminId, adminToken], [ownerId, ownerToken]]) {
      await maintenance.query('INSERT INTO users(id, email, password_hash) VALUES ($1, $2, $3)', [id, `${id}@example.test`, 'not-a-login-password']);
      await maintenance.query("INSERT INTO sessions(token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '1 hour')", [hashToken(token!), id]);
    }
    await maintenance.query('INSERT INTO platform_admins(user_id) VALUES ($1)', [adminId]);
    await maintenance.query('INSERT INTO tenants(id, name, created_by) VALUES ($1, $2, $3)', [tenantId, 'Catalog test shop', ownerId]);
    await maintenance.query("INSERT INTO memberships(tenant_id, user_id, role) VALUES ($1, $2, 'OWNER')", [tenantId, ownerId]);
    const create = { id: scenarioId, definition: definition() };
    assert.equal((await request('/admin/scenarios', 'POST', create, ownerToken)).status, 403);
    assert.equal((await request('/admin/scenarios', 'POST', create, 'bad')).status, 401);
    assert.equal((await request('/admin/scenarios', 'POST', create)).status, 201);
    assert.equal((await request('/admin/scenarios', 'POST', create)).status, 200);
    assert.equal((await request('/admin/scenarios', 'POST', { ...create, definition: { ...definition(), name: 'Different intent' } })).status, 409);
    assert.equal((await request(`/admin/scenarios/${scenarioId}`, 'GET', undefined, ownerToken)).status, 403);
    const preview = await request(`/admin/scenarios/${scenarioId}/simulations`, 'POST', { expectedRevision: 1 });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.report.valid, true);
    const before = await request('/scenarios', 'GET', undefined, ownerToken);
    assert.ok(!before.body.data.some((entry: { scenarioId: string }) => entry.scenarioId === scenarioId));

    const releaseUrl = `/admin/scenarios/${scenarioId}/releases`;
    const concurrent = await Promise.all([request(releaseUrl, 'POST', { expectedRevision: 1 }), request(releaseUrl, 'POST', { expectedRevision: 1 })]);
    assert.deepEqual(concurrent.map(result => result.status).sort(), [200, 201]);
    assert.deepEqual(concurrent[0]!.body, concurrent[1]!.body);
    assert.equal(concurrent[0]!.body.simulationReport.valid, true);
    const snapshot = await request(`/scenarios/${scenarioId}/releases/1`, 'GET', undefined, ownerToken);
    assert.equal(snapshot.status, 200);
    assert.equal(snapshot.body.definition.name, definition().name);
    const edits = await Promise.all([
      request(`/admin/scenarios/${scenarioId}/draft`, 'PUT', { expectedRevision: 1, definition: { ...definition(), name: 'New draft A' } }),
      request(`/admin/scenarios/${scenarioId}/draft`, 'PUT', { expectedRevision: 1, definition: { ...definition(), name: 'New draft B' } }),
    ]);
    assert.deepEqual(edits.map(result => result.status).sort(), [200, 409]);
    assert.equal((await request(`/admin/scenarios/${scenarioId}`, 'GET')).body.revision, 2);
    assert.deepEqual((await request(`/scenarios/${scenarioId}/releases/1`, 'GET', undefined, ownerToken)).body, snapshot.body);
    assert.deepEqual((await request(releaseUrl, 'POST', { expectedRevision: 1 })).body, snapshot.body);
    assert.equal((await request(releaseUrl, 'POST', { expectedRevision: 99 })).status, 409);
    assert.equal((await request(releaseUrl, 'POST', { expectedRevision: 2 }, ownerToken)).status, 403);
    // Fail the actual audit write and prove the release insert rolls back with it.
    await maintenance.query('REVOKE INSERT ON scenario_audit FROM superagent_app');
    try {
      const failedAudit = await request(releaseUrl, 'POST', { expectedRevision: 2 });
      assert.equal(failedAudit.status, 500);
      assert.deepEqual(failedAudit.body, { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
      assert.equal((await maintenance.query('SELECT 1 FROM scenario_releases WHERE scenario_id = $1 AND revision = 2', [scenarioId])).rowCount, 0);
    } finally { await maintenance.query('GRANT INSERT ON scenario_audit TO superagent_app'); }
    assert.equal((await request(releaseUrl, 'POST', { expectedRevision: 2 })).status, 201);
    assert.deepEqual((await request(`/scenarios/${scenarioId}/releases/1`, 'GET', undefined, ownerToken)).body, snapshot.body);
    assert.equal((await request('/admin/scenarios', 'POST', create)).status, 200);

    const unstoreable = definition();
    unstoreable.name = 'invalid\u0000text';
    assert.equal((await request('/admin/scenarios', 'POST', { id: failedId, definition: unstoreable })).status, 422);
    const failed = definition();
    failed.fixtures = failed.fixtures.slice(0, 1);
    assert.equal((await request('/admin/scenarios', 'POST', { id: failedId, definition: failed })).status, 201);
    assert.equal((await request(`/admin/scenarios/${failedId}/simulations`, 'POST', { expectedRevision: 1 })).body.report.valid, false);
    const blocked = await request(`/admin/scenarios/${failedId}/releases`, 'POST', { expectedRevision: 1 });
    assert.equal(blocked.status, 422);
    assert.equal(blocked.body.error.code, 'SCENARIO_NOT_READY');
    assert.ok(blocked.body.error.details.uncoveredEdges.length > 0);
    assert.equal((await request(`/scenarios/${failedId}/releases/1`, 'GET', undefined, ownerToken)).status, 404);
    const invalid = definition();
    invalid.workflow.nodes[1].capability.name = 'whatsapp.send';
    assert.equal((await request(`/admin/scenarios/${failedId}/draft`, 'PUT', { expectedRevision: 1, definition: invalid })).status, 200);
    assert.equal((await request(`/admin/scenarios/${failedId}/releases`, 'POST', { expectedRevision: 2 })).status, 422);

    // Runtime SQL grants/policies must enforce catalog restrictions independently of HTTP.
    await db.authenticated(ownerToken, async client => {
      assert.equal((await client.query('SELECT * FROM scenarios')).rowCount, 0);
      assert.equal((await client.query('SELECT * FROM scenario_audit')).rowCount, 0);
    });
    await assert.rejects(db.authenticated(ownerToken, client => client.query('INSERT INTO platform_admins(user_id) VALUES ($1)', [ownerId])), { code: '42501' });
    await assert.rejects(db.authenticated(ownerToken, client => client.query('INSERT INTO scenarios(id, draft, created_by) VALUES ($1, $2, $3)', [randomUUID(), definition(), ownerId])), { code: '42501' });
    await assert.rejects(db.authenticated(ownerToken, client => client.query('INSERT INTO scenario_releases(scenario_id, revision, definition, validation_report, simulation_report, created_by) SELECT scenario_id, 3, definition, validation_report, simulation_report, $2 FROM scenario_releases WHERE scenario_id = $1 AND revision = 1', [scenarioId, ownerId])), { code: '42501' });
    await assert.rejects(db.authenticated(adminToken, client => client.query("UPDATE scenario_releases SET definition = '{}' WHERE scenario_id = $1", [scenarioId])), { code: '42501' });
    await assert.rejects(db.authenticated(adminToken, client => client.query('DELETE FROM scenario_audit WHERE scenario_id = $1', [scenarioId])), { code: '42501' });
    const audit = await request(`/admin/scenarios/${scenarioId}/audit`);
    assert.deepEqual(audit.body.data.map((entry: { action: string }) => entry.action), ['CREATE_DRAFT', 'RELEASE', 'UPDATE_DRAFT', 'RELEASE']);
    assert.ok(audit.body.data.every((entry: { actorId: string }) => entry.actorId === adminId));
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await maintenance.query('DELETE FROM scenarios WHERE id = ANY($1::uuid[])', [[scenarioId, failedId]]);
    await maintenance.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
    await maintenance.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[adminId, ownerId]]);
    await db.pool.end();
    await maintenance.end();
  }
});
