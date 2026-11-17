import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import pg from 'pg';
import { Database, hashToken } from '../src/database.ts';
import { createApp } from '../src/app.ts';

for (const key of ['DATABASE_URL', 'ADMIN_DATABASE_URL']) {
  if (!process.env[key] || new URL(process.env[key]!).pathname !== '/superagent_test') throw new Error('Dedicated test database required.');
}
test('tenant draft history, simulation and exact-revision approval remain isolated and atomic', async () => {
  const db = new Database(process.env.DATABASE_URL!);
  const maintenance = new pg.Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
  const users = [randomUUID(), randomUUID(), randomUUID()];
  const tokens = users.map(() => randomBytes(32).toString('base64url'));
  const tenantA = randomUUID(); const tenantB = randomUUID();
  const scenarioId = randomUUID(); const draftId = randomUUID();
  const server = createApp(db).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/v1`;
  async function request(path: string, method = 'GET', body?: unknown, token = tokens[0]!) {
    const res = await fetch(`${base}${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: res.status, body: await res.json() };
  }
  const path = `/tenants/${tenantA}/drafts/${draftId}`;
  const content = { name: 'Shop A assistant', goal: 'Review this local text workflow', language: 'darija' };
  const create = { id: draftId, scenarioId, scenarioRevision: 1, content };
  try {
    for (let i = 0; i < users.length; i++) {
      await maintenance.query('INSERT INTO users(id, email, password_hash) VALUES ($1, $2, $3)', [users[i], `${users[i]}@example.test`, 'builder-test-fixture']);
      await maintenance.query("INSERT INTO sessions(token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '1 hour')", [hashToken(tokens[i]!), users[i]]);
    }
    await maintenance.query('INSERT INTO platform_admins(user_id) VALUES ($1)', [users[0]]);
    await maintenance.query('INSERT INTO tenants(id, name, created_by) VALUES ($1, $2, $3), ($4, $5, $6)', [tenantA, 'Shop A', users[0], tenantB, 'Shop B', users[1]]);
    await maintenance.query("INSERT INTO memberships(tenant_id, user_id, role) VALUES ($1, $2, 'OWNER'), ($3, $4, 'OWNER'), ($1, $5, 'STAFF')", [tenantA, users[0], tenantB, users[1], users[2]]);
    const scenario = JSON.parse(readFileSync(new URL('../examples/scenario.json', import.meta.url), 'utf8'));
    assert.equal((await request('/admin/scenarios', 'POST', { ...scenario, id: scenarioId })).status, 201);
    assert.equal((await request('/admin/scenarios/' + scenarioId + '/releases', 'POST', { expectedRevision: 1 })).status, 201);
    assert.equal((await request(`/tenants/${tenantA}/drafts`, 'POST', { ...create, scenarioRevision: 99 })).status, 404);
    assert.equal((await request(`/tenants/${tenantA}/drafts`, 'POST', create)).status, 201);
    assert.equal((await request(`/tenants/${tenantA}/drafts`, 'POST', create)).status, 200);
    assert.equal((await request(path)).body.revision, 1);
    assert.equal((await request(path, 'GET', undefined, tokens[1])).status, 404);
    assert.equal((await request(path, 'GET', undefined, tokens[2])).status, 200);
    assert.equal((await request(path, 'PUT', { expectedRevision: 1, content }, tokens[2])).status, 403);
    assert.equal((await request(path + '/approve', 'POST', { expectedRevision: 1 }, tokens[2])).status, 403);
    assert.equal((await request(path + '/simulations', 'POST', { expectedRevision: 1 }, tokens[2])).status, 403);
    assert.equal((await request(`/tenants/${tenantA}/drafts`, 'POST', { ...create, workflow: {} })).status, 422);
    assert.equal((await request(path + '/approve', 'POST', { expectedRevision: 1 })).body.error.code, 'SIMULATION_REQUIRED');
    assert.equal((await request(path + '/simulations', 'POST', { expectedRevision: 1 })).status, 201);
    assert.equal((await request(path + '/simulations', 'POST', { expectedRevision: 1 })).status, 200);
    const approvals = await Promise.all([request(path + '/approve', 'POST', { expectedRevision: 1 }), request(path + '/approve', 'POST', { expectedRevision: 1 })]);
    assert.deepEqual(approvals.map(result => result.status).sort(), [200, 201]);
    assert.deepEqual(approvals[0]!.body, approvals[1]!.body);
    const approved = await request(path);
    assert.equal(approved.body.approval.revisionHash, approved.body.revisionHash);
    assert.equal(approved.body.approval.approvedBy, users[0]);
    assert.equal((await request(path, 'PUT', { expectedRevision: 1, content: { ...content, goal: 'New setup goal' } })).status, 200);
    assert.equal((await request(path)).body.approval, null);
    assert.equal((await request(path + '/approve', 'POST', { expectedRevision: 1 })).status, 409);
    const edits = await Promise.all([
      request(path, 'PUT', { expectedRevision: 2, content: { ...content, name: 'Edit A' } }),
      request(path, 'PUT', { expectedRevision: 2, content: { ...content, name: 'Edit B' } }),
    ]);
    assert.deepEqual(edits.map(result => result.status).sort(), [200, 409]);
    const history = await request(path + '/revisions');
    assert.deepEqual(history.body.data.map((row: { revision: number }) => row.revision), [1, 2, 3]);
    assert.equal(history.body.data[0].content.goal, content.goal);
    assert.equal((await request(path + '/approve', 'POST', { expectedRevision: 3 })).status, 409);
    assert.equal((await request(path + '/simulations', 'POST', { expectedRevision: 3 })).status, 201);
    assert.equal((await request(path + '/approve', 'POST', { expectedRevision: 3 })).status, 201);
    const staleApproval = await request(path + '/approve', 'POST', { expectedRevision: 1 });
    assert.equal(staleApproval.status, 409);
    assert.equal(staleApproval.body.error.code, 'STALE_REVISION');
    // Failure to append immutable history must roll back the mutable head too.
    await maintenance.query('REVOKE INSERT ON draft_revisions FROM superagent_app');
    try {
      assert.equal((await request(path, 'PUT', { expectedRevision: 3, content: { ...content, name: 'Must roll back' } })).status, 500);
      assert.equal((await request(path)).body.revision, 3);
      assert.ok((await request(path)).body.approval);
    } finally { await maintenance.query('GRANT INSERT ON draft_revisions TO superagent_app'); }
    assert.equal((await request(`/tenants/${tenantA}/drafts`, 'POST', create)).body.revision, 3);
    assert.equal((await request(`/tenants/${tenantA}/drafts`, 'POST', { ...create, content: { ...content, name: 'Another intent' } })).status, 409);
    assert.equal((await request(`/tenants/${tenantB}/drafts`, 'POST', { ...create, content: { ...content, name: 'Shop B assistant' } }, tokens[1])).status, 201);
    assert.equal((await request(`/tenants/${tenantB}/drafts/${draftId}/approve`, 'POST', { expectedRevision: 1 }, tokens[1])).body.error.code, 'SIMULATION_REQUIRED');
    assert.equal((await request(path + '/approve', 'POST', { expectedRevision: 3 }, tokens[1])).status, 404);
    assert.equal((await request(`/tenants/${tenantB}/drafts/${draftId}`)).status, 404);
    assert.equal((await request(`/tenants/${tenantA}/drafts`)).body.data.length, 1);
    await db.authenticated(tokens[1]!, async client => {
      for (const table of ['builder_drafts', 'draft_revisions', 'draft_simulations', 'draft_approvals']) {
        assert.equal((await client.query(`SELECT * FROM ${table} WHERE tenant_id = $1`, [tenantA])).rowCount, 0);
      }
      assert.equal((await client.query('UPDATE builder_drafts SET current_revision = 1 WHERE tenant_id = $1', [tenantA])).rowCount, 0);
    });
    await assert.rejects(db.authenticated(tokens[0]!, client => client.query("UPDATE draft_revisions SET content = '{}' WHERE tenant_id = $1", [tenantA])), { code: '42501' });
    await assert.rejects(db.authenticated(tokens[0]!, client => client.query('DELETE FROM draft_approvals WHERE tenant_id = $1', [tenantA])), { code: '42501' });
    await assert.rejects(db.authenticated(tokens[0]!, client => client.query('UPDATE builder_drafts SET current_revision = 99 WHERE tenant_id = $1 AND id = $2', [tenantA, draftId])), { code: '23503' });
    assert.equal((await request(path)).body.revision, 3);
    await assert.rejects(db.authenticated(tokens[2]!, client => client.query(`INSERT INTO draft_approvals(tenant_id, draft_id, revision, simulator_version, revision_hash, approved_by)
      SELECT tenant_id, draft_id, revision, simulator_version, revision_hash, $2 FROM draft_approvals WHERE tenant_id = $1 AND revision = 3`, [tenantA, users[2]])), { code: '42501' });
    // Catalog edits/releases cannot change the tenant's pinned scenario.
    assert.equal((await request(`/admin/scenarios/${scenarioId}/draft`, 'PUT', { expectedRevision: 1, definition: { ...scenario.definition, name: 'Catalog changed' } })).status, 200);
    assert.equal((await request(`/admin/scenarios/${scenarioId}/releases`, 'POST', { expectedRevision: 2 })).status, 201);
    assert.equal((await request(path)).body.scenarioRevision, 1);
    assert.equal((await request(path)).body.scenarioDefinition.name, scenario.definition.name);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await maintenance.query('DELETE FROM tenants WHERE id = ANY($1::uuid[])', [[tenantA, tenantB]]);
    await maintenance.query('DELETE FROM scenarios WHERE id = $1', [scenarioId]);
    await maintenance.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
    await db.pool.end(); await maintenance.end();
  }
});
