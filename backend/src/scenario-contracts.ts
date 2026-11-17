import { z } from 'zod';
import { workflowSchema } from './workflow-compiler.ts';
import { fixtureSchema, simulateWorkflow } from './simulator.ts';
import type { SimulationReport } from './simulator.ts';
import { getCapability } from './capabilities.ts';
import type { Scalar } from './capabilities.ts';
import { HttpError } from './database.ts';

const id = workflowSchema.shape.nodes.element.shape.id;
export const parameterValueSchema = z.union([z.string().max(4000), z.number(), z.boolean()]);
export const parameterValuesSchema = z.record(id, parameterValueSchema).refine(value => Object.keys(value).length <= 4);
const reference = z.strictObject({ parameter: id });
const parameterFixture = fixtureSchema.extend({
  event: z.record(id, z.union([parameterValueSchema, reference])).refine(value => Object.keys(value).length <= 32),
  expectedReason: z.union([z.string().max(4000), reference]),
});
export const normalizeMatchText = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const scenarioDefinitionSchema = z.strictObject({
  name: z.string().trim().min(1).max(120), description: z.string().trim().min(1).max(1000),
  workflow: workflowSchema, fixtures: z.array(parameterFixture).min(1).max(20),
  parameters: z.array(z.strictObject({ key: id, label: z.string().trim().min(1).max(120), nodeId: id, input: id,
    values: z.array(parameterValueSchema).min(1).max(4) })).max(4).optional(),
  matching: z.strictObject({ phrases: z.array(z.string().trim().min(2).max(120).refine(value => normalizeMatchText(value).length > 0)).min(1).max(20),
    languages: z.array(z.enum(['darija', 'fr'])).min(1).max(2).refine(values => new Set(values).size === values.length) }).optional(),
});
export type ScenarioDefinition = z.infer<typeof scenarioDefinitionSchema>;

function invalid(message: string): never { throw new HttpError(422, 'INVALID_CUSTOMIZATION', message); }
export function resolveScenario(input: unknown, requested: unknown = {}) {
  const parsed = scenarioDefinitionSchema.safeParse(input);
  const values = parameterValuesSchema.safeParse(requested);
  if (!parsed.success || !values.success) return invalid('Check the scenario contract and parameter values.');
  const definition = parsed.data;
  const specs = definition.parameters ?? [];
  if (specs.reduce((count, spec) => count * spec.values.length, 1) > 16) return invalid('At most 16 parameter combinations are supported.');
  const keys = new Set<string>(); const targets = new Set<string>();
  const parameters: Record<string, Scalar> = {};
  for (const spec of specs) {
    const target = `${spec.nodeId}:${spec.input}`;
    if (keys.has(spec.key) || targets.has(target)) return invalid('Parameter keys and target inputs must be unique.');
    keys.add(spec.key); targets.add(target);
    const node = definition.workflow.nodes.find(node => node.id === spec.nodeId);
    const binding = node?.inputs[spec.input];
    const contract = node && getCapability(node.capability.name, node.capability.version);
    if (!binding || binding.kind !== 'literal' || !contract || !Object.hasOwn(contract.inputs, spec.input)) {
      return invalid('Parameters may target only declared literal capability inputs.');
    }
    if (spec.values.some(value => typeof value !== contract.inputs[spec.input]!.type)
      || !spec.values.includes(binding.value) || new Set(spec.values.map(value => JSON.stringify(value))).size !== spec.values.length) {
      return invalid('Parameter choices must be unique, typed and include the released default.');
    }
    const value = Object.hasOwn(values.data, spec.key) ? values.data[spec.key]! : binding.value;
    if (!spec.values.includes(value)) return invalid(`Choose an allowed value for ${spec.key}.`);
    parameters[spec.key] = value;
  }
  for (const key of Object.keys(values.data)) if (!keys.has(key)) return invalid(`Parameter ${key} is not declared by this release.`);
  const workflow = structuredClone(definition.workflow);
  for (const spec of specs) workflow.nodes.find(node => node.id === spec.nodeId)!.inputs[spec.input] = { kind: 'literal', value: parameters[spec.key]! };
  function resolve(value: Scalar | { parameter: string }): Scalar {
    if (typeof value !== 'object') return value;
    if (!Object.hasOwn(parameters, value.parameter)) return invalid('Fixture references an undeclared parameter.');
    return parameters[value.parameter]!;
  }
  const fixtures = definition.fixtures.map(fixture => {
    const expectedReason = resolve(fixture.expectedReason);
    if (typeof expectedReason !== 'string') return invalid('Fixture terminal reasons must resolve to strings.');
    return { ...fixture, expectedReason, event: Object.fromEntries(Object.entries(fixture.event).map(([key, value]) => [key, resolve(value)])) };
  });
  return { workflow, fixtures, parameters };
}

export interface ScenarioSimulationReport extends SimulationReport {
  variants?: { parameters: Record<string, Scalar>; report: SimulationReport }[];
}
export function simulateScenario(input: unknown): ScenarioSimulationReport {
  try {
    const defaults = resolveScenario(input);
    const base = simulateWorkflow({ workflow: defaults.workflow, fixtures: defaults.fixtures });
    const definition = scenarioDefinitionSchema.parse(input);
    const specs = definition.parameters ?? [];
    if (!specs.length) return base;
    let combinations: Record<string, Scalar>[] = [{}];
    for (const spec of specs) combinations = combinations.flatMap(values => spec.values.map(value => ({ ...values, [spec.key]: value })));
    const variants = combinations.map(values => {
      const resolved = resolveScenario(definition, values);
      return { parameters: resolved.parameters, report: simulateWorkflow({ workflow: resolved.workflow, fixtures: resolved.fixtures }) };
    });
    const uncovered = new Map(variants.flatMap(variant => variant.report.uncoveredEdges).map(edge => [`${edge.from}:${edge.route}`, edge]));
    return { ...base, valid: base.valid && variants.every(variant => variant.report.valid), variants,
      uncoveredEdges: [...uncovered.values()], issues: [...base.issues,
        ...variants.flatMap((variant, index) => variant.report.valid ? [] : [`Parameter combination ${index + 1} failed its fixtures.`])] };
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    return { valid: false, validationReport: null, cases: [], uncoveredEdges: [], issues: [error.message] };
  }
}
