import { z } from 'zod';

const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
export const graphSchema = z.strictObject({
  schemaVersion: z.literal(1),
  nodes: z.array(z.strictObject({
    id,
    type: z.enum(['trigger', 'condition', 'end']),
  })).min(1).max(100),
  edges: z.array(z.strictObject({
    from: id,
    to: id,
    route: z.enum(['next', 'match', 'default']),
  })).max(200),
});

export interface ValidationIssue {
  code: string;
  message: string;
  nodeId?: string;
}
export interface ValidationReport {
  stage: 'structure';
  valid: boolean;
  issues: ValidationIssue[];
}

// This is a structural gate, never a publication authorization or execution manifest.
export function validateGraph(input: unknown): ValidationReport {
  const parsed = graphSchema.safeParse(input);
  if (!parsed.success) {
    return { stage: 'structure', valid: false, issues: parsed.error.issues.map(issue => ({
      code: 'INVALID_SCHEMA', message: `${issue.path.join('.') || 'graph'}: ${issue.message}`,
    })) };
  }
  const { nodes, edges } = parsed.data;
  const issues: ValidationIssue[] = [];
  const add = (code: string, message: string, nodeId?: string) => {
    issues.push({ code, message, ...(nodeId === undefined ? {} : { nodeId }) });
  };
  const byId = new Map(nodes.map(node => [node.id, node]));
  const outgoing = new Map(nodes.map(node => [node.id, edges.filter(edge => edge.from === node.id)]));
  const incoming = new Map(nodes.map(node => [node.id, edges.filter(edge => edge.to === node.id)]));
  const seen = new Set<string>();
  for (const node of nodes) {
    if (seen.has(node.id)) add('DUPLICATE_NODE', 'Choose a unique node ID.', node.id);
    seen.add(node.id);
    const routes = outgoing.get(node.id)!.map(edge => edge.route).sort();
    const expected = node.type === 'trigger' ? ['next'] : node.type === 'condition' ? ['default', 'match'] : [];
    if (JSON.stringify(routes) !== JSON.stringify(expected)) {
      add('INVALID_ROUTES', `Expected routes: ${expected.join(', ') || 'none'}.`, node.id);
    }
    const parents = incoming.get(node.id)!;
    if (node.type === 'trigger' && parents.length) add('TRIGGER_INPUT', 'Triggers cannot have incoming edges.', node.id);
    if (parents.length > 1) add('UNSUPPORTED_JOIN', 'Joins require explicit semantics and are not supported yet.', node.id);
  }
  for (const edge of edges) {
    if (!byId.has(edge.from) || !byId.has(edge.to)) add('UNKNOWN_NODE', `Edge ${edge.from} -> ${edge.to} references a missing node.`);
  }
  const triggers = nodes.filter(node => node.type === 'trigger');
  if (triggers.length !== 1) add('TRIGGER_COUNT', 'A graph must have exactly one trigger.');

  const visited = new Set<string>();
  const active = new Set<string>();
  function visit(nodeId: string): void {
    if (active.has(nodeId)) {
      add('CYCLE', 'Cycles are not supported. Use an explicit bounded control capability when available.', nodeId);
      return;
    }
    if (visited.has(nodeId) || !byId.has(nodeId)) return;
    visited.add(nodeId);
    active.add(nodeId);
    for (const edge of outgoing.get(nodeId)!) visit(edge.to);
    active.delete(nodeId);
  }
  if (triggers.length === 1) {
    visit(triggers[0]!.id);
    for (const node of nodes) {
      if (!visited.has(node.id)) add('UNREACHABLE_NODE', 'Connect this node to the trigger.', node.id);
    }
  }
  // Check disconnected components too, so cycles never escape validation.
  for (const node of nodes) visit(node.id);
  return { stage: 'structure', valid: issues.length === 0, issues };
}
