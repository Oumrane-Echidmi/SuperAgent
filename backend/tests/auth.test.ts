import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, verifyPassword, readBearerToken } from '../src/auth.ts';

test('passwords are salted and verified without accepting a changed password', async () => {
  const password = 'a long test passphrase 🔒';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('wrong password', first), false);
  assert.equal(await verifyPassword(password, 'malformed'), false);
});

test('accepts only a single correctly shaped opaque bearer token', () => {
  assert.equal(readBearerToken(`Bearer ${'a'.repeat(43)}`), 'a'.repeat(43));
  for (const header of [undefined, '', 'Basic credentials', 'Bearer short', `Bearer ${'a'.repeat(43)}, other`]) {
    assert.throws(() => readBearerToken(header), { code: 'UNAUTHENTICATED' });
  }
});
