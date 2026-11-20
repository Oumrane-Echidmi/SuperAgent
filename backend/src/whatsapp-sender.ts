import { Database } from './database.ts';

export class SendFailure extends Error {
  readonly code: string;
  readonly retryable: boolean;
  constructor(code: string, retryable: boolean) { super(code); this.code = code; this.retryable = retryable; }
}
export interface WhatsAppSender {
  send(message: { phoneNumberId: string; to: string; body: string }): Promise<{ messageId: string }>;
}

// Meta WhatsApp Cloud API. Free-text replies are valid inside the 24-hour customer-service window,
// which a reply to an inbound message always satisfies.
export class GraphApiSender implements WhatsAppSender {
  private readonly token: string;
  private readonly version: string;
  private readonly request: typeof fetch;
  constructor(token: string, version = 'v21.0', request: typeof fetch = fetch) {
    if (!/^v\d{1,2}\.\d$/.test(version) || token.length < 16) throw new Error('Check the WhatsApp access token and API version.');
    this.token = token; this.version = version; this.request = request;
  }
  async send(message: { phoneNumberId: string; to: string; body: string }) {
    let response: Response;
    try {
      response = await this.request(`https://graph.facebook.com/${this.version}/${encodeURIComponent(message.phoneNumberId)}/messages`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: message.to, type: 'text', text: { body: message.body, preview_url: false } }),
      });
    } catch { throw new SendFailure('NETWORK_ERROR', true); }
    if (!response.ok) {
      await response.body?.cancel();
      // 429 and 5xx are transient; other 4xx (bad token, closed window, invalid number) will not improve on retry.
      throw new SendFailure(`PROVIDER_${response.status}`, response.status === 429 || response.status >= 500);
    }
    const body = await response.json().catch(() => null) as { messages?: { id?: unknown }[] } | null;
    const id = body?.messages?.[0]?.id;
    if (typeof id !== 'string' || !id) throw new SendFailure('PROVIDER_INVALID_RESPONSE', false);
    return { messageId: id };
  }
}

// Claims one queued message, sends it outside any transaction, then records the outcome.
export async function processNextOutbox(db: Database, sender: WhatsAppSender): Promise<boolean> {
  const claimed = await db.pool.query('SELECT tenant_id AS "tenantId", message_id AS "id", phone_number_id AS "phoneNumberId", to_phone AS "to", body FROM claim_whatsapp_outbox()');
  if (!claimed.rowCount) return false;
  const row = claimed.rows[0] as { tenantId: string; id: string; phoneNumberId: string; to: string; body: string };
  try {
    const result = await sender.send({ phoneNumberId: row.phoneNumberId, to: row.to, body: row.body });
    await db.pool.query('SELECT finish_whatsapp_outbox($1, $2, true, $3, NULL, false)', [row.tenantId, row.id, result.messageId]);
  } catch (error) {
    const failure = error instanceof SendFailure ? error : new SendFailure('SEND_FAILED', true);
    await db.pool.query('SELECT finish_whatsapp_outbox($1, $2, false, NULL, $3, $4)', [row.tenantId, row.id, failure.code, failure.retryable]);
  }
  return true;
}
export function startOutboxSender(db: Database, sender: WhatsAppSender, intervalMs = 2000) {
  let stopped = false;
  const done = (async () => {
    while (!stopped) {
      let worked = false;
      try { worked = await processNextOutbox(db, sender); } catch { /* keep polling */ }
      if (!worked) await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  })();
  return { stop: async () => { stopped = true; await done; } };
}
