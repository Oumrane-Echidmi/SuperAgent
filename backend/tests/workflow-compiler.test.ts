import assert from 'node:assert/strict';
import test from 'node:test';
import { validateWorkflow } from '../src/workflow-compiler.ts';
import type { WorkflowDraft } from '../src/workflow-compiler.ts';

const literal = (value: string | number | boolean) => ({ kind: 'literal' as const, value });
const ref = (nodeId: string, field: string) => ({ kind: 'output' as const, nodeId, field });
const draft = (): WorkflowDraft => ({
  schemaVersion: 2,
  nodes: [
    { id: 'receive', capability: { name: 'manual.text', version: '1.0.0' }, inputs: {} },
    { id: 'copy', capability: { name: 'text.copy', version: '1.0.0' }, inputs: { text: ref('receive', 'text') } },
    { id: 'decision', capability: { name: 'text.equals', version: '1.0.0' }, inputs: { actual: ref('copy', 'text'), expected: literal('yes') } },
    { id: 'confirmed', capability: { name: 'workflow.end', version: '1.0.0' }, inputs: { reason: ref('receive', 'text') } },
    { id: 'pending', capability: { name: 'workflow.end', version: '1.0.0' }, inputs: { reason: literal('Needs follow-up') } },
  ],
  edges: [
    { from: 'receive', to: 'copy', route: 'next' },
    { from: 'copy', to: 'decision', route: 'next' },
    { from: 'decision', to: 'confirmed', route: 'match' },
    { from: 'decision', to: 'pending', route: 'default' },
  ],
});

test('resolves version pins and validates ancestor bindings independently of node order', () => {
  const graph = draft();
  graph.nodes.reverse();
  const report = validateWorkflow(graph);
  assert.equal(report.valid, true, JSON.stringify(report));
  assert.equal(report.stage, 'bindings');
  assert.equal(report.resolvedCapabilities.length, 5);
  assert.equal('manifest' in report, false);
});

function rejects(input: unknown, code: string, nodeId?: string) {
  const report = validateWorkflow(input);
  assert.equal(report.valid, false);
  assert.deepEqual(report.resolvedCapabilities, []);
  assert.ok(report.issues.some(issue => issue.code === code && (!nodeId || issue.nodeId === nodeId)), JSON.stringify(report));
}

test('rejects unknown capabilities and unsupported immutable versions', () => {
  const graph = draft();
  graph.nodes[1]!.capability.name = 'whatsapp.send';
  rejects(graph, 'UNKNOWN_CAPABILITY', 'copy');
  graph.nodes[1]!.capability = { name: 'text.copy', version: '2.0.0' };
  rejects(graph, 'UNSUPPORTED_VERSION', 'copy');
  graph.nodes[1]!.capability.version = 'latest';
  rejects(graph, 'INVALID_SCHEMA');
});

test('rejects missing, extra and wrongly typed inputs with field locations', () => {
  const graph = draft();
  graph.nodes[1]!.inputs = {};
  rejects(graph, 'MISSING_INPUT', 'copy');
  rejects({ ...draft(), nodes: draft().nodes.map(node => node.id === 'copy' ? { ...node, inputs: { text: literal(false) } } : node) }, 'TYPE_MISMATCH', 'copy');
  rejects({ ...draft(), nodes: draft().nodes.map(node => node.id === 'copy' ? { ...node, inputs: { text: literal('yes'), constructor: literal('attack') } } : node) }, 'UNKNOWN_INPUT', 'copy');
});

test('rejects missing output fields and missing source nodes', () => {
  const graph = draft();
  graph.nodes[1]!.inputs = { text: ref('receive', 'missing') };
  rejects(graph, 'UNKNOWN_OUTPUT', 'copy');
  graph.nodes[1]!.inputs = { text: ref('missing', 'text') };
  rejects(graph, 'UNKNOWN_SOURCE', 'copy');
});

test('rejects forward, self and sibling-branch references', () => {
  const graph = draft();
  graph.nodes[1]!.inputs = { text: ref('decision', 'matches') };
  rejects(graph, 'UNAVAILABLE_OUTPUT', 'copy');
  graph.nodes[1]!.inputs = { text: ref('copy', 'text') };
  rejects(graph, 'UNAVAILABLE_OUTPUT', 'copy');
  graph.nodes[4]!.inputs = { reason: ref('confirmed', 'anything') };
  rejects(graph, 'UNAVAILABLE_OUTPUT', 'pending');
});

test('rejects output type mismatch and invalid topology before binding resolution', () => {
  const graph = draft();
  graph.nodes[3]!.inputs = { reason: ref('decision', 'matches') };
  rejects(graph, 'TYPE_MISMATCH', 'confirmed');
  graph.edges[0]!.to = 'receive';
  rejects(graph, 'CYCLE');
});

test('rejects unknown keys, oversized literals and expression-like binding objects', () => {
  rejects({ ...draft(), code: 'eval()' }, 'INVALID_SCHEMA');
  rejects({ ...draft(), nodes: draft().nodes.map(node => node.id === 'copy' ? { ...node, inputs: { text: literal('x'.repeat(4001)) } } : node) }, 'INVALID_SCHEMA');
  rejects({ ...draft(), nodes: draft().nodes.map(node => node.id === 'copy' ? { ...node, inputs: { text: { kind: 'expression', value: 'process.env' } } } : node) }, 'INVALID_SCHEMA');
});
