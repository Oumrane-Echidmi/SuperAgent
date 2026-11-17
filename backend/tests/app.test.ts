import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { createApp } from '../src/app.ts';

test('HTTP boundary returns structured reports and errors', async () => {
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const health = await fetch(`${base}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const invalid = await fetch(`${base}/v1/graph-validations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.equal(invalid.status, 422);
    assert.equal((await invalid.json()).error.code, 'GRAPH_INVALID');
    const malformed = await fetch(`${base}/v1/graph-validations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
    });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).error.code, 'INVALID_JSON');
    const large = await fetch(`${base}/v1/graph-validations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: 'x'.repeat(70_000) }),
    });
    assert.equal(large.status, 413);
    const missing = await fetch(`${base}/missing`);
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error.code, 'NOT_FOUND');
    const valid = await fetch(`${base}/v1/graph-validations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schemaVersion: 1, nodes: [{ id: 'start', type: 'trigger' }, { id: 'done', type: 'end' }], edges: [{ from: 'start', to: 'done', route: 'next' }] }),
    });
    assert.equal(valid.status, 200);
    assert.deepEqual(await valid.json(), { stage: 'structure', valid: true, issues: [] });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
