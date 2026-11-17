import { readFile } from 'node:fs/promises';
import pg from 'pg';

if (!process.env.ADMIN_DATABASE_URL || !process.env.APP_DATABASE_PASSWORD) {
  throw new Error('ADMIN_DATABASE_URL and APP_DATABASE_PASSWORD are required.');
}
const client = new pg.Client({ connectionString: process.env.ADMIN_DATABASE_URL });
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(73910201)");
  await client.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'superagent_app') THEN
      CREATE ROLE superagent_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    END IF;
  END $$`);
  await client.query(`ALTER ROLE superagent_app PASSWORD ${pg.escapeLiteral(process.env.APP_DATABASE_PASSWORD)}`);
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const migration = '001_identity.sql';
  const existing = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [migration]);
  if (!existing.rowCount) {
    await client.query(await readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
    await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [migration]);
  }
  await client.query('COMMIT');
  console.log('Database migrations applied.');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await client.end();
}
