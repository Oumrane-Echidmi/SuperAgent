import assert from 'node:assert/strict';
import test from 'node:test';
import { GoogleSheetsProvider, GoogleFailure } from '../src/google-sheets.ts';

const file = { id: 'sheet-123', mimeType: 'application/vnd.google-apps.spreadsheet', trashed: false, capabilities: { canEdit: true } };
const spreadsheet = { spreadsheetId: 'sheet-123', properties: { title: 'Shop orders' }, sheets: [
  { properties: { sheetId: 0, title: 'Orders', sheetType: 'GRID', gridProperties: { rowCount: 1000, columnCount: 26 } } },
  { properties: { sheetId: 7, title: 'Report', sheetType: 'OBJECT' } },
] };
test('refresh preserves a replacement refresh token for fenced credential rotation', async () => {
  const provider = new GoogleSheetsProvider({ clientId: 'client', clientSecret: 'secret' }, async () => Response.json({ access_token: 'access', token_type: 'Bearer', expires_in: 3600, refresh_token: 'replacement' }));
  assert.deepEqual(await provider.refresh('old'), { accessToken: 'access', expiresIn: 3600, refreshToken: 'replacement' });
});
test('inspection uses fixed metadata-only Drive and Sheets endpoints and exposes grid tab identities', async () => {
  let calls = 0;
  const provider = new GoogleSheetsProvider({ clientId: 'client', clientSecret: 'secret' }, async (url, init) => {
    const target = new URL(String(url)); calls++;
    assert.equal(init?.method, 'GET'); assert.equal(init?.redirect, 'error'); assert.ok(init?.signal);
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer access');
    assert.ok(!target.searchParams.get('fields')?.includes('data('));
    if (calls === 1) {
      assert.equal(target.origin, 'https://www.googleapis.com'); assert.equal(target.pathname, '/drive/v3/files/sheet-123');
      assert.equal(target.searchParams.get('fields'), 'id,mimeType,trashed,capabilities(canEdit)');
      return Response.json(file);
    }
    assert.equal(target.origin, 'https://sheets.googleapis.com'); assert.equal(target.pathname, '/v4/spreadsheets/sheet-123');
    assert.equal(target.searchParams.get('includeGridData'), 'false');
    return Response.json(spreadsheet);
  });
  assert.deepEqual(await provider.inspect('access', 'sheet-123'), { spreadsheetId: 'sheet-123', title: 'Shop orders', tabs: [{ sheetId: 0, title: 'Orders', rowCount: 1000, columnCount: 26 }] });
  assert.equal(calls, 2);
});
test('inspection rejects inaccessible, trashed, non-spreadsheet and read-only files without querying Sheets', async () => {
  for (const body of [{ ...file, capabilities: { canEdit: false } }, { ...file, trashed: true }, { ...file, mimeType: 'text/plain' }]) {
    let calls = 0;
    const provider = new GoogleSheetsProvider({ clientId: 'client', clientSecret: 'secret' }, async () => { calls++; return Response.json(body); });
    await assert.rejects(provider.inspect('access', 'sheet-123'), (error: unknown) => error instanceof GoogleFailure && error.code === 'REQUEST_REJECTED');
    assert.equal(calls, 1);
  }
});
test('inspection rejects mismatched IDs, duplicate tabs, malformed, oversized and redirected responses without retries', async () => {
  for (const body of [{ ...spreadsheet, spreadsheetId: 'other' }, { ...spreadsheet, sheets: [...spreadsheet.sheets, spreadsheet.sheets[0]] },
    { ...spreadsheet, sheets: [{ properties: { sheetId: 0, title: 'Orders', sheetType: 'GRID' } }] }]) {
    let calls = 0;
    const provider = new GoogleSheetsProvider({ clientId: 'client', clientSecret: 'secret' }, async () => Response.json(++calls === 1 ? file : body));
    await assert.rejects(provider.inspect('access', 'sheet-123'), (error: unknown) => error instanceof GoogleFailure && error.code === 'INVALID_RESPONSE');
    assert.equal(calls, 2);
  }
  for (const response of [() => new Response('x'.repeat(65537)), () => new Response(null, { status: 302 }), () => { throw new Error('secret'); }]) {
    let calls = 0;
    const provider = new GoogleSheetsProvider({ clientId: 'client', clientSecret: 'secret' }, async () => { calls++; return response(); });
    await assert.rejects(provider.inspect('access', 'sheet-123'), (error: unknown) => error instanceof GoogleFailure && !error.message.includes('secret'));
    assert.equal(calls, 1);
  }
});
