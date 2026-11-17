import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCodSheetRow, COD_SHEET_HEADERS, inspectCodRows } from '../src/sheet-delivery-contract.ts';
import { GoogleSheetsProvider } from '../src/google-sheets.ts';

const payload = { schemaVersion: 1, orderId: '00000000-0000-4000-8000-000000000001', item: '=literal', quantity: 2, recipient: 'Client', phone: '+212612345678', address: 'Casablanca', unitAmountMinor: 12550, deliveryAmountMinor: 3000, amountMinor: 28100, amountMad: '281.00', currency: 'MAD', status: 'CONFIRMED' };
test('COD sheet rows retain stable identity, literal text and exact prices from the immutable intent', () => {
  const row = buildCodSheetRow(payload);
  assert.equal(row.length, 12); assert.equal(row[0], `cod:sheet:${payload.orderId}`); assert.equal(row[1], payload.orderId);
  assert.equal(row[2], '=literal'); assert.equal(row[8], '3000'); assert.equal(row[9], '281.00');
  assert.throws(() => buildCodSheetRow({ ...payload, amountMad: '280.99' }));
  assert.throws(() => buildCodSheetRow({ ...payload, amountMinor: 28101 }));
});
test('reconciliation requires exact headers and one exact matching row, with no coercion', () => {
  const row = buildCodSheetRow(payload);
  assert.deepEqual(inspectCodRows([COD_SHEET_HEADERS], row), { kind: 'ABSENT' });
  assert.deepEqual(inspectCodRows([COD_SHEET_HEADERS, row], row), { kind: 'MATCH', row: 2 });
  assert.deepEqual(inspectCodRows([COD_SHEET_HEADERS, row, row], row), { kind: 'CONFLICT' });
  assert.deepEqual(inspectCodRows([COD_SHEET_HEADERS, [...row.slice(0, 3), 2, ...row.slice(4)]], row), { kind: 'CONFLICT' });
  assert.throws(() => inspectCodRows([['wrong headers']], row), /SHEET_HEADERS/);
  assert.throws(() => inspectCodRows([COD_SHEET_HEADERS, [], ['another table']], row), /SHEET_LAYOUT/);
});
test('bounded sheet reads request formulas and validate returned range without redirects or retries', async () => {
  const provider = new GoogleSheetsProvider({ clientId: 'client', clientSecret: 'secret' }, async (url, init) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.origin, 'https://sheets.googleapis.com'); assert.ok(decodeURIComponent(parsed.pathname).endsWith("'Orders'!A1:L1000"));
    assert.equal(parsed.searchParams.get('valueRenderOption'), 'FORMULA'); assert.equal(init?.redirect, 'error');
    return Response.json({ range: 'Orders!A1:L1000', majorDimension: 'ROWS', values: [COD_SHEET_HEADERS] });
  });
  assert.deepEqual(await provider.readRows('access', { spreadsheetId: 'sheet-123', tab: 'Orders' }, 1000), [COD_SHEET_HEADERS]);
  let calls = 0;
  const invalid = new GoogleSheetsProvider({ clientId: 'client', clientSecret: 'secret' }, async () => { calls++; return Response.json({ range: 'Other!A1:L1000', majorDimension: 'ROWS', values: [] }); });
  await assert.rejects(invalid.readRows('access', { spreadsheetId: 'sheet-123', tab: 'Orders' }, 1000));
  assert.equal(calls, 1);
  await assert.rejects(invalid.readRows('access', { spreadsheetId: 'sheet-123', tab: 'Orders' }, 1001)); assert.equal(calls, 1);
});
