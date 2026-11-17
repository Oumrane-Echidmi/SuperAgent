import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { simulateWorkflow } from '../src/simulator.ts';

const workflow = JSON.parse(readFileSync(new URL('../examples/typed-workflow.json', import.meta.url), 'utf8'));
const fixtures = () => [
  { name: 'match', event: { text: 'yes' }, expectedPath: ['receive', 'decision', 'matched'], expectedReason: 'Text matched' },
  { name: 'fallback', event: { text: 'no' }, expectedPath: ['receive', 'decision', 'unmatched'], expectedReason: 'Text did not match' },
];

test('simulates bindings and both branches with observable paths and reasons', () => {
  const report = simulateWorkflow({ workflow, fixtures: fixtures() });
  assert.equal(report.valid, true, JSON.stringify(report));
  assert.deepEqual(report.uncoveredEdges, []);
  assert.deepEqual(report.cases.map(result => result.path), fixtures().map(fixture => fixture.expectedPath));
  assert.deepEqual(report.cases.map(result => result.reason), fixtures().map(fixture => fixture.expectedReason));
});

test('blocks release when a branch lacks coverage or fixture expectations are wrong', () => {
  assert.equal(simulateWorkflow({ workflow, fixtures: fixtures().slice(0, 1) }).valid, false);
  const wrong = fixtures();
  wrong[0]!.expectedReason = 'not the result';
  assert.equal(simulateWorkflow({ workflow, fixtures: wrong }).cases[0]?.passed, false);
});

test('invalid trigger data fails a fixture without exposing execution exceptions', () => {
  const report = simulateWorkflow({ workflow, fixtures: [{ name: 'invalid', event: { text: false }, expectedPath: ['receive'], expectedReason: '' }] });
  assert.equal(report.valid, false);
  assert.equal(report.cases[0]?.error, 'Cannot execute node receive with this fixture.');
});

test('requires bounded, uniquely named fixtures and a valid compiler report', () => {
  assert.equal(simulateWorkflow({ workflow, fixtures: [] }).valid, false);
  assert.equal(simulateWorkflow({ workflow, fixtures: [...fixtures(), ...fixtures()] }).valid, false);
  assert.equal(simulateWorkflow({ workflow: { ...workflow, edges: [] }, fixtures: fixtures() }).validationReport?.valid, false);
  assert.equal(simulateWorkflow({ workflow, fixtures: Array.from({ length: 21 }, () => fixtures()[0]) }).valid, false);
});
