import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { CredentialVault } from '../src/credentials.ts';
import { GoogleSheetsProvider, GoogleFailure } from '../src/google-sheets.ts';

const context = { tenantId: 'tenant-a', connectionId: 'connection-a', provider: 'google' as const };
test('credential envelopes authenticate tenant, connection, provider, key and ciphertext', () => {
  const key = randomBytes(32).toString('base64');
  const vault = new CredentialVault('key-1', { 'key-1': key });
  const envelope = vault.seal('refresh-secret', context);
  assert.equal(vault.open(envelope, context), 'refresh-secret');
  assert.notDeepEqual(vault.seal('refresh-secret', context), envelope);
  assert.ok(!JSON.stringify(envelope).includes('refresh-secret'));
  for (const changed of [{ ...context, tenantId: 'tenant-b' }, { ...context, connectionId: 'connection-b' }]) {
    assert.throws(() => vault.open(envelope, changed), /Credential unavailable/);
  }
  assert.throws(() => vault.open({ ...envelope, ciphertext: Buffer.from('tampered').toString('base64') }, context));
  assert.throws(() => vault.open({ ...envelope, nonce: randomBytes(12).toString('base64') }, context));
  assert.throws(() => vault.open({ ...envelope, tag: randomBytes(16).toString('base64') }, context));
  assert.throws(() => vault.open({ ...envelope, version: 2 }, context));
  assert.throws(() => vault.open({ ...envelope, keyId: 'missing-key' }, context));
  assert.throws(() => vault.open(envelope, { ...context, provider: 'other' } as unknown as typeof context));
  assert.throws(() => new CredentialVault('key-1', { 'key-1': randomBytes(32).toString('base64') }).open(envelope, context));
  const rotated = new CredentialVault('key-2', { 'key-1': key, 'key-2': randomBytes(32).toString('base64') });
  assert.equal(rotated.open(envelope, context), 'refresh-secret');
  assert.equal(rotated.seal('new-secret', context).keyId, 'key-2');
  assert.throws(() => new CredentialVault('key-1', { 'key-1': 'weak' }));
});

