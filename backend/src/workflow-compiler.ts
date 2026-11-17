import { z } from 'zod';
import { graphSchema, validateTopology } from './compiler.ts';
import type { ValidationIssue } from './compiler.ts';
import { getCapability, listCapabilities } from './capabilities.ts';

const id = graphSchema.shape.nodes.element.shape.id;
const bindingSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('literal'), value: z.union([z.string().max(4000), z.number(), z.boolean()]) }),
  z.strictObject({ kind: z.literal('output'), nodeId: id, field: id }),
]);
export const workflowSchema = z.strictObject({
  schemaVersion: z.literal(2),
  nodes: z.array(z.strictObject({
    id,
    capability: z.strictObject({
      name: z.string().regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/).max(128),
      version: z.string().regex(/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/).max(32),
    }),
    inputs: z.record(id, bindingSchema).refine(value => Object.keys(value).length <= 32, 'At most 32 inputs are allowed.'),
  })).min(1).max(100),
  edges: graphSchema.shape.edges,
});
export type WorkflowDraft = z.infer<typeof workflowSchema>;
export interface BindingIssue extends ValidationIssue { input?: string }
export interface BindingReport {
  stage: 'bindings';
  valid: boolean;
  issues: BindingIssue[];
  resolvedCapabilities: { nodeId: string; name: string; version: string }[];
}

// Validates a preview only: no tenant authorization, connection resolution or publication.
export function validateWorkflow(input: unknown): BindingReport {
  const issues: BindingIssue[] = [];
  const failure = (): BindingReport => ({ stage: 'bindings', valid: false, issues, resolvedCapabilities: [] });
  const parsed = workflowSchema.safeParse(input);
  if (!parsed.success) {
    issues.push(...parsed.error.issues.map(issue => ({ code: 'INVALID_SCHEMA', message: `${issue.path.join('.') || 'workflow'}: ${issue.message}` })));
    return failure();
  }
  const { nodes, edges } = parsed.data;
  const contracts = new Map(nodes.map(node => [node.id, getCapability(node.capability.name, node.capability.version)]));
  for (const node of nodes) {
    if (!contracts.get(node.id)) {
      const known = listCapabilities().some(capability => capability.name === node.capability.name);
      issues.push({ nodeId: node.id, code: known ? 'UNSUPPORTED_VERSION' : 'UNKNOWN_CAPABILITY',
        message: known ? 'Select a registered immutable capability version.' : 'This capability has no registered backend implementation.' });
    }
  }
  if (issues.length) return failure();
  issues.push(...validateTopology({ nodes: nodes.map(node => ({ id: node.id, type: contracts.get(node.id)!.family })), edges }));
  if (issues.length) return failure();

  // The structural gate permits one parent per node and rejects cycles/joins.
  const parent = new Map(edges.map(edge => [edge.to, edge.from]));
  for (const node of nodes) {
    const contract = contracts.get(node.id)!;
    const ancestors = new Set<string>();
    let source = parent.get(node.id);
    while (source !== undefined) {
      ancestors.add(source);
      source = parent.get(source);
    }
    const add = (code: string, input: string, message: string) => issues.push({ code, nodeId: node.id, input, message });
    for (const name of Object.keys(contract.inputs)) {
      if (!Object.hasOwn(node.inputs, name)) add('MISSING_INPUT', name, 'Bind this required input.');
    }
    for (const [name, binding] of Object.entries(node.inputs)) {
      if (!Object.hasOwn(contract.inputs, name)) {
        add('UNKNOWN_INPUT', name, 'Remove this undeclared input.');
        continue;
      }
      const expected = contract.inputs[name]!.type;
      if (binding.kind === 'literal') {
        if (typeof binding.value !== expected) add('TYPE_MISMATCH', name, `Expected ${expected}; no implicit coercion is allowed.`);
        continue;
      }
      const upstream = contracts.get(binding.nodeId);
      if (!upstream) {
        add('UNKNOWN_SOURCE', name, 'Select an existing source node.');
      } else if (!ancestors.has(binding.nodeId)) {
        add('UNAVAILABLE_OUTPUT', name, 'Only outputs from strict ancestor nodes are available on this path.');
      } else if (!Object.hasOwn(upstream.outputs, binding.field)) {
        add('UNKNOWN_OUTPUT', name, 'Select a declared output field.');
      } else if (upstream.outputs[binding.field]!.type !== expected) {
        add('TYPE_MISMATCH', name, `Source output must have type ${expected}.`);
      }
    }
  }
  if (issues.length) return failure();
  return { stage: 'bindings', valid: true, issues: [], resolvedCapabilities: nodes.map(node => ({ nodeId: node.id, ...node.capability })) };
}
