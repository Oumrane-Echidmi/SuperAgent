import pg from 'pg';
import { cleanupGoogleConnections } from '../src/google-connection-maintenance.ts';

if (!process.env.ADMIN_DATABASE_URL) throw new Error('ADMIN_DATABASE_URL is required for Google connection retention maintenance.');
const client = new pg.Client({ connectionString: process.env.ADMIN_DATABASE_URL });
try {
  await client.connect(); await client.query('BEGIN');
  const result = await cleanupGoogleConnections(client);
  await client.query('COMMIT');
  console.log(`Expired ${result.expired} Google authorization attempts; removed ${result.removed} old terminal connections.`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => {}); throw error;
} finally { await client.end(); }
