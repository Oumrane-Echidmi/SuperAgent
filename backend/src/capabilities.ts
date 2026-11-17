import { z } from 'zod';

export type Scalar = string | number | boolean;
type Fields = Readonly<Record<string, { readonly type: 'string' | 'number' | 'boolean' }>>;
export type NodeFamily = 'trigger' | 'action' | 'condition' | 'end';
interface LocalResult { outputs: Record<string, Scalar>; route: 'next' | 'match' | 'default' | null }
interface Fixture { inputs: Record<string, Scalar>; event?: Record<string, Scalar>; result: LocalResult }
export interface Capability {
  readonly name: string;
  readonly version: string;
  readonly family: NodeFamily;
  readonly inputs: Fields;
  readonly outputs: Fields;
  readonly event: Fields;
  readonly connectionType: null;
  readonly requiredScopes: readonly string[];
  readonly risk: 'none';
  readonly timeoutMs: number;
  readonly retry: 'never';
  readonly idempotency: 'pure';
  readonly implementation: string;
  readonly fixtures: readonly Fixture[];
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

const stringField = { type: 'string' } as const;
const common = { version: '1.0.0', connectionType: null, requiredScopes: [], risk: 'none',
  timeoutMs: 1000, retry: 'never', idempotency: 'pure' } as const;
const definitions: { contract: Capability; execute: (inputs: Record<string, Scalar>, event: Record<string, Scalar>) => LocalResult }[] = [
  { contract: { ...common, name: 'manual.text', family: 'trigger', implementation: 'builtin/manual.text@1.0.0',
    inputs: {}, outputs: { text: stringField }, event: { text: stringField },
    fixtures: [{ inputs: {}, event: { text: 'Bonjour' }, result: { outputs: { text: 'Bonjour' }, route: 'next' } }] },
    execute: (_inputs, event) => ({ outputs: { text: event.text! }, route: 'next' }) },
  { contract: { ...common, name: 'text.copy', family: 'action', implementation: 'builtin/text.copy@1.0.0',
    inputs: { text: stringField }, outputs: { text: stringField }, event: {},
    fixtures: [{ inputs: { text: 'مرحبا' }, result: { outputs: { text: 'مرحبا' }, route: 'next' } }] },
    execute: inputs => ({ outputs: { text: inputs.text! }, route: 'next' }) },
  { contract: { ...common, name: 'text.equals', family: 'condition', implementation: 'builtin/text.equals@1.0.0',
    inputs: { actual: stringField, expected: stringField }, outputs: { matches: { type: 'boolean' } }, event: {},
    fixtures: [
      { inputs: { actual: 'yes', expected: 'yes' }, result: { outputs: { matches: true }, route: 'match' } },
      { inputs: { actual: 'YES', expected: 'yes' }, result: { outputs: { matches: false }, route: 'default' } },
    ] },
    execute: inputs => {
      const matches = inputs.actual === inputs.expected;
      return { outputs: { matches }, route: matches ? 'match' : 'default' };
    } },
  { contract: { ...common, name: 'workflow.end', family: 'end', implementation: 'builtin/workflow.end@1.0.0',
    inputs: { reason: stringField }, outputs: {}, event: {},
    fixtures: [{ inputs: { reason: 'complete' }, result: { outputs: {}, route: null } }] },
    execute: () => ({ outputs: {}, route: null }) },
];
for (const definition of definitions) freeze(definition.contract);
const registry = new Map(definitions.map(definition => [`${definition.contract.name}@${definition.contract.version}`, definition]));

export function listCapabilities(): readonly Capability[] {
  return Object.freeze(definitions.map(definition => definition.contract));
}
export function getCapability(name: string, version: string): Capability | undefined {
  return registry.get(`${name}@${version}`)?.contract;
}

function validateFields(fields: Fields, value: unknown): Record<string, Scalar> {
  const shape = Object.fromEntries(Object.entries(fields).map(([name, field]) => [name,
    field.type === 'string' ? z.string().max(4000) : field.type === 'number' ? z.number() : z.boolean()]));
  return z.strictObject(shape).parse(value);
}

// Pure local adapters only. This is not the durable workflow runtime or a provider gateway.
export function executeLocalCapability(name: string, version: string, inputs: unknown, event: unknown = {}): LocalResult {
  const definition = registry.get(`${name}@${version}`);
  if (!definition) throw new Error('Unsupported capability version.');
  const result = definition.execute(validateFields(definition.contract.inputs, inputs), validateFields(definition.contract.event, event));
  validateFields(definition.contract.outputs, result.outputs);
  return result;
}
