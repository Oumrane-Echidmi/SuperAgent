import { createApp } from './app.ts';
import { Database } from './database.ts';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Apply migrations before starting the API.');
const db = new Database(process.env.DATABASE_URL);
try {
  await db.checkRuntimeRole();
  await db.pool.query('SELECT 1 FROM sessions, platform_admins, scenarios, scenario_releases, scenario_audit, builder_drafts, draft_revisions, draft_simulations, draft_approvals, builder_match_requests LIMIT 0');
} catch {
  await db.pool.end();
  throw new Error('Database startup checks failed. Check runtime credentials and apply migrations.');
}
const server = createApp(db).listen(port, '127.0.0.1', () => {
  console.log(`SuperAgent development API: http://127.0.0.1:${port}`);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(error => {
      void db.pool.end().then(() => { process.exitCode = error ? 1 : 0; });
    });
    setTimeout(() => { process.exit(1); }, 10_000).unref();
  });
}
