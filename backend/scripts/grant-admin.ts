import pg from 'pg';
import { z } from 'zod';

const userId = z.uuid().parse(process.argv[2]);
if (!process.env.ADMIN_DATABASE_URL) throw new Error('ADMIN_DATABASE_URL is required.');
const client = new pg.Client({ connectionString: process.env.ADMIN_DATABASE_URL });
try {
  await client.connect();
  await client.query('INSERT INTO platform_admins(user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
  console.log(`Platform admin access granted to user ${userId}.`);
} finally { await client.end(); }
