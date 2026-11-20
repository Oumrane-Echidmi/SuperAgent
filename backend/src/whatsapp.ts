import { createHmac, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import { Database, HttpError } from './database.ts';
import { readBearerToken } from './auth.ts';

export type WhatsAppConfig = { appSecret: string; verifyToken: string };
export type InboundMessage = { phoneNumberId: string; messageId: string; customerPhone: string; type: string; body: string | null; sentAt: Date };

export function readWhatsAppConfig(env: Record<string, string | undefined>): WhatsAppConfig | undefined {
  const enabled = env.WHATSAPP_ENABLED ?? 'false';
  if (enabled === 'false') return undefined;
  if (enabled !== 'true' || !env.WHATSAPP_APP_SECRET || !env.WHATSAPP_VERIFY_TOKEN || env.WHATSAPP_APP_SECRET.length < 16 || env.WHATSAPP_VERIFY_TOKEN.length < 16) {
    throw new Error('Check WhatsApp configuration: secrets must be at least 16 characters.');
  }
  return { appSecret: env.WHATSAPP_APP_SECRET, verifyToken: env.WHATSAPP_VERIFY_TOKEN };
}

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
export function verifySignature(secret: string, rawBody: Buffer, header: string | undefined) {
  if (!header?.startsWith('sha256=')) return false;
  return safeEqual(header.slice(7), createHmac('sha256', secret).update(rawBody).digest('hex'));
}

const messageSchema = z.object({ id: z.string().min(1).max(200), from: z.string().regex(/^[0-9]{5,20}$/),
  timestamp: z.string().regex(/^[0-9]{1,12}$/), type: z.string().min(1).max(40), text: z.object({ body: z.string() }).optional() });
const payloadSchema = z.object({ object: z.literal('whatsapp_business_account'), entry: z.array(z.object({
  changes: z.array(z.object({ value: z.object({ metadata: z.object({ phone_number_id: z.string().regex(/^[0-9]{5,32}$/) }),
    messages: z.array(z.unknown()).optional() }) })) })) });

// Invalid individual messages are skipped; the envelope must be well formed.
export function parseInbound(payload: unknown): InboundMessage[] {
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) throw new HttpError(422, 'INVALID_INPUT', 'Unsupported webhook payload.');
  const out: InboundMessage[] = [];
  for (const entry of parsed.data.entry) for (const change of entry.changes) {
    for (const raw of change.value.messages ?? []) {
      const m = messageSchema.safeParse(raw);
      if (!m.success) continue;
      out.push({ phoneNumberId: change.value.metadata.phone_number_id, messageId: m.data.id, customerPhone: m.data.from,
        type: m.data.type, body: m.data.text?.body.slice(0, 4096) ?? null, sentAt: new Date(Number(m.data.timestamp) * 1000) });
    }
  }
  return out;
}

const numberSchema = z.strictObject({ id: z.uuid(), phoneNumberId: z.string().regex(/^[0-9]{5,32}$/), displayName: z.string().trim().min(1).max(100) });
const columns = 'id, phone_number_id AS "phoneNumberId", display_name AS "displayName", created_at AS "createdAt"';
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new HttpError(422, 'INVALID_INPUT', 'Check the request fields.');
  return r.data;
}

