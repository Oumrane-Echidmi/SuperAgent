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
import { processBuilderTurn } from '../src/builder-chat-worker.ts';
import type { BuilderAiInput, BuilderAiResponse } from '../src/builder-ai.ts';

for (const key of ['DATABASE_URL', 'ADMIN_DATABASE_URL', 'BUILDER_WORKER_DATABASE_URL']) {
  if (!process.env[key] || new URL(process.env[key]!).pathname !== '/superagent_test') throw new Error('Dedicated test database and worker role required.');
}
test('queued Builder chat isolates tenants, fences workers, meters attempts and never approves drafts', async () => {
  const db = new Database(process.env.DATABASE_URL!);
  const worker = new Database(process.env.BUILDER_WORKER_DATABASE_URL!);
  const maintenance = new pg.Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
  const users = [randomUUID(), randomUUID(), randomUUID()]; const tokens = users.map(() => randomBytes(32).toString('base64url'));
  const tenants = [randomUUID(), randomUUID()]; const sessions = [randomUUID(), randomUUID()]; const scenarioId = randomUUID();
  const server = createApp(db, { builderAiEnabled: true }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string'); const base = `http://127.0.0.1:${address.port}/v1`;
  async function request(path: string, method = 'GET', body?: unknown, token = tokens[0]!) {
    const res = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, body: await res.json() };
  }
  const collection = `/tenants/${tenants[0]}/builder/sessions`; const path = `${collection}/${sessions[0]}`;
  function result(input: BuilderAiInput, clarify = false): BuilderAiResponse {
    assert.equal(JSON.stringify(input).includes('PRIVATE_OTHER_SHOP'), false);
    return { extraction: { reply: clarify ? 'Quel objectif ?' : 'Voici une proposition à vérifier.',
      spec: { name: clarify ? null : 'Assistant', goal: clarify ? null : 'Trier les messages', language: 'fr', fields: [], constraints: [] },
      selection: clarify ? null : { scenarioId, revision: 1 }, parameters: [], questions: clarify ? ['Quel objectif ?'] : [], gaps: [] },
      responseId: 'resp_test', model: 'test-model', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } };
  }
  try {
    await worker.checkRuntimeRole();
    for (let i = 0; i < users.length; i++) {
      await maintenance.query('INSERT INTO users(id, email, password_hash) VALUES ($1, $2, $3)', [users[i], `${users[i]}@example.test`, 'chat-test-fixture']);
      await maintenance.query("INSERT INTO sessions(token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '1 hour')", [hashToken(tokens[i]!), users[i]]);
    }
    for (let i = 0; i < tenants.length; i++) {
      await maintenance.query('INSERT INTO tenants(id, name, created_by) VALUES ($1, $2, $3)', [tenants[i], 'Chat test shop', users[i]]);
      await maintenance.query("INSERT INTO memberships(tenant_id, user_id, role) VALUES ($1, $2, 'OWNER')", [tenants[i], users[i]]);
    }
    await maintenance.query("INSERT INTO memberships(tenant_id, user_id, role) VALUES ($1, $2, 'STAFF')", [tenants[0], users[2]]);
    await maintenance.query('INSERT INTO platform_admins(user_id) VALUES ($1)', [users[0]]);
    const scenario = JSON.parse(readFileSync(new URL('../examples/customizable-scenario.json', import.meta.url), 'utf8'));
    assert.equal((await request('/admin/scenarios', 'POST', { ...scenario, id: scenarioId })).status, 201);
    assert.equal((await request(`/admin/scenarios/${scenarioId}/releases`, 'POST', { expectedRevision: 1 })).status, 201);
    assert.equal((await request(collection, 'POST', { id: sessions[0], language: 'fr' })).status, 422);
    const create = { id: sessions[0], language: 'fr', consentToOpenAI: true };
    assert.equal((await request(collection, 'POST', create)).status, 201);
    assert.equal((await request(collection, 'POST', create)).status, 200);
    const disabled = createApp(db).listen(0, '127.0.0.1'); await once(disabled, 'listening');
    try {
      const disabledAddress = disabled.address(); assert.ok(disabledAddress && typeof disabledAddress !== 'string');
      const response = await fetch(`http://127.0.0.1:${disabledAddress.port}/v1${path}/messages`, { method: 'POST',
        headers: { Authorization: `Bearer ${tokens[0]}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: randomUUID(), expectedRevision: 0, text: 'disabled' }) });
      assert.equal(response.status, 503); assert.equal((await response.json()).error.code, 'BUILDER_AI_DISABLED');
    } finally { await new Promise<void>((resolve, reject) => disabled.close(error => error ? reject(error) : resolve())); }
    assert.equal((await request(path, 'GET', undefined, tokens[1])).status, 404);
    assert.equal((await request(path, 'GET', undefined, tokens[2])).status, 200);
    const first = { id: randomUUID(), expectedRevision: 0, text: 'مرحبا، بغيت نوجد مساعد للمتجر' };
    assert.equal((await request(path + '/messages', 'POST', first, tokens[2])).status, 403);
    assert.equal((await request(path + '/messages', 'POST', first)).status, 202);
    assert.equal((await request(path + '/messages', 'POST', first)).status, 200);
    assert.equal((await request(path + '/messages', 'POST', { ...first, text: 'changed' })).status, 409);

    // A different tenant's stored text must not appear in the inference context.
    const other = `/tenants/${tenants[1]}/builder/sessions`;
    await request(other, 'POST', { id: sessions[1], language: 'fr', consentToOpenAI: true }, tokens[1]);
    await request(`${other}/${sessions[1]}/messages`, 'POST', { id: randomUUID(), expectedRevision: 0, text: 'PRIVATE_OTHER_SHOP' }, tokens[1]);
    await maintenance.query("UPDATE builder_chat_turns SET status = 'FAILED', error_code = 'TEST_FIXTURE', completed_at = now() WHERE tenant_id = $1", [tenants[1]]);
    let enter!: () => void; let release!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; }); const held = new Promise<void>(resolve => { release = resolve; });
    let calls = 0;
    const provider = { async infer(input: BuilderAiInput) { calls++; assert.equal(input.message, first.text); enter(); await held; return result(input, true); } };
    const processing = processBuilderTurn(worker, provider);
    await Promise.race([entered, processing.then(() => { throw new Error('Worker finished before inference.'); })]);
    assert.equal(await processBuilderTurn(worker, provider), false);
    assert.equal((await request(path + '/messages', 'POST', { id: randomUUID(), expectedRevision: 1, text: 'still pending' })).body.error.code, 'TURN_PENDING');
    release(); await processing; assert.equal(calls, 1);
    assert.equal((await request(path)).body.turns[0].result.status, 'NEEDS_DETAILS');
    assert.equal((await request(path + '/messages', 'POST', first)).status, 200);
    assert.equal(await processBuilderTurn(worker, provider), false);
    const second = { id: randomUUID(), expectedRevision: 1, text: 'Trier les messages' };
    assert.equal((await request(path + '/messages', 'POST', second)).status, 202);
    await processBuilderTurn(worker, { async infer(input) { assert.equal(input.history.length, 1); assert.equal(input.history[0]!.message, first.text); return result(input); } });
    const ready = (await request(path)).body.turns[1];
    assert.equal(ready.result.status, 'READY'); assert.equal(ready.usage.totalTokens, 15);
    assert.equal((await request(`/tenants/${tenants[0]}/drafts`)).body.data.length, 0);
    assert.equal((await maintenance.query('SELECT 1 FROM draft_approvals WHERE tenant_id = $1', [tenants[0]])).rowCount, 0);
    const third = { id: randomUUID(), expectedRevision: 2, text: 'Try an invalid model proposal' };
    await request(path + '/messages', 'POST', third);
    await processBuilderTurn(worker, { async infer(input) { return { ...result(input), extraction: { ...result(input).extraction as object, selection: { scenarioId: 'invented', revision: 1 } } }; } });
    assert.equal((await request(path)).body.turns[2].errorCode, 'INVALID_MODEL_OUTPUT');

    // Expired leases are terminal and a late inference result cannot overwrite them.
    const fourth = { id: randomUUID(), expectedRevision: 3, text: 'Lease expiry test' }; await request(path + '/messages', 'POST', fourth);
    let enteredLease!: () => void; let releaseLease!: () => void;
    const inLease = new Promise<void>(resolve => { enteredLease = resolve; }); const holdLease = new Promise<void>(resolve => { releaseLease = resolve; });
    const late = processBuilderTurn(worker, { async infer(input) { enteredLease(); await holdLease; return result(input); } });
    await Promise.race([inLease, late.then(() => { throw new Error('Worker finished before lease test inference.'); })]);
    await maintenance.query("UPDATE builder_chat_turns SET lease_expires_at = now() - interval '1 second' WHERE tenant_id = $1 AND id = $2", [tenants[0], fourth.id]);
    assert.equal(await processBuilderTurn(worker, provider), false); releaseLease(); await late;
    assert.equal((await request(path)).body.turns[3].errorCode, 'MODEL_OUTCOME_UNKNOWN');
    await request(path + '/messages', 'POST', { id: randomUUID(), expectedRevision: 4, text: 'Authorization check' });
    await maintenance.query("UPDATE memberships SET role = 'STAFF' WHERE tenant_id = $1 AND user_id = $2", [tenants[0], users[0]]);
    await processBuilderTurn(worker, { async infer() { throw new Error('Revoked owner must not incur a model call.'); } });
    assert.equal((await request(path)).body.turns[4].errorCode, 'AUTHORIZATION_REVOKED');
    await maintenance.query("UPDATE memberships SET role = 'OWNER' WHERE tenant_id = $1 AND user_id = $2", [tenants[0], users[0]]);
    await maintenance.query('UPDATE builder_ai_quota SET reserved = 20 WHERE tenant_id = $1', [tenants[0]]);
    assert.equal((await request(path + '/messages', 'POST', { id: randomUUID(), expectedRevision: 5, text: 'over quota' })).status, 429);
    assert.equal((await request(path)).body.revision, 5);
    const unsupportedId = randomUUID();
    await request(`${other}/${sessions[1]}/messages`, 'POST', { id: unsupportedId, expectedRevision: 1, text: 'unsupported tool request' }, tokens[1]);
    await processBuilderTurn(worker, { async infer(input) { const response = result(input); return { ...response, extraction: {
      ...response.extraction as object, selection: null, parameters: [], questions: [], gaps: ['No released capability supports this tool.'],
    } }; } });
    assert.ok((await request('/admin/builder-chat-gaps')).body.data.some((row: { id: string }) => row.id === unsupportedId));
    assert.equal((await request('/admin/builder-chat-gaps', 'GET', undefined, tokens[1])).status, 403);
    assert.equal((await request(`${other}/${sessions[1]}`)).status, 404);
    const concurrent = await Promise.all(Array.from({ length: 20 }, async () => {
      const id = randomUUID();
      assert.equal((await request(other, 'POST', { id, language: 'fr', consentToOpenAI: true }, tokens[1])).status, 201);
      return request(`${other}/${id}/messages`, 'POST', { id: randomUUID(), expectedRevision: 0, text: 'quota probe' }, tokens[1]);
    }));
    assert.equal(concurrent.filter(response => response.status === 202).length, 18);
    assert.equal(concurrent.filter(response => response.status === 429).length, 2);
    await assert.rejects(worker.pool.query('SELECT * FROM users'), { code: '42501' });
    await assert.rejects(worker.pool.query('SELECT * FROM draft_approvals'), { code: '42501' });
    await assert.rejects(db.authenticated(tokens[0]!, client => client.query("UPDATE builder_chat_turns SET status = 'RUNNING' WHERE tenant_id = $1", [tenants[0]])), { code: '42501' });
    await db.authenticated(tokens[1]!, async client => {
      assert.equal((await client.query('SELECT * FROM builder_chat_sessions WHERE tenant_id = $1', [tenants[0]])).rowCount, 0);
      assert.equal((await client.query('SELECT * FROM builder_chat_turns WHERE tenant_id = $1', [tenants[0]])).rowCount, 0);
    });
    await maintenance.query("UPDATE builder_chat_sessions SET created_at = now() - interval '31 days' WHERE tenant_id = $1 AND id = $2", [tenants[0], sessions[0]]);
    execFileSync(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('../scripts/cleanup-builder-chat.ts', import.meta.url))], { env: process.env });
    assert.equal((await request(path)).status, 404);
    assert.equal((await request(`${other}/${sessions[1]}`, 'GET', undefined, tokens[1])).status, 200);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await maintenance.query('DELETE FROM tenants WHERE id = ANY($1::uuid[])', [tenants]);
    await maintenance.query('DELETE FROM scenarios WHERE id = $1', [scenarioId]);
    await maintenance.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
    await db.pool.end(); await worker.pool.end(); await maintenance.end();
  }
});
