import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateExtraction, catalogForModel } from '../src/builder-ai.ts';

const scenario = JSON.parse(readFileSync(new URL('../examples/customizable-scenario.json', import.meta.url), 'utf8'));
const catalog = [{ scenarioId: scenario.id, revision: 1, definition: scenario.definition }];
const extraction = () => ({ reply: 'Voici une proposition à vérifier.',
  spec: { name: 'Assistant', goal: 'Trier les messages', language: 'fr', fields: [], constraints: [] },
  selection: { scenarioId: scenario.id, revision: 1 }, parameters: [{ key: 'matchedReason', value: 'Merci' }], questions: [], gaps: [] });

test('valid extraction produces a reviewable suggestion, never executable model code', () => {
  const result = validateExtraction(extraction(), catalog);
  assert.equal(result.status, 'READY');
  assert.equal(result.draftSuggestion?.scenarioId, scenario.id);
  assert.equal(result.draftSuggestion?.content.parameters?.matchedReason, 'Merci');
  assert.equal('approval' in result, false);
  const metadata = catalogForModel(catalog)[0]!;
  assert.equal('fixtures' in metadata, false);
  assert.equal('workflow' in metadata, false);
});
test('clarification and unsupported goals remain explicit', () => {
  assert.equal(validateExtraction({ ...extraction(), selection: null, parameters: [], questions: ['Quel résultat souhaitez-vous ?'] }, catalog).status, 'NEEDS_DETAILS');
  assert.equal(validateExtraction({ ...extraction(), selection: null, parameters: [], gaps: ['Aucun scénario disponible.'] }, catalog).status, 'UNSUPPORTED');
});
test('rejects hallucinated pins, undeclared settings, duplicates and authority injection', () => {
  for (const input of [
    { ...extraction(), selection: { scenarioId: 'unreleased', revision: 1 } },
    { ...extraction(), selection: { scenarioId: scenario.id, revision: 2 } },
    { ...extraction(), parameters: [{ key: 'matchedReason', value: 'unlisted' }] },
    { ...extraction(), parameters: [{ key: 'unknown', value: true }] },
    { ...extraction(), parameters: [...extraction().parameters, ...extraction().parameters] },
    { ...extraction(), approval: true },
    { ...extraction(), workflow: { code: 'eval()' } },
    { ...extraction(), selection: null },
  ]) assert.throws(() => validateExtraction(input, catalog));
});
test('missing required facts cannot yield READY and credentials never enter catalog metadata', () => {
  assert.throws(() => validateExtraction({ ...extraction(), spec: { ...extraction().spec, goal: null } }, catalog));
  assert.equal(validateExtraction({ ...extraction(), spec: { ...extraction().spec, goal: null }, questions: ['شنو الهدف؟'] }, catalog).status, 'NEEDS_DETAILS');
});
