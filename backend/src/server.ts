import { createApp } from './app.ts';
import { Database } from './database.ts';
import { readGoogleConnectionConfig } from './google-oauth.ts';
import { readWhatsAppConfig } from './whatsapp.ts';
import { OpenAIWorkflowGenerator } from './workflow-generator.ts';
import { startWorkflowRunner } from './workflow-runtime.ts';
import { GraphApiSender, startOutboxSender } from './whatsapp-sender.ts';

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
  for (const table of ['sessions', 'platform_admins', 'scenarios', 'scenario_releases', 'scenario_audit', 'builder_drafts', 'draft_revisions', 'draft_simulations', 'draft_approvals', 'builder_match_requests', 'builder_chat_sessions', 'builder_chat_turns', 'builder_ai_quota', 'conversations', 'order_attempts', 'order_attempt_revisions', 'order_decision_receipts', 'orders', 'sheet_sync_requests', 'google_connections', 'sheet_destinations', 'sheet_deliveries', 'sheet_delivery_jobs', 'whatsapp_numbers', 'whatsapp_messages', 'workflow_publications', 'workflow_runs', 'workflow_run_steps', 'whatsapp_outbox', 'generated_workflows']) {
    await db.pool.query(`SELECT 1 FROM ${table} LIMIT 0`);
  }
} catch {
  await db.pool.end();
  throw new Error('Database startup checks failed. Check runtime credentials and apply migrations.');
}
const workflowGenerator = builderAiEnabled === 'true' && process.env.OPENAI_API_KEY && process.env.BUILDER_AI_MODEL
  ? new OpenAIWorkflowGenerator({ apiKey: process.env.OPENAI_API_KEY, model: process.env.BUILDER_AI_MODEL }) : undefined;
const server = createApp(db, { ...(workflowGenerator ? { workflowGenerator } : {}), builderAiEnabled: builderAiEnabled === 'true', sheetDeliveryEnabled:sheetDeliveryEnabled==='true', ...(google ? { google } : {}), ...(whatsapp ? { whatsapp } : {}) }).listen(port, '127.0.0.1', () => {
  console.log(`SuperAgent development API: http://127.0.0.1:${port}`);
});
const runner = process.env.WORKFLOW_RUNNER_ENABLED === 'true' ? startWorkflowRunner(db) : undefined;
const sender = process.env.WHATSAPP_ACCESS_TOKEN ? startOutboxSender(db, new GraphApiSender(process.env.WHATSAPP_ACCESS_TOKEN, process.env.WHATSAPP_API_VERSION || undefined)) : undefined;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(error => {
      void Promise.all([runner?.stop(), sender?.stop()]).then(() => db.pool.end()).then(() => { process.exitCode = error ? 1 : 0; });
    });
    setTimeout(() => { process.exit(1); }, 10_000).unref();
  });
}
