import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { simulateScenario } from '../src/scenario-contracts.ts';
import { executeLocalCapability, matchesKeywords } from '../src/capabilities.ts';

const directory = new URL('../examples/scenarios/', import.meta.url);
const files = readdirSync(directory).filter(name => name.endsWith('.json'));

test('every shipped scenario passes validation and simulation with full edge coverage', () => {
  assert.ok(files.length >= 4);
  const ids = new Set<string>();
  for (const file of files) {
    const { id, definition } = JSON.parse(readFileSync(new URL(file, directory), 'utf8'));
    assert.match(id, /^[0-9a-f-]{36}$/); assert.ok(!ids.has(id), `duplicate id in ${file}`); ids.add(id);
    const report = simulateScenario(definition);
    assert.deepEqual(report.issues, [], file);
    assert.equal(report.valid, true, file);
    assert.deepEqual(report.uncoveredEdges, [], file);
  }
});
test('keyword matching is whole-word, accent-tolerant and multilingual', () => {
  assert.equal(matchesKeywords('Je veux un RDV!', 'rdv, rendez-vous'), true);
  assert.equal(matchesKeywords('Je veux un rendez-vous', 'rdv, rendez vous'), true);
  assert.equal(matchesKeywords('Bonjour, بشحال هاد الحاجة', 'ثمن, بشحال'), true);
  assert.equal(matchesKeywords('stopper', 'stop'), false);
  assert.equal(matchesKeywords('anything', ''), false);
  assert.deepEqual(executeLocalCapability('text.keywords', '1.0.0', { text: 'STOP', keywords: 'stop' }), { outputs: { matches: true }, route: 'match' });
});
