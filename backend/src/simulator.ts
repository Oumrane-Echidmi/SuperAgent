import { z } from 'zod';
import { workflowSchema, validateWorkflow } from './workflow-compiler.ts';
import type { BindingReport } from './workflow-compiler.ts';
import { executeLocalCapability, getCapability } from './capabilities.ts';
import type { Scalar } from './capabilities.ts';

const scalar = z.union([z.string().max(4000), z.number(), z.boolean()]);
const id = workflowSchema.shape.nodes.element.shape.id;
export const fixtureSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  event: z.record(id, scalar).refine(value => Object.keys(value).length <= 32),
  expectedPath: z.array(id).min(1).max(100),
  expectedReason: z.string().max(4000),
});
export const simulationSchema = z.strictObject({ workflow: workflowSchema, fixtures: z.array(fixtureSchema).min(1).max(20) });
export interface SimulationReport {
  valid: boolean;
  validationReport: BindingReport | null;
  cases: { name: string; passed: boolean; path: string[]; reason: string | null; error?: string }[];
  uncoveredEdges: { from: string; to: string; route: string }[];
  issues: string[];
}

// Executes only the bounded pure adapters in the current registry. Never calls providers.
export function simulateWorkflow(input: unknown): SimulationReport {
  const report: SimulationReport = { valid: false, validationReport: null, cases: [], uncoveredEdges: [], issues: [] };
  const parsed = simulationSchema.safeParse(input);
  if (!parsed.success) {
    report.issues = parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`);
    return report;
  }
  const { workflow, fixtures } = parsed.data;
  report.validationReport = validateWorkflow(workflow);
  if (!report.validationReport.valid) return report;
  if (new Set(fixtures.map(fixture => fixture.name)).size !== fixtures.length) {
    report.issues.push('Fixture names must be unique.');
    return report;
  }
  const nodes = new Map(workflow.nodes.map(node => [node.id, node]));
  const start = workflow.nodes.find(node => getCapability(node.capability.name, node.capability.version)!.family === 'trigger')!;
  const edges = new Map(workflow.edges.map(edge => [`${edge.from}:${edge.route}`, edge]));
  const covered = new Set<string>();
  for (const fixture of fixtures) {
    const path: string[] = [];
    const outputs = new Map<string, Record<string, Scalar>>();
    let current = start;
    let reason: string | null = null;
    let error: string | undefined;
    for (let step = 0; step < workflow.nodes.length; step++) {
      path.push(current.id);
      try {
        const inputs = Object.fromEntries(Object.entries(current.inputs).map(([key, binding]) => [key,
          binding.kind === 'literal' ? binding.value : outputs.get(binding.nodeId)![binding.field]!]));
        const result = executeLocalCapability(current.capability.name, current.capability.version, inputs, current.id === start.id ? fixture.event : {});
        outputs.set(current.id, result.outputs);
        if (result.route === null) {
          if (typeof inputs.reason !== 'string') throw new Error('Terminal reason must be a string.');
          reason = inputs.reason;
          break;
        }
        const key = `${current.id}:${result.route}`;
        const edge = edges.get(key)!;
        covered.add(key);
        current = nodes.get(edge.to)!;
      } catch {
        error = `Cannot execute node ${current.id} with this fixture.`;
        break;
      }
    }
    const passed = error === undefined && reason === fixture.expectedReason && JSON.stringify(path) === JSON.stringify(fixture.expectedPath);
    report.cases.push({ name: fixture.name, passed, path, reason, ...(error === undefined ? {} : { error }) });
  }
  report.uncoveredEdges = workflow.edges.filter(edge => !covered.has(`${edge.from}:${edge.route}`));
  report.valid = report.cases.every(result => result.passed) && report.uncoveredEdges.length === 0;
  return report;
}
