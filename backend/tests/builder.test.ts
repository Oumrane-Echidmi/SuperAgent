import assert from 'node:assert/strict';
import test from 'node:test';
import { revisionHash } from '../src/builder.ts';

test('review hashes bind tenant, draft, revision, scenario version and setup content', () => {
  const snapshot = { tenantId: 'shop-a', draftId: 'draft-a', revision: 1, scenarioId: 'scenario-a', scenarioRevision: 1,
    content: { name: 'Assistant', goal: 'Answer questions', language: 'darija' as const } };
  const hash = revisionHash(snapshot);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(revisionHash({ ...snapshot, content: { language: 'darija', goal: 'Answer questions', name: 'Assistant' } }), hash);
  for (const changed of [
    { ...snapshot, tenantId: 'shop-b' }, { ...snapshot, draftId: 'draft-b' }, { ...snapshot, revision: 2 },
    { ...snapshot, scenarioId: 'scenario-b' }, { ...snapshot, scenarioRevision: 2 },
    { ...snapshot, content: { ...snapshot.content, goal: 'New goal' } },
    { ...snapshot, content: { ...snapshot.content, name: 'New name' } },
    { ...snapshot, content: { ...snapshot.content, language: 'fr' as const } },
  ]) assert.notEqual(revisionHash(changed), hash);
});
