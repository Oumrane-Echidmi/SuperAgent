import { Router } from 'express';
import type { PoolClient } from 'pg';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Database, HttpError, hashToken } from './database.ts';
import { dummyPasswordHash, hashPassword, readBearerToken, verifyPassword } from './auth.ts';

const email = z.email().max(254).transform(value => value.toLowerCase());
const credentials = z.strictObject({ email, password: z.string().min(12).max(128) });
const registration = credentials.extend({ businessName: z.string().trim().min(1).max(120) });
const profile = z.strictObject({
  language: z.enum(['darija', 'fr']),
  timezone: z.string().max(100).refine(value => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
  }, 'Provide a supported IANA timezone.'),
  description: z.string().max(4000),
});

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new HttpError(422, 'INVALID_INPUT', 'Check the request fields.');
  return parsed.data;
}

async function issueSession(client: PoolClient, userId: string) {
  const token = randomBytes(32).toString('base64url');
  const result = await client.query(`INSERT INTO sessions(token_hash, user_id, expires_at)
    VALUES ($1, $2, now() + interval '24 hours') RETURNING expires_at`, [hashToken(token), userId]);
  return { token, expiresAt: result.rows[0].expires_at };
}

export function identityRoutes(db: Database) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  for (const path of ['/auth/registrations', '/auth/sessions']) {
    router.post(path, async (req, _res, next) => {
      await db.consumeAuthAttempt(hashToken(`ip:${req.ip ?? 'unknown'}`));
      next();
    });
  }
  router.post('/auth/registrations', async (req, res) => {
    const input = parse(registration, req.body);
    await db.consumeAuthAttempt(hashToken(`email:${input.email}`));
    const passwordHash = await hashPassword(input.password);
    const result = await db.transaction(async client => {
      const userId = randomUUID();
      const tenantId = randomUUID();
      const inserted = await client.query(`INSERT INTO users(id, email, password_hash) VALUES ($1, $2, $3)
        ON CONFLICT (email) DO NOTHING RETURNING id`, [userId, input.email, passwordHash]);
      if (!inserted.rowCount) throw new HttpError(409, 'REGISTRATION_UNAVAILABLE', 'Registration could not be completed.');
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      await client.query('INSERT INTO tenants(id, name, created_by) VALUES ($1, $2, $3)', [tenantId, input.businessName, userId]);
      await client.query("INSERT INTO memberships(tenant_id, user_id, role) VALUES ($1, $2, 'OWNER')", [tenantId, userId]);
      await client.query('INSERT INTO business_profiles(tenant_id) VALUES ($1)', [tenantId]);
      return { user: { id: userId, email: input.email }, tenant: { id: tenantId, name: input.businessName, role: 'OWNER' }, ...await issueSession(client, userId) };
    });
    res.status(201).json(result);
  });
  router.post('/auth/sessions', async (req, res) => {
    const input = parse(credentials, req.body);
    await db.consumeAuthAttempt(hashToken(`email:${input.email}`));
    const result = await db.pool.query('SELECT id, password_hash FROM users WHERE email = $1', [input.email]);
    const user = result.rows[0];
    const valid = await verifyPassword(input.password, user?.password_hash ?? dummyPasswordHash);
    if (!valid || !user) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    res.status(201).json(await db.transaction(client => issueSession(client, user.id)));
  });
  router.delete('/auth/session', async (req, res) => {
    const token = readBearerToken(req.headers.authorization);
    await db.authenticated(token, async client => {
      await client.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
    });
    res.json({ signedOut: true });
  });
  router.get('/me', async (req, res) => {
    const result = await db.authenticated(readBearerToken(req.headers.authorization), async (client, userId) => {
      const user = await client.query('SELECT id, email FROM users WHERE id = $1', [userId]);
      const tenants = await client.query('SELECT t.id, t.name, m.role FROM tenants t JOIN memberships m ON m.tenant_id = t.id WHERE m.user_id = $1 ORDER BY t.id', [userId]);
      return { user: user.rows[0], tenants: tenants.rows };
    });
    res.json(result);
  });
  router.route('/tenants/:tenantId/profile')
    .get(async (req, res) => {
      const token = readBearerToken(req.headers.authorization);
      const tenantId = parse(z.uuid(), req.params.tenantId);
      const result = await db.authenticated(token, client => client.query('SELECT tenant_id AS "tenantId", language, timezone, description, updated_at AS "updatedAt" FROM business_profiles WHERE tenant_id = $1', [tenantId]));
      if (!result.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Business profile not found.');
      res.json(result.rows[0]);
    })
    .put(async (req, res) => {
      const token = readBearerToken(req.headers.authorization);
      const tenantId = parse(z.uuid(), req.params.tenantId);
      const input = parse(profile, req.body);
      const result = await db.authenticated(token, async client => {
        const member = await client.query('SELECT role FROM memberships WHERE tenant_id = $1', [tenantId]);
        if (!member.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Business profile not found.');
        if (member.rows[0].role !== 'OWNER') throw new HttpError(403, 'FORBIDDEN', 'Only an owner can edit the business profile.');
        return client.query(`UPDATE business_profiles SET language = $2, timezone = $3, description = $4, updated_at = now()
          WHERE tenant_id = $1 RETURNING tenant_id AS "tenantId", language, timezone, description, updated_at AS "updatedAt"`, [tenantId, input.language, input.timezone, input.description]);
      });
      if (!result.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Business profile not found.');
      res.json(result.rows[0]);
    });
  return router;
}
