import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { createHmac } from 'node:crypto';
import { createApp } from '../src/app.ts';
import { Database } from '../src/database.ts';
import { parseInbound, readWhatsAppConfig, verifySignature } from '../src/whatsapp.ts';

const payload = { object: 'whatsapp_business_account', entry: [{ changes: [{ value: { metadata: { phone_number_id: '1234567890' },
  messages: [{ id: 'wamid.1', from: '212600000000', timestamp: '1700000000', type: 'text', text: { body: 'Oui, je confirme' } }, { bad: true }] } }] }] };
const config = { appSecret: 'a'.repeat(20), verifyToken: 'v'.repeat(20) };

test('signature verification is exact', () => {
  const body = Buffer.from(JSON.stringify(payload));
  const good = 'sha256=' + createHmac('sha256', config.appSecret).update(body).digest('hex');
  assert.equal(verifySignature(config.appSecret, body, good), true);
  assert.equal(verifySignature(config.appSecret, body, good.replace(/.$/, c => (c === '0' ? '1' : '0'))), false);
  assert.equal(verifySignature(config.appSecret, body, undefined), false);
  assert.equal(verifySignature(config.appSecret, body, 'sha256=abc'), false);
});
test('inbound parsing keeps valid messages and rejects foreign payloads', () => {
  const messages = parseInbound(payload);
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.body, 'Oui, je confirme');
  assert.equal(messages[0]?.sentAt.toISOString(), '2023-11-14T22:13:20.000Z');
  assert.throws(() => parseInbound({ object: 'page' }));
});
test('configuration is opt-in and strict', () => {
  assert.equal(readWhatsAppConfig({}), undefined);
  assert.throws(() => readWhatsAppConfig({ WHATSAPP_ENABLED: 'true', WHATSAPP_APP_SECRET: 'short', WHATSAPP_VERIFY_TOKEN: 'short' }));
  assert.deepEqual(readWhatsAppConfig({ WHATSAPP_ENABLED: 'true', WHATSAPP_APP_SECRET: config.appSecret, WHATSAPP_VERIFY_TOKEN: config.verifyToken }), config);
});
test('webhook verifies the challenge and rejects unsigned posts', async () => {
  const db = { transaction: async () => { throw new Error('must not run'); } } as unknown as Database;
  const server = createApp(db, { whatsapp: config }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/v1/webhooks/whatsapp`;
  try {
    const ok = await fetch(`${base}?hub.mode=subscribe&hub.verify_token=${config.verifyToken}&hub.challenge=abc123`);
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), 'abc123');
    assert.equal((await fetch(`${base}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123`)).status, 403);
    const unsigned = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    assert.equal(unsigned.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
