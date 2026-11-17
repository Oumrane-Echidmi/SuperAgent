import { Database } from '../src/database.ts';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const db = new Database(process.env.DATABASE_URL);
try {
  await db.checkRuntimeRole();
  await db.pool.query('DELETE FROM sessions WHERE expires_at <= now()');
  await db.pool.query("DELETE FROM auth_limits WHERE window_start <= now() - interval '15 minutes'");
  console.log('Expired sessions and authentication counters removed.');
} finally { await db.pool.end(); }
