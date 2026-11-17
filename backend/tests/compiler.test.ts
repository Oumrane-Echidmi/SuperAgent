import assert from 'node:assert/strict';
import test from 'node:test';
import { validateGraph } from '../src/compiler.ts';

const draft = () => ({
  schemaVersion: 1,
  nodes: [
    { id: 'receive', type: 'trigger' },
    { id: 'decision', type: 'condition' },
    { id: 'confirmed', type: 'end' },
    { id: 'pending', type: 'end' },
  ],
  edges: [
    { from: 'receive', to: 'decision', route: 'next' },
    { from: 'decision', to: 'confirmed', route: 'match' },
    { from: 'decision', to: 'pending', route: 'default' },
  ],
});

test('accepts a reachable decision graph without producing a publishable manifest', () => {
  assert.deepEqual(validateGraph(draft()), { stage: 'structure', valid: true, issues: [] });
});

for (const [name, mutate, code] of [
  ['duplicate IDs', (g: ReturnType<typeof draft>) => { g.nodes[3]!.id = 'confirmed'; }, 'DUPLICATE_NODE'],
  ['dangling edges', (g: ReturnType<typeof draft>) => { g.edges[0]!.to = 'missing'; }, 'UNKNOWN_NODE'],
  ['cycles', (g: ReturnType<typeof draft>) => { g.edges[1]!.to = 'decision'; }, 'CYCLE'],
  ['missing fallback', (g: ReturnType<typeof draft>) => { g.edges.pop(); }, 'INVALID_ROUTES'],
  ['unreachable nodes', (g: ReturnType<typeof draft>) => { g.nodes.push({ id: 'unused', type: 'end' }); }, 'UNREACHABLE_NODE'],
  ['implicit joins', (g: ReturnType<typeof draft>) => { g.edges[2]!.to = 'confirmed'; }, 'UNSUPPORTED_JOIN'],
  ['multiple triggers', (g: ReturnType<typeof draft>) => { g.nodes.push({ id: 'other', type: 'trigger' }); }, 'TRIGGER_COUNT'],
] as const) {
  test(`rejects ${name}`, () => {
    const graph = draft();
    mutate(graph);
    const result = validateGraph(graph);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some(issue => issue.code === code), JSON.stringify(result));
  });
}

test('rejects unknown capabilities, malformed input and oversized graphs', () => {
  for (const input of [null, {}, { ...draft(), arbitraryCode: 'run()' },
    { ...draft(), nodes: [{ id: 'x', type: 'send_money' }] },
    { ...draft(), nodes: Array.from({ length: 101 }, (_, i) => ({ id: `n${i}`, type: 'end' })) }]) {
    assert.equal(validateGraph(input).issues[0]?.code, 'INVALID_SCHEMA');
  }
});
