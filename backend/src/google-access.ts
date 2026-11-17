import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { Database, HttpError } from './database.ts';
import { GoogleFailure } from './google-sheets.ts';
import type { GoogleSheetsProvider, SpreadsheetInspection } from './google-sheets.ts';
import type { GoogleConnectionConfig } from './google-oauth.ts';
import { GOOGLE_FILE_SCOPE } from './google-oauth.ts';

export type GoogleSheetsAccess = Pick<GoogleSheetsProvider, 'refresh' | 'inspect'>;
export async function requireGoogleOwner(client: PoolClient, tenantId: string) {
  const member = await client.query('SELECT role FROM memberships WHERE tenant_id=$1', [tenantId]);
  if (!member.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Connection not found.');
  if (member.rows[0].role !== 'OWNER') throw new HttpError(403, 'FORBIDDEN', 'Only an owner can manage connections.');
}
const changed = () => new HttpError(409, 'GOOGLE_CONNECTION_CHANGED', 'The connection changed. Check its status before trying again.');

export interface GoogleConnectionUse {
  accessToken: string;
  inspection: SpreadsheetInspection;
  transaction<T>(work: (client: PoolClient, userId: string) => Promise<T>): Promise<T>;
}
/** SQL-only callbacks for transaction; provider HTTP must run outside them. */
export async function useGoogleConnection<T>(db: Database, config: GoogleConnectionConfig, provider: GoogleSheetsAccess,
  bearer: string, tenantId: string, connectionId: string, spreadsheetId: string,
  work: (use: GoogleConnectionUse) => Promise<T>): Promise<T> {
  const lease = randomUUID();
  const secret = await db.authenticated(bearer, async client => {
    await requireGoogleOwner(client, tenantId);
    const row = await client.query(`SELECT status,credential_envelope,scopes,oauth_client_id,access_lease_until>clock_timestamp() AS busy,
      inspection_count,inspection_window<=clock_timestamp()-interval '15 minutes' AS reset FROM google_connections WHERE tenant_id=$1 AND id=$2 FOR UPDATE`, [tenantId, connectionId]);
    if (!row.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Connection not found.');
    const connection = row.rows[0];
    if (connection.status !== 'CONNECTED' || connection.oauth_client_id !== config.clientId || !connection.scopes.includes(GOOGLE_FILE_SCOPE)) {
      throw new HttpError(409, 'GOOGLE_RECONNECT_REQUIRED', 'Reconnect Google before selecting a destination.');
    }
    if (connection.busy) throw new HttpError(409, 'GOOGLE_BUSY', 'Another check is using this connection. Try again shortly.');
    if (!connection.reset && connection.inspection_count >= 20) throw new HttpError(429, 'RATE_LIMITED', 'Try checking the spreadsheet again in 15 minutes.');
    const refresh = config.vault.open(connection.credential_envelope, { tenantId, connectionId, provider: 'google' });
    await client.query(`UPDATE google_connections SET access_lease_id=$3,access_lease_until=clock_timestamp()+interval '120 seconds',
      inspection_count=CASE WHEN $4 THEN 1 ELSE inspection_count+1 END,inspection_window=CASE WHEN $4 THEN clock_timestamp() ELSE inspection_window END WHERE tenant_id=$1 AND id=$2`, [tenantId, connectionId, lease, connection.reset]);
    return refresh;
  });
  const requireLease = async (client: PoolClient) => {
    await requireGoogleOwner(client, tenantId);
    const row = await client.query(`SELECT 1 FROM google_connections WHERE tenant_id=$1 AND id=$2 AND status='CONNECTED'
      AND access_lease_id=$3 AND access_lease_until>clock_timestamp() FOR UPDATE`, [tenantId, connectionId, lease]);
    if (!row.rowCount) throw changed();
  };
  try {
    let access: Awaited<ReturnType<GoogleSheetsAccess['refresh']>>;
    try { access = await provider.refresh(secret); }
    catch (error) {
      if (error instanceof GoogleFailure && error.code === 'AUTHORIZATION_FAILED') throw new HttpError(409, 'GOOGLE_RECONNECT_REQUIRED', 'Reconnect Google before selecting a destination.');
      throw new HttpError(502, 'GOOGLE_CHECK_FAILED', 'Google could not check this spreadsheet. Try again later.');
    }
    // Recheck after refresh and persist a rotated credential before any subsequent read can fail.
    await db.authenticated(bearer, async client => {
      await requireLease(client);
      if (access.refreshToken) {
        const envelope = config.vault.seal(access.refreshToken, { tenantId, connectionId, provider: 'google' });
        await client.query('UPDATE google_connections SET credential_envelope=$3 WHERE tenant_id=$1 AND id=$2', [tenantId, connectionId, JSON.stringify(envelope)]);
      }
    });
    let inspection: SpreadsheetInspection;
    try { inspection = await provider.inspect(access.accessToken, spreadsheetId); }
    catch (error) {
      if (error instanceof GoogleFailure && ['AUTHORIZATION_FAILED','REQUEST_REJECTED'].includes(error.code)) {
        throw new HttpError(403, 'SPREADSHEET_UNAVAILABLE', 'Choose an editable spreadsheet accessible through this connection.');
      }
      throw new HttpError(502, 'GOOGLE_CHECK_FAILED', 'Google could not check this spreadsheet. Try again later.');
    }
    return await work({ accessToken: access.accessToken, inspection,
      transaction: callback => db.authenticated(bearer, async (client, userId) => { await requireLease(client); return callback(client, userId); }) });
  } finally {
    // A revoked session/ownership can prevent cleanup; the bounded lease then expires naturally.
    await db.authenticated(bearer, client => client.query('UPDATE google_connections SET access_lease_id=NULL,access_lease_until=NULL WHERE tenant_id=$1 AND id=$2 AND access_lease_id=$3', [tenantId, connectionId, lease])).catch(() => {});
  }
}
export async function inspectGoogleConnection<T>(db: Database, config: GoogleConnectionConfig, provider: GoogleSheetsAccess,
  bearer: string, tenantId: string, connectionId: string, spreadsheetId: string,
  save: (client: PoolClient, inspection: SpreadsheetInspection, userId: string) => Promise<T>): Promise<T> {
  return useGoogleConnection(db, config, provider, bearer, tenantId, connectionId, spreadsheetId,
    use => use.transaction((client,userId) => save(client,use.inspection,userId)));
}
