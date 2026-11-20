import { createApp } from './app.ts';
import { Database } from './database.ts';
import { readGoogleConnectionConfig } from './google-oauth.ts';
import { readWhatsAppConfig } from './whatsapp.ts';
import { startWorkflowRunner } from './workflow-runtime.ts';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Apply migrations before starting the API.');
const google = readGoogleConnectionConfig(process.env);
const whatsapp = readWhatsAppConfig(process.env);
const sheetDeliveryEnabled=process.env.SHEETS_DELIVERY_ENABLED??'false';
if(!['true','false'].includes(sheetDeliveryEnabled)||sheetDeliveryEnabled==='true'&&!google)throw new Error('SHEETS_DELIVERY_ENABLED requires valid enabled Google connection configuration.');
const db = new Database(process.env.DATABASE_URL);
const builderAiEnabled = process.env.BUILDER_AI_ENABLED ?? 'false';
if (!['true', 'false'].includes(builderAiEnabled)) throw new Error('BUILDER_AI_ENABLED must be true or false.');
try {
  await db.checkRuntimeRole();
  for (const table of ['sessions', 'platform_admins', 'scenarios', 'scenario_releases', 'scenario_audit', 'builder_drafts', 'draft_revisions', 'draft_simulations', 'draft_approvals', 'builder_match_requests', 'builder_chat_sessions', 'builder_chat_turns', 'builder_ai_quota', 'conversations', 'order_attempts', 'order_attempt_revisions', 'order_decision_receipts', 'orders', 'sheet_sync_requests', 'google_connections', 'sheet_destinations', 'sheet_deliveries', 'sheet_delivery_jobs', 'whatsapp_numbers', 'whatsapp_messages', 'workflow_publications', 'workflow_runs', 'workflow_run_steps']) {
    await db.pool.query(`SELECT 1 FROM ${table} LIMIT 0`);
  }
} catch {
  await db.pool.end();
  throw new Error('Database startup checks failed. Check runtime credentials and apply migrations.');
}
const server = createApp(db, { builderAiEnabled: builderAiEnabled === 'true', sheetDeliveryEnabled:sheetDeliveryEnabled==='true', ...(google ? { google } : {}), ...(whatsapp ? { whatsapp } : {}) }).listen(port, '127.0.0.1', () => {
  console.log(`SuperAgent development API: http://127.0.0.1:${port}`);
});
const runner = process.env.WORKFLOW_RUNNER_ENABLED === 'true' ? startWorkflowRunner(db) : undefined;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(error => {
      void (runner?.stop() ?? Promise.resolve()).then(() => db.pool.end()).then(() => { process.exitCode = error ? 1 : 0; });
    });
    setTimeout(() => { process.exit(1); }, 10_000).unref();
  });
}
