import pg from 'pg';

if (!process.env.ADMIN_DATABASE_URL) throw new Error('ADMIN_DATABASE_URL is required for retention maintenance.');
const client = new pg.Client({ connectionString: process.env.ADMIN_DATABASE_URL });
try {
  await client.connect();
  const result = await client.query("DELETE FROM builder_match_requests WHERE created_at < now() - interval '30 days'");
  console.log(`Removed ${result.rowCount} expired Builder matching requests.`);
} finally { await client.end(); }