const destination = { spreadsheetId: 'sheet_id-123', tab: "Client's orders" };
const row = ['order-123', '=IMPORTXML("example")', '+212612345678', '281.00'];
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status }); }
test('refresh uses fixed OAuth endpoint, form encoding, bounded tokens and no redirects', async () => {
  const provider = new GoogleSheetsProvider({ clientId: 'client', clientSecret: 'secret' }, async (url, init) => {
    assert.equal(String(url), 'https://oauth2.googleapis.com/token');
    assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal);
    assert.equal(new URLSearchParams(String(init?.body)).get('refresh_token'), 'refresh&secret');
    return json({ access_token: 'access', token_type: 'Bearer', expires_in: 3600 });
  });
  assert.deepEqual(await provider.refresh('refresh&secret'), { accessToken: 'access', expiresIn: 3600 });
});
test('append writes RAW strings, quotes tab names and validates returned row evidence', async () => {
  let calls = 0;
  const provider = new GoogleSheetsProvider({ clientId: 'client', clientSecret: 'secret' }, async (url, init) => {
    calls++;
    const parsed = new URL(String(url));
    assert.equal(parsed.origin, 'https://sheets.googleapis.com');
    assert.ok(decodeURIComponent(parsed.pathname).includes("'Client''s orders'!A:D:append"));
    assert.equal(parsed.searchParams.get('valueInputOption'), 'RAW');
    assert.equal(init?.redirect, 'error');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer access');
    assert.deepEqual(JSON.parse(String(init?.body)).values, [row]);
    return json({ spreadsheetId: destination.spreadsheetId, updates: { updatedRange: "'Client''s orders'!A7:D7", updatedRows: 1, updatedColumns: 4, updatedCells: 4 } });
  });
  assert.deepEqual(await provider.append('access', destination, row), { updatedRange: "'Client''s orders'!A7:D7" });
  assert.equal(calls, 1);
});
test('uncertain append outcomes never retry and never expose provider content', async () => {
  for (const response of [() => { throw new Error('secret'); }, () => json({ error: 'secret' }, 503), () => json({}),
    () => new Response('x'.repeat(70000)), () => json({ updates: { updatedRange: 'Other!A1:D1' } })]) {
    let calls = 0;
    const provider = new GoogleSheetsProvider({ clientId: 'client', clientSecret: 'secret' }, async () => { calls++; return response(); });
    await assert.rejects(provider.append('access', destination, row), (error: unknown) => {
      assert.ok(error instanceof GoogleFailure);
      assert.equal(error.code, 'OUTCOME_UNKNOWN'); assert.equal(error.message, 'OUTCOME_UNKNOWN'); return true;
    });
    assert.equal(calls, 1);
  }
});
test('success evidence must match the exact spreadsheet, tab, row and dimensions', async () => {
  const valid = { spreadsheetId: destination.spreadsheetId, updates: { updatedRange: "'Client''s orders'!A7:D7", updatedRows: 1, updatedColumns: 4, updatedCells: 4 } };
  for (const body of [{ ...valid, spreadsheetId: 'other' },
    ...['Other!A7:D7', "'Client''s orders'!A7:D8", "'Client''s orders'!A7:E7", "'Client''s orders'!A0:D0"].map(updatedRange => ({ ...valid, updates: { ...valid.updates, updatedRange } })),
    { ...valid, updates: { ...valid.updates, updatedRows: 2 } }, { ...valid, updates: { ...valid.updates, updatedCells: 3 } }]) {
    const provider = new GoogleSheetsProvider({ clientId: 'client', clientSecret: 'secret' }, async () => json(body));
    await assert.rejects(provider.append('access', destination, row), (error: unknown) => error instanceof GoogleFailure && error.code === 'OUTCOME_UNKNOWN');
  }
});
test('authorization, quota, refresh rejection and invalid inputs have explicit safe failures', async () => {
  for (const [status, code] of [[401, 'AUTHORIZATION_FAILED'], [403, 'AUTHORIZATION_FAILED'], [429, 'RATE_LIMITED'], [400, 'REQUEST_REJECTED']] as const) {
    const provider = new GoogleSheetsProvider({ clientId: 'client', clientSecret: 'secret' }, async () => json({ error: 'secret' }, status));
    await assert.rejects(provider.append('access', destination, row), (error: unknown) => error instanceof GoogleFailure && error.code === code);
  }
  let calls = 0;
  const provider = new GoogleSheetsProvider({ clientId: 'client', clientSecret: 'secret' }, async () => { calls++; return json({}); });
  await assert.rejects(provider.append('access', { ...destination, spreadsheetId: '../escape' }, row));
  await assert.rejects(provider.append('access\r\nheader', destination, row));
  await assert.rejects(provider.append('access', destination, []));
  assert.equal(calls, 0);
  const rejected = new GoogleSheetsProvider({ clientId: 'client', clientSecret: 'secret' }, async () => json({ error: 'invalid_grant' }, 400));
  await assert.rejects(rejected.refresh('revoked'), (error: unknown) => error instanceof GoogleFailure && error.code === 'AUTHORIZATION_FAILED');
});

test('cancellation before dispatch makes no request; cancellation after dispatch is uncertain', async () => {
  let calls = 0;
  const provider = new GoogleSheetsProvider({ clientId: 'client', clientSecret: 'secret' }, async (_url, init) => {
    calls++;
    return new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  });
  await assert.rejects(provider.append('access', destination, row, AbortSignal.abort()));
  assert.equal(calls, 0);
  const controller = new AbortController();
  const pending = provider.append('access', destination, row, controller.signal);
  controller.abort();
  await assert.rejects(pending, (error: unknown) => error instanceof GoogleFailure && error.code === 'OUTCOME_UNKNOWN');
  assert.equal(calls, 1);
});

test('oversized streamed responses are cancelled and refresh response validation is strict', async () => {
  let cancelled = false;
  const provider = new GoogleSheetsProvider({ clientId: 'client', clientSecret: 'secret' }, async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(65537)); }, cancel() { cancelled = true; },
  })));
  await assert.rejects(provider.append('access', destination, row), (error: unknown) => error instanceof GoogleFailure && error.code === 'OUTCOME_UNKNOWN');
  assert.equal(cancelled, true);
  for (const body of [{ access_token: 'secret', token_type: 'Bearer', expires_in: -1 }, { access_token: 'secret\r\n', token_type: 'Bearer', expires_in: 3600 }]) {
    const invalid = new GoogleSheetsProvider({ clientId: 'client', clientSecret: 'secret' }, async () => json(body));
    await assert.rejects(invalid.refresh('refresh'), (error: unknown) => error instanceof GoogleFailure && error.code === 'INVALID_RESPONSE');
  }
});
