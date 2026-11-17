import assert from 'node:assert/strict';
import test from 'node:test';
import { listCapabilities, getCapability, executeLocalCapability } from '../src/capabilities.ts';

test('registered contracts are immutable, pinned and backed by passing local fixtures', () => {
  const capabilities = listCapabilities();
  assert.equal(capabilities.length, 4);
  for (const capability of capabilities) {
    assert.equal(getCapability(capability.name, capability.version), capability);
    assert.ok(Object.isFrozen(capability));
    assert.ok(Object.isFrozen(capability.inputs));
    assert.ok(Object.isFrozen(capability.fixtures));
    assert.equal(Reflect.set(capability, 'version', 'changed'), false);
    assert.ok(capability.fixtures.length > 0);
    for (const fixture of capability.fixtures) {
      assert.deepEqual(executeLocalCapability(capability.name, capability.version, fixture.inputs, fixture.event), fixture.result);
    }
  }
  assert.equal(getCapability('whatsapp.send', '1.0.0'), undefined);
  assert.equal(getCapability('text.copy', 'latest'), undefined);
  assert.throws(() => executeLocalCapability('whatsapp.send', '1.0.0', {}));
  assert.throws(() => executeLocalCapability('text.copy', '1.0.0', { text: false }));
  assert.throws(() => executeLocalCapability('text.copy', '1.0.0', { text: 'ok', extra: true }));
});
