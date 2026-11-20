import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { createApp } from '../src/app.ts';

test('HTTP exposes a bounded capability catalog and typed validation reports', async () => {
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const catalog = await fetch(`${base}/v1/capabilities?page=2&pageSize=2`);
    assert.equal(catalog.status, 200);
    const page = await catalog.json();
    assert.equal(page.data.length, 2);
    assert.deepEqual(page.pagination, { page: 2, pageSize: 2, totalItems: 8, totalPages: 4 });
    assert.equal(page.data[0].version, '1.0.0');
    for (const query of ['page=0', 'pageSize=101', 'page=1&page=2', 'unknown=value']) {
      const invalid = await fetch(`${base}/v1/capabilities?${query}`);
      assert.equal(invalid.status, 422);
      assert.equal((await invalid.json()).error.code, 'INVALID_INPUT');
    }
    const graph = {
      schemaVersion: 2,
      nodes: [
        { id: 'start', capability: { name: 'manual.text', version: '1.0.0' }, inputs: {} },
        { id: 'end', capability: { name: 'workflow.end', version: '1.0.0' }, inputs: { reason: { kind: 'output', nodeId: 'start', field: 'text' } } },
      ],
      edges: [{ from: 'start', to: 'end', route: 'next' }],
    };
    const valid = await fetch(`${base}/v1/workflow-validations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(graph),
    });
    assert.equal(valid.status, 200);
    assert.equal((await valid.json()).resolvedCapabilities.length, 2);
    graph.nodes[1]!.inputs = {};
    const invalid = await fetch(`${base}/v1/workflow-validations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(graph),
    });
    assert.equal(invalid.status, 422);
    const report = await invalid.json();
    assert.equal(report.error.code, 'WORKFLOW_INVALID');
    assert.deepEqual(report.error.details.issues[0], { code: 'MISSING_INPUT', nodeId: 'end', input: 'reason', message: 'Bind this required input.' });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
