import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { simulateScenario } from '../src/scenario-contracts.ts';

const definition = () => JSON.parse(readFileSync(new URL('../examples/customizable-scenario.json', import.meta.url), 'utf8')).definition;
test('release gate executes every declared choice with the admin-owned fixtures', () => {
  const report = simulateScenario(definition());
  assert.equal(report.valid, true, JSON.stringify(report));
  assert.equal(report.variants?.length, 2);
  assert.deepEqual(report.variants?.map(variant => variant.report.cases[0]?.reason), ['Merci', 'شكرا']);
});
test('a failing nondefault option blocks the whole release', () => {
  const scenario = definition();
  scenario.fixtures[0].expectedReason = 'Merci';
  const report = simulateScenario(scenario);
  assert.equal(report.valid, false);
  assert.equal(report.variants?.[0]?.report.valid, true);
  assert.equal(report.variants?.[1]?.report.valid, false);
});
test('invalid declarations and excessive combinations fail closed', () => {
  const scenario = definition();
  scenario.parameters[0].nodeId = 'missing';
  assert.equal(simulateScenario(scenario).valid, false);
  const large = definition();
  large.parameters = [
    { ...large.parameters[0], values: ['Merci', 'a', 'b', 'c'] },
    { key: 'fallback', label: 'Fallback', nodeId: 'unmatched', input: 'reason', values: ['Text did not match', 'd', 'e', 'f'] },
    { key: 'matchWord', label: 'Match word', nodeId: 'decision', input: 'expected', values: ['yes', 'g', 'h', 'i'] },
  ];
  large.fixtures[0].event.text = { parameter: 'matchWord' };
  large.fixtures[1].expectedReason = { parameter: 'fallback' };
  const report = simulateScenario(large);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some(issue => issue.includes('16 parameter combinations')));
});
