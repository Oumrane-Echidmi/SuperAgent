import assert from 'node:assert/strict';
import test from 'node:test';
import { orderDetailsSchema, reviewOrder, orderSummaryHash, formatMad } from '../src/cod.ts';

const details = { item: 'Article', quantity: 2, recipient: 'Client', phone: '+212612345678', address: 'Casablanca', unitAmountMinor: 12550, deliveryAmountMinor: 3000 };
test('COD totals use integer minor units and exact MAD formatting', () => {
  assert.equal(reviewOrder(details, 'fr').amountMinor, 28100);
  assert.equal(formatMad(28100), '281.00');
  assert.equal(formatMad(1), '0.01');
  assert.equal(reviewOrder({ ...details, quantity: 1000, unitAmountMinor: 1000000000, deliveryAmountMinor: 1000000000 }, 'fr').amountMinor, 1001000000000);
  assert.equal(formatMad(1001000000000), '10010000000.00');
  assert.equal(reviewOrder({ ...details, unitAmountMinor: 0, deliveryAmountMinor: 0 }, 'fr').ready, true);
});
test('missing customer facts produce focused French/Darija questions and prices require staff', () => {
  const review = reviewOrder({}, 'darija');
  assert.equal(review.ready, false); assert.equal(review.amountMinor, null);
  assert.equal(review.customerQuestions.length, 5); assert.equal(review.staffRequirements.length, 2);
  assert.ok(review.customerQuestions.some(question => question.field === 'address'));
  assert.notEqual(review.customerQuestions[0]?.question, reviewOrder({}, 'fr').customerQuestions[0]?.question);
});
test('rejects invalid quantities, fractional money, invalid phones and undeclared fields', () => {
  for (const input of [{ quantity: 0 }, { quantity: 1001 }, { unitAmountMinor: 1.1 }, { unitAmountMinor: -1 }, { phone: '612345678' }, { paid: true }]) {
    assert.equal(orderDetailsSchema.safeParse(input).success, false);
  }
});
test('summary hashes bind tenant, conversation, attempt and exact normalized details', () => {
  const context = { tenantId: 'tenant-a', conversationId: 'conversation-a', attemptId: 'attempt-a' };
  const original = orderSummaryHash(context, details);
  assert.equal(orderSummaryHash(context, { ...details }), original);
  assert.equal(orderSummaryHash(context, Object.fromEntries(Object.entries(details).reverse())), original);
  assert.notEqual(orderSummaryHash(context, { ...details, quantity: 3 }), original);
  assert.notEqual(orderSummaryHash({ ...context, tenantId: 'tenant-b' }, details), original);
  assert.notEqual(orderSummaryHash({ ...context, conversationId: 'conversation-b' }, details), original);
  assert.notEqual(orderSummaryHash({ ...context, attemptId: 'attempt-b' }, details), original);
});
