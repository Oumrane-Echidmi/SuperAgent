import { Router } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { Database, HttpError, hashToken } from './database.ts';
import { readBearerToken } from './auth.ts';
import { GoogleOAuthProvider } from './google-oauth.ts';
import type { GoogleConnectionConfig, GoogleOAuth } from './google-oauth.ts';

const publicColumns = `id, CASE WHEN status IN ('AUTHORIZING','EXCHANGING') AND expires_at <= clock_timestamp() THEN 'EXPIRED' ELSE status END AS status,
  scopes, created_by AS "createdBy", created_at AS "createdAt", expires_at AS "expiresAt", connected_at AS "connectedAt", updated_at AS "updatedAt"`;
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(422, 'INVALID_INPUT', 'Check the request fields.');
  return result.data;
}
async function requireOwner(client: PoolClient, tenantId: string) {
  const member = await client.query('SELECT role FROM memberships WHERE tenant_id=$1', [tenantId]);
  if (!member.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Connection not found.');
  if (member.rows[0].role !== 'OWNER') throw new HttpError(403, 'FORBIDDEN', 'Only an owner can manage connections.');
}
function unavailable(): never { throw new HttpError(409, 'AUTHORIZATION_UNAVAILABLE', 'Start a new Google connection attempt.'); }
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Connection not found.');

export function googleConnectionRoutes(db: Database, config?: GoogleConnectionConfig, suppliedOAuth?: GoogleOAuth) {
  const router = Router();
  const oauth = suppliedOAuth ?? (config ? new GoogleOAuthProvider({ clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri }) : undefined);
  const path = '/tenants/:tenantId/connections/google';
  router.use('/tenants/:tenantId/connections/google', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  router.post(path, async (req, res) => {
    const bearer = readBearerToken(req.headers.authorization); const tenantId = parse(z.uuid(), req.params.tenantId);
    parse(z.strictObject({}), req.body);
    const result = await db.authenticated(bearer, async (client, userId) => {
      await requireOwner(client, tenantId);
      if (!config || !oauth) throw new HttpError(503, 'GOOGLE_DISABLED', 'Google connections are not enabled.');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`google-connect:${tenantId}`]);
      const quota = await client.query("SELECT count(*)::int AS count FROM google_connections WHERE tenant_id=$1 AND created_at>now()-interval '15 minutes'", [tenantId]);
      if (quota.rows[0].count >= 5) throw new HttpError(429, 'RATE_LIMITED', 'Try connecting again in 15 minutes.');
      const id = randomUUID(); const state = randomBytes(32).toString('base64url'); const verifier = randomBytes(32).toString('base64url');
      const envelope = config.vault.seal(verifier, { tenantId, connectionId: id + ':pkce', provider: 'google' });
      const inserted = await client.query(`INSERT INTO google_connections(tenant_id,id,created_by,oauth_client_id,redirect_uri,status,state_hash,verifier_envelope)
        VALUES ($1,$2,$3,$4,$5,'AUTHORIZING',$6,$7) RETURNING ${publicColumns}`,
      [tenantId, id, userId, config.clientId, config.redirectUri, hashToken(state), JSON.stringify(envelope)]);
      return { connection: inserted.rows[0], authorizationUrl: oauth.authorizationUrl(state, verifier) };
    });
    res.status(201).json(result);
  });
  router.get(path, async (req, res) => {
    const bearer = readBearerToken(req.headers.authorization); const tenantId = parse(z.uuid(), req.params.tenantId);
    const query = parse(z.strictObject({ limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).max(10000).default(0) }), req.query);
    const data = await db.authenticated(bearer, async client => {
      await requireOwner(client, tenantId);
      return (await client.query(`SELECT ${publicColumns} FROM google_connections WHERE tenant_id=$1 ORDER BY created_at DESC,id LIMIT $2 OFFSET $3`, [tenantId, query.limit, query.offset])).rows;
    });
    res.json({ data, limit: query.limit, offset: query.offset });
  });
  router.get(path + '/:id', async (req, res) => {
    const bearer = readBearerToken(req.headers.authorization); const tenantId = parse(z.uuid(), req.params.tenantId); const id = parse(z.uuid(), req.params.id);
    const result = await db.authenticated(bearer, async client => {
      await requireOwner(client, tenantId);
      const row = await client.query(`SELECT ${publicColumns} FROM google_connections WHERE tenant_id=$1 AND id=$2`, [tenantId, id]);
      if (!row.rowCount) throw notFound(); return row.rows[0];
    });
    res.json(result);
  });
  router.delete(path + '/:id', async (req, res) => {
    const bearer = readBearerToken(req.headers.authorization); const tenantId = parse(z.uuid(), req.params.tenantId); const id = parse(z.uuid(), req.params.id);
    const result = await db.authenticated(bearer, async (client, userId) => {
      await requireOwner(client, tenantId);
      const row = await client.query(`UPDATE google_connections SET status='DISCONNECTED',state_hash=NULL,verifier_envelope=NULL,credential_envelope=NULL,
        disconnected_by=$3,updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2 RETURNING ${publicColumns}`, [tenantId, id, userId]);
      if (!row.rowCount) throw notFound(); return row.rows[0];
    });
    res.json(result);
  });
  router.post(path + '/:id/complete', async (req, res) => {
    const bearer = readBearerToken(req.headers.authorization); const tenantId = parse(z.uuid(), req.params.tenantId); const id = parse(z.uuid(), req.params.id);
    const input = parse(z.strictObject({ state: z.string().regex(/^[A-Za-z0-9_-]{43}$/), code: z.string().min(1).max(16000).regex(/^[\x21-\x7e]+$/) }), req.body);
    // Consume the authorization before any provider call. Never hold a DB transaction during HTTP.
    const verifier = await db.authenticated(bearer, async (client, userId) => {
      await requireOwner(client, tenantId);
      if (!config || !oauth) throw new HttpError(503, 'GOOGLE_DISABLED', 'Google connections are not enabled.');
      const row = await client.query(`SELECT status,state_hash,verifier_envelope,created_by,oauth_client_id,redirect_uri,expires_at>clock_timestamp() AS valid
        FROM google_connections WHERE tenant_id=$1 AND id=$2 FOR UPDATE`, [tenantId, id]);
      if (!row.rowCount) throw notFound(); const pending = row.rows[0];
      if (pending.status !== 'AUTHORIZING' || !pending.valid || pending.created_by !== userId || pending.state_hash !== hashToken(input.state)
        || pending.oauth_client_id !== config.clientId || pending.redirect_uri !== config.redirectUri) unavailable();
      const value = config.vault.open(pending.verifier_envelope, { tenantId, connectionId: id + ':pkce', provider: 'google' });
      await client.query("UPDATE google_connections SET status='EXCHANGING',state_hash=NULL,verifier_envelope=NULL,updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
      return value;
    });
    let credential: Awaited<ReturnType<GoogleOAuth['exchange']>>;
    try { credential = await oauth!.exchange(input.code, verifier); }
    catch {
      // Failure is terminal; a lost response/code must be resolved by fresh consent, not a repeated exchange.
      await db.authenticated(bearer, async client => {
        await requireOwner(client, tenantId);
        await client.query("UPDATE google_connections SET status='FAILED',updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2 AND status='EXCHANGING'", [tenantId, id]);
      });
      throw new HttpError(502, 'GOOGLE_AUTHORIZATION_FAILED', 'Google connection failed. Start a new connection attempt.');
    }
    const result = await db.authenticated(bearer, async (client, userId) => {
      await requireOwner(client, tenantId);
      const envelope = config!.vault.seal(credential.refreshToken, { tenantId, connectionId: id, provider: 'google' });
      const row = await client.query(`UPDATE google_connections SET status='CONNECTED',credential_envelope=$4,scopes=$5,connected_at=clock_timestamp(),updated_at=clock_timestamp()
        WHERE tenant_id=$1 AND id=$2 AND created_by=$3 AND status='EXCHANGING' AND expires_at>clock_timestamp() RETURNING ${publicColumns}`,
      [tenantId, id, userId, JSON.stringify(envelope), credential.scopes]);
      if (!row.rowCount) unavailable(); return row.rows[0];
    });
    res.json(result);
  });
  return router;
}
