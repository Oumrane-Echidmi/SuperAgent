import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { Database, hashToken } from '../src/database.ts';
import { createApp } from '../src/app.ts';

for (const key of ['DATABASE_URL', 'ADMIN_DATABASE_URL']) {
  if (!process.env[key] || new URL(process.env[key]!).pathname !== '/superagent_test') throw new Error('Dedicated test database required.');
}
test('declared settings affect tenant previews, approval hashes and matching without changing the release', async () => {
  const db = new Database(process.env.DATABASE_URL!);
  const maintenance = new pg.Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
  const users = [randomUUID(), randomUUID()]; const tenants = [randomUUID(), randomUUID()];
  const tokens = users.map(() => randomBytes(32).toString('base64url'));
  const scenarioId = randomUUID(); const invalidId = randomUUID(); const draftId = randomUUID(); const matchId = randomUUID();
  const server = createApp(db).listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/v1`;
  async function request(path: string, method = 'GET', body?: unknown, token = tokens[0]!) {
    const res = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, body: await res.json() };
  }
  try {
    for (let i = 0; i < users.length; i++) {
      await maintenance.query('INSERT INTO users(id, email, password_hash) VALUES ($1, $2, $3)', [users[i], `${users[i]}@example.test`, 'customization-test-fixture']);
      await maintenance.query("INSERT INTO sessions(token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '1 hour')", [hashToken(tokens[i]!), users[i]]);
      await maintenance.query('INSERT INTO tenants(id, name, created_by) VALUES ($1, $2, $3)', [tenants[i], 'Settings test shop', users[i]]);
      await maintenance.query("INSERT INTO memberships(tenant_id, user_id, role) VALUES ($1, $2, 'OWNER')", [tenants[i], users[i]]);
    }
    await maintenance.query('INSERT INTO platform_admins(user_id) VALUES ($1)', [users[0]]);
    const scenario = JSON.parse(readFileSync(new URL('../examples/customizable-scenario.json', import.meta.url), 'utf8'));
    assert.equal((await request('/admin/scenarios', 'POST', { ...scenario, id: scenarioId })).status, 201);
    assert.equal((await request(`/admin/scenarios/${scenarioId}/releases`, 'POST', { expectedRevision: 1 })).status, 201);
    const content = { name: 'My local demo', goal: 'trier les messages', language: 'fr', parameters: { matchedReason: 'شكرا' } };
    const drafts = `/tenants/${tenants[0]}/drafts`;
    const path = `${drafts}/${draftId}`;
    const created = await request(drafts, 'POST', { id: draftId, scenarioId, scenarioRevision: 1, content });
    assert.equal(created.status, 201, JSON.stringify(created));
    assert.equal(created.body.effectiveParameters.matchedReason, 'شكرا');
    assert.equal(created.body.effectiveFixtures[0].expectedReason, 'شكرا');
    assert.equal((await request(path + '/simulations', 'POST', { expectedRevision: 1 })).body.report.cases[0].reason, 'شكرا');
    assert.equal((await request(path + '/approve', 'POST', { expectedRevision: 1 })).status, 201);
    const invalid = await request(path, 'PUT', { expectedRevision: 1, content: { ...content, parameters: { matchedReason: 'unlisted' } } });
    assert.equal(invalid.status, 422);
    assert.ok((await request(path)).body.approval);
    const edited = await request(path, 'PUT', { expectedRevision: 1, content: { ...content, parameters: { matchedReason: 'Merci' } } });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.approval, null);
    assert.notEqual(edited.body.revisionHash, created.body.revisionHash);
    assert.equal((await request(`/scenarios/${scenarioId}/releases/1`)).body.definition.workflow.nodes[2].inputs.reason.value, 'Merci');
    const bad = structuredClone(scenario.definition); bad.fixtures[0].expectedReason = 'Merci';
    assert.equal((await request('/admin/scenarios', 'POST', { id: invalidId, definition: bad })).status, 201);
    assert.equal((await request(`/admin/scenarios/${invalidId}/releases`, 'POST', { expectedRevision: 1 })).status, 422);

    const matches = `/tenants/${tenants[0]}/builder/matches`;
    const intent = { id: matchId, goal: 'Je veux trier les messages', language: 'fr' };
    const first = await request(matches, 'POST', intent);
    assert.equal(first.status, 201);
    assert.equal(first.body.result.state, 'CANDIDATES');
    assert.ok(first.body.result.candidates.some((candidate: { scenarioId: string }) => candidate.scenarioId === scenarioId));
    assert.ok(!first.body.result.candidates.some((candidate: { scenarioId: string }) => candidate.scenarioId === invalidId));
    assert.deepEqual((await request(matches, 'POST', intent)).body, first.body);
    assert.equal((await request(matches, 'POST', { ...intent, goal: 'different' })).status, 409);
    assert.equal((await request(`${matches}/${matchId}`, 'GET', undefined, tokens[1])).status, 404);
    const unsupportedId = randomUUID();
    const otherPath = `/tenants/${tenants[1]}/builder/matches`;
    const unsupported = { id: unsupportedId, goal: 'an unsupported goal for testing', language: 'darija' };
    const results = await Promise.all([request(otherPath, 'POST', unsupported, tokens[1]), request(otherPath, 'POST', unsupported, tokens[1])]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 201]);
    assert.equal(results[0]!.body.result.state, 'UNSUPPORTED');
    assert.ok((await request('/admin/builder-requests')).body.data.some((entry: { id: string }) => entry.id === unsupportedId));
    assert.equal((await request('/admin/builder-requests', 'GET', undefined, tokens[1])).status, 403);
    await db.authenticated(tokens[1]!, async client => {
      assert.equal((await client.query('SELECT * FROM builder_match_requests WHERE tenant_id = $1', [tenants[0]])).rowCount, 0);
    });
    await assert.rejects(db.authenticated(tokens[1]!, client => client.query("UPDATE builder_match_requests SET goal = 'changed' WHERE tenant_id = $1", [tenants[1]])), { code: '42501' });
    await maintenance.query("UPDATE builder_match_requests SET created_at = now() - interval '31 days' WHERE tenant_id = $1 AND id = $2", [tenants[1], unsupportedId]);
    execFileSync(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('../scripts/cleanup-builder-requests.ts', import.meta.url))], { env: process.env });
    assert.equal((await request(`${otherPath}/${unsupportedId}`, 'GET', undefined, tokens[1])).status, 404);
    assert.equal((await request(`${matches}/${matchId}`)).status, 200);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await maintenance.query('DELETE FROM tenants WHERE id = ANY($1::uuid[])', [tenants]);
    await maintenance.query('DELETE FROM scenarios WHERE id = ANY($1::uuid[])', [[scenarioId, invalidId]]);
    await maintenance.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
    await db.pool.end(); await maintenance.end();
  }
});
