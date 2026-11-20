import pg from 'pg';
import type { PoolClient } from 'pg';
import { createHash } from 'node:crypto';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class Database {
  readonly pool: pg.Pool;
  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30_000, statement_timeout: 5000, idle_in_transaction_session_timeout: 10_000 });
    this.pool.on('error', () => { console.error('Idle database connection failed.'); });
  }
  async checkRuntimeRole() {
    const result = await this.pool.query(`SELECT r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole, r.rolreplication,
      current_user <> session_user AS switched_role,
      has_schema_privilege(current_user, 'public', 'CREATE') AS can_create,
      EXISTS (SELECT 1 FROM pg_database WHERE datname = current_database() AND datdba = r.oid) AS owns_database,
      EXISTS (SELECT 1 FROM pg_auth_members WHERE member = r.oid) AS inherits_roles,
      EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user) AS owns_tables
      FROM pg_roles r WHERE rolname = current_user`);
    const role = result.rows[0];
    if (!role || role.rolsuper || role.rolbypassrls || role.rolcreatedb || role.rolcreaterole || role.rolreplication
      || role.switched_role || role.can_create || role.owns_database || role.inherits_roles || role.owns_tables) {
      throw new Error('DATABASE_URL must use a non-owner runtime role without superuser, role memberships or BYPASSRLS.');
    }
  }
  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let discard = false;
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { discard = true; }
      throw error;
    } finally { client.release(discard); }
  }
  async authenticated<T>(token: string, work: (client: PoolClient, userId: string) => Promise<T>) {
    return this.transaction(async client => {
      const result = await client.query('SELECT user_id FROM sessions WHERE token_hash = $1 AND expires_at > now()', [hashToken(token)]);
      const userId = result.rows[0]?.user_id as string | undefined;
      if (!userId) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      return work(client, userId);
    });
  }
  // For background workers: act as an already-authorised user (a publisher) under the normal row policies.
  async actingAs<T>(userId: string, work: (client: PoolClient) => Promise<T>) {
    return this.transaction(async client => {
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      return work(client);
    });
  }
  async consumeAuthAttempt(key: string) {
    // Autocommit keeps attempts recorded even when credential verification fails.
    const result = await this.pool.query(`INSERT INTO auth_limits AS l(key, attempts, window_start)
      VALUES ($1, 1, now()) ON CONFLICT (key) DO UPDATE SET
      attempts = CASE WHEN l.window_start <= now() - interval '15 minutes' THEN 1 ELSE l.attempts + 1 END,
      window_start = CASE WHEN l.window_start <= now() - interval '15 minutes' THEN now() ELSE l.window_start END
      RETURNING attempts`, [key]);
    if (result.rows[0].attempts > 10) throw new HttpError(429, 'RATE_LIMITED', 'Too many attempts. Try again in 15 minutes.');
  }
  async platformAdmin<T>(token: string, work: (client: PoolClient, userId: string) => Promise<T>) {
    return this.authenticated(token, async (client, userId) => {
      const admin = await client.query('SELECT 1 FROM platform_admins WHERE user_id = $1', [userId]);
      if (!admin.rowCount) throw new HttpError(403, 'FORBIDDEN', 'Platform admin access is required.');
      return work(client, userId);
    });
  }
}
