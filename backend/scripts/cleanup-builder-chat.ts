import pg from 'pg';

if (!process.env.ADMIN_DATABASE_URL) throw new Error('ADMIN_DATABASE_URL is required for chat retention maintenance.');
const client = new pg.Client({ connectionString: process.env.ADMIN_DATABASE_URL });
try {
  await client.connect(); await client.query('BEGIN');
  const sessions = await client.query("DELETE FROM builder_chat_sessions WHERE created_at < now() - interval '30 days'");
  await client.query("DELETE FROM builder_ai_quota WHERE day < (now() AT TIME ZONE 'UTC')::date - 30");
  await client.query('COMMIT');
  console.log(`Removed ${sessions.rowCount} expired Builder chat sessions.`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => {}); throw error;
} finally { await client.end(); }
