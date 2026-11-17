import { z } from 'zod';
import { orderDetailsSchema, reviewOrder, formatMad } from './cod.ts';

export const COD_SHEET_HEADERS = ['operationKey','orderId','item','quantity','recipient','phone','address','unitAmountMinor','deliveryAmountMinor','amountMad','currency','status'];
const payloadSchema = orderDetailsSchema.required().extend({ schemaVersion: z.literal(1), orderId: z.uuid(), amountMinor: z.number().int().nonnegative(),
  amountMad: z.string(), currency: z.literal('MAD'), status: z.literal('CONFIRMED') });
export function buildCodSheetRow(payload: unknown): string[] {
  const p = payloadSchema.parse(payload);
  const amount = reviewOrder(orderDetailsSchema.strip().parse(p), 'fr').amountMinor;
  if (amount !== p.amountMinor || p.amountMad !== formatMad(p.amountMinor)) throw new Error('Invalid stored COD amount.');
  return [`cod:sheet:${p.orderId}`,p.orderId,p.item,String(p.quantity),p.recipient,p.phone,p.address,String(p.unitAmountMinor),String(p.deliveryAmountMinor),p.amountMad,p.currency,p.status];
}
export function inspectCodRows(rows: (string | number | boolean)[][], expected: string[]): { kind: 'ABSENT' } | { kind: 'MATCH'; row: number } | { kind: 'CONFLICT' } {
  if (JSON.stringify(rows[0]) !== JSON.stringify(COD_SHEET_HEADERS)) throw new Error('SHEET_HEADERS');
  const matches = rows.map((row,index) => ({ row, index })).filter(({ row,index }) => index > 0 && row[0] === expected[0]);
  if (matches.length === 0) {
    // Appending searches for a logical table. Require one contiguous A:L table before a new effect.
    if (rows.slice(1).some(row => row.length!==12 || row.some(cell=>typeof cell!=='string')
      || !z.uuid().safeParse(row[1]).success || row[0]!==`cod:sheet:${row[1]}`)) throw new Error('SHEET_LAYOUT');
    return { kind: 'ABSENT' };
  }
  if (matches.length !== 1 || JSON.stringify(matches[0]!.row) !== JSON.stringify(expected)) return { kind: 'CONFLICT' };
  return { kind: 'MATCH', row: matches[0]!.index + 1 };
}
export const codRowRange = (tab: string, row: number) => `'${tab.replaceAll("'", "''")}'!A${row}:L${row}`;