export function whatsappRoutes(db: Database, config?: WhatsAppConfig) {
  const router = Router();
  const raw = (req: Request) => (req as Request & { rawBody?: Buffer }).rawBody;
  router.get('/webhooks/whatsapp', (req, res) => {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query as Record<string, unknown>;
    if (!config || mode !== 'subscribe' || typeof token !== 'string' || typeof challenge !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(challenge) || !safeEqual(token, config.verifyToken)) {
      throw new HttpError(403, 'FORBIDDEN', 'Webhook verification failed.');
    }
    res.type('text/plain').send(challenge);
  });
  router.post('/webhooks/whatsapp', async (req, res) => {
    const body = raw(req);
    if (!config || !body || !verifySignature(config.appSecret, body, req.header('x-hub-signature-256'))) {
      throw new HttpError(401, 'INVALID_SIGNATURE', 'Webhook signature check failed.');
    }
    const messages = parseInbound(req.body);
    await db.transaction(async client => {
      for (const m of messages) {
        await client.query('SELECT record_whatsapp_message($1,$2,$3,$4,$5,$6)', [m.phoneNumberId, m.messageId, m.customerPhone, m.type, m.body, m.sentAt]);
      }
    });
    res.json({ received: messages.length });
  });
  const base = '/tenants/:tenantId/whatsapp-numbers';
  router.use(base, (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.post(base, async (req, res) => {
    const tenantId = parse(z.uuid(), req.params.tenantId), input = parse(numberSchema, req.body);
    const result = await db.authenticated(readBearerToken(req.headers.authorization), async (client, userId) => {
      const member = await client.query('SELECT role FROM memberships WHERE tenant_id=$1', [tenantId]);
      if (!member.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Business not found.');
      if (member.rows[0].role !== 'OWNER') throw new HttpError(403, 'FORBIDDEN', 'Only an owner can register a WhatsApp number.');
      const existing = await client.query(`SELECT ${columns} FROM whatsapp_numbers WHERE tenant_id=$1 AND id=$2`, [tenantId, input.id]);
      if (existing.rowCount) {
        if (existing.rows[0].phoneNumberId !== input.phoneNumberId) throw new HttpError(409, 'NUMBER_ID_REUSED', 'Use a new ID for a different number.');
        return { status: 200, row: existing.rows[0] };
      }
      // RLS hides other tenants' rows, so a unique violation is the authoritative duplicate check.
      try {
        const row = await client.query(`INSERT INTO whatsapp_numbers(tenant_id,id,phone_number_id,display_name,created_by) VALUES ($1,$2,$3,$4,$5) RETURNING ${columns}`,
          [tenantId, input.id, input.phoneNumberId, input.displayName, userId]);
        return { status: 201, row: row.rows[0] };
      } catch (error) {
        if ((error as { code?: string }).code === '23505') throw new HttpError(409, 'NUMBER_IN_USE', 'This WhatsApp number is already registered.');
        throw error;
      }
    });
    res.status(result.status).json(result.row);
  });
  router.get(base, async (req, res) => {
    const tenantId = parse(z.uuid(), req.params.tenantId);
    res.json({ data: await db.authenticated(readBearerToken(req.headers.authorization), async client =>
      (await client.query(`SELECT ${columns} FROM whatsapp_numbers WHERE tenant_id=$1 ORDER BY created_at, id`, [tenantId])).rows) });
  });
  router.get('/tenants/:tenantId/whatsapp-messages', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const tenantId = parse(z.uuid(), req.params.tenantId);
    const q = parse(z.strictObject({ limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).max(10000).default(0) }), req.query);
    const data = await db.authenticated(readBearerToken(req.headers.authorization), async client =>
      (await client.query(`SELECT message_id AS id, customer_phone AS "customerPhone", message_type AS type, body, sent_at AS "sentAt", received_at AS "receivedAt"
        FROM whatsapp_messages WHERE tenant_id=$1 ORDER BY received_at DESC, message_id LIMIT $2 OFFSET $3`, [tenantId, q.limit, q.offset])).rows);
    res.json({ data, ...q });
  });
  router.get('/tenants/:tenantId/whatsapp-outbox', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const tenantId = parse(z.uuid(), req.params.tenantId);
    const q = parse(z.strictObject({ limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).max(10000).default(0) }), req.query);
    const data = await db.authenticated(readBearerToken(req.headers.authorization), async client =>
      (await client.query(`SELECT id, run_id AS "runId", to_phone AS "to", body, status, attempts, error_code AS "errorCode", created_at AS "createdAt", sent_at AS "sentAt"
        FROM whatsapp_outbox WHERE tenant_id=$1 ORDER BY created_at DESC, id LIMIT $2 OFFSET $3`, [tenantId, q.limit, q.offset])).rows);
    res.json({ data, ...q });
  });
  return router;
}
