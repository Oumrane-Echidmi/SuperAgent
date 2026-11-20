import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { simulateScenario } from '../src/scenario-contracts.ts';
import { classifyIntent } from '../src/capabilities.ts';

test('the shipped COD confirmation scenario passes its own simulation', () => {
  const { definition } = JSON.parse(readFileSync(new URL('../examples/cod-confirmation-scenario.json', import.meta.url), 'utf8'));
  const report = simulateScenario(definition);
  assert.deepEqual(report.issues, []);
  assert.equal(report.valid, true);
  assert.equal(report.cases.length, 3);
});
test('intent matching is exact, multilingual and conservative', () => {
  assert.equal(classifyIntent(' OUI! '), 'confirm');
  assert.equal(classifyIntent('واه'), 'confirm');
  assert.equal(classifyIntent('Non merci.'), 'decline');
  assert.equal(classifyIntent('oui mais plus tard'), 'unclear');
  assert.equal(classifyIntent(''), 'unclear');
});
