import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolveScenario } from '../src/scenario-contracts.ts';

const definition = () => JSON.parse(readFileSync(new URL('../examples/customizable-scenario.json', import.meta.url), 'utf8')).definition;

test('resolves only declared choices and fixture parameter references without mutating the release', () => {
  const scenario = definition();
  const result = resolveScenario(scenario, { matchedReason: 'شكرا' });
  assert.equal(result.workflow.nodes.find(node => node.id === 'matched')?.inputs.reason?.kind, 'literal');
  assert.equal(result.fixtures[0]?.expectedReason, 'شكرا');
  assert.equal(scenario.workflow.nodes[2].inputs.reason.value, 'Merci');
  assert.equal(resolveScenario(scenario).parameters.matchedReason, 'Merci');
});

test('rejects undeclared keys, values, types and inherited property names', () => {
  for (const values of [{ extra: 'attack' }, { matchedReason: 'unlisted' }, { matchedReason: false }, { constructor: 'attack' }]) {
    assert.throws(() => resolveScenario(definition(), values), { code: 'INVALID_CUSTOMIZATION' });
  }
});

test('rejects nonliteral/missing targets, duplicate targets/keys and undeclared fixture references', () => {
  for (const mutate of [
    (s: ReturnType<typeof definition>) => { s.parameters[0].nodeId = 'decision'; s.parameters[0].input = 'actual'; },
    (s: ReturnType<typeof definition>) => { s.parameters[0].nodeId = 'missing'; },
    (s: ReturnType<typeof definition>) => { s.parameters.push({ ...s.parameters[0] }); },
    (s: ReturnType<typeof definition>) => { s.parameters.push({ ...s.parameters[0], key: 'another' }); },
    (s: ReturnType<typeof definition>) => { s.parameters.push({ ...s.parameters[0], nodeId: 'unmatched', values: ['Text did not match'] }); },
    (s: ReturnType<typeof definition>) => { s.parameters[0].values = ['Merci', 'Merci']; },
    (s: ReturnType<typeof definition>) => { s.parameters[0].values = ['missing-default']; },
    (s: ReturnType<typeof definition>) => { s.parameters[0].values = [false]; },
    (s: ReturnType<typeof definition>) => { s.fixtures[0].expectedReason.parameter = 'missing'; },
  ]) {
    const scenario = definition(); mutate(scenario);
    assert.throws(() => resolveScenario(scenario), { code: 'INVALID_CUSTOMIZATION' });
  }
});

test('legacy scenario definitions resolve unchanged and cannot accept parameters', () => {
  const scenario = JSON.parse(readFileSync(new URL('../examples/scenario.json', import.meta.url), 'utf8')).definition;
  const result = resolveScenario(scenario);
  assert.deepEqual(result.workflow, scenario.workflow);
  assert.deepEqual(result.fixtures, scenario.fixtures);
  assert.throws(() => resolveScenario(scenario, { matchedReason: 'not allowed' }), { code: 'INVALID_CUSTOMIZATION' });
});
