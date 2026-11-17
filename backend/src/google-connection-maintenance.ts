import type { PoolClient } from 'pg';

/** Privileged maintenance only. Execute in a transaction and configure backup retention separately. */
export async function cleanupGoogleConnections(client: Pick<PoolClient, 'query'>) {
  const expired = await client.query(`UPDATE google_connections SET status='FAILED',state_hash=NULL,verifier_envelope=NULL,updated_at=clock_timestamp()
    WHERE status IN ('AUTHORIZING','EXCHANGING') AND expires_at<=clock_timestamp()`);
  const removed = await client.query(`DELETE FROM google_connections c WHERE status IN ('FAILED','DISCONNECTED') AND updated_at<now()-interval '30 days'
    AND NOT EXISTS (SELECT 1 FROM sheet_destinations d WHERE d.tenant_id=c.tenant_id AND d.connection_id=c.id)`);
  return { expired: expired.rowCount ?? 0, removed: removed.rowCount ?? 0 };
}
