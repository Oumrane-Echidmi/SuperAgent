import pg from 'pg';

if (!process.env.ADMIN_DATABASE_URL) throw new Error('ADMIN_DATABASE_URL is required.');
const url = new URL(process.env.ADMIN_DATABASE_URL);
if (url.pathname !== '/superagent_test') throw new Error('Test setup requires the dedicated superagent_test database.');
url.pathname = '/postgres';
const client = new pg.Client({ connectionString: url.toString() });
try {
  await client.connect();
  const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = 'superagent_test'");
  if (!existing.rowCount) await client.query('CREATE DATABASE superagent_test');
  console.log('Dedicated test database is available.');
} finally { await client.end(); }
