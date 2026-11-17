import { createHash } from 'node:crypto';
import { z } from 'zod';

export const COD_POLICY_VERSION = 'cod-1.0.0';
export const orderDetailsSchema = z.strictObject({
  item: z.string().trim().min(1).max(200), quantity: z.number().int().min(1).max(1000),
  recipient: z.string().trim().min(1).max(120), phone: z.string().trim().regex(/^\+[1-9][0-9]{7,14}$/),
  address: z.string().trim().min(1).max(500), unitAmountMinor: z.number().int().min(0).max(1000000000),
  deliveryAmountMinor: z.number().int().min(0).max(1000000000),
}).partial();
export type OrderDetails = z.infer<typeof orderDetailsSchema>;
const questions = {
  fr: { item: 'Quel article souhaitez-vous ?', quantity: 'Quelle quantité souhaitez-vous ?', recipient: 'Quel est le nom du destinataire ?', phone: 'Quel est le téléphone avec son indicatif international ?', address: 'Quelle est l’adresse de livraison ?' },
  darija: { item: 'شنو هو المنتوج اللي بغيتي؟', quantity: 'شحال من وحدة بغيتي؟', recipient: 'شنو سميّة اللي غادي يتوصل؟', phone: 'شنو نمرة الهاتف مع رمز البلد؟', address: 'شنو عنوان التوصيل؟' },
};
export function reviewOrder(input: unknown, language: 'darija' | 'fr') {
  const details = orderDetailsSchema.parse(input);
  const customerFields = ['item', 'quantity', 'recipient', 'phone', 'address'] as const;
  const staffFields = ['unitAmountMinor', 'deliveryAmountMinor'] as const;
  const missingFields = [...customerFields, ...staffFields].filter(field => details[field] === undefined);
  const amountMinor = details.quantity !== undefined && details.unitAmountMinor !== undefined && details.deliveryAmountMinor !== undefined
    ? details.quantity * details.unitAmountMinor + details.deliveryAmountMinor : null;
  return { ready: missingFields.length === 0, missingFields, amountMinor, currency: 'MAD' as const,
    customerQuestions: customerFields.filter(field => details[field] === undefined).map(field => ({ field, question: questions[language][field] })),
    staffRequirements: staffFields.filter(field => details[field] === undefined).map(field => ({ field,
      message: language === 'fr' ? 'La boutique doit fournir le tarif actuel en MAD.' : 'المتجر خاصو يحدد الثمن الحالي بالدرهم.' })) };
}
export function formatMad(minor: number): string {
  if (!Number.isSafeInteger(minor) || minor < 0) throw new Error('Amount must use nonnegative integer minor units.');
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;
}
export function orderSummaryHash(context: { tenantId: string; conversationId: string; attemptId: string }, input: unknown) {
  const details = orderDetailsSchema.parse(input);
  return createHash('sha256').update(JSON.stringify({ policyVersion: COD_POLICY_VERSION, tenantId: context.tenantId,
    conversationId: context.conversationId, attemptId: context.attemptId, currency: 'MAD',
    details: Object.fromEntries(Object.entries(details).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) })).digest('hex');
}
