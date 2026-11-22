import { setTimeout } from 'node:timers/promises';
import { Database } from './database.ts';
import { OpenAIBuilderProvider, readBuilderWorkerConfig } from './openai-builder.ts';
import { processBuilderTurn } from './builder-chat-worker.ts';

const config = readBuilderWorkerConfig(process.env);
const db = new Database(config.connectionString);
const stop = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { stop.abort(); });
try {
  await db.checkRuntimeRole();
  await db.pool.query('SELECT consent_to_mcp FROM builder_chat_sessions LIMIT 0');
  await db.pool.query('SELECT requested_model FROM builder_chat_turns LIMIT 0');
  const role = await db.pool.query('SELECT current_user AS name');
  if (role.rows[0].name !== 'superagent_builder_worker') throw new Error('Use the dedicated Builder worker database login.');
  const provider = new OpenAIBuilderProvider(config);
  console.log('Builder worker ready.');
  while (!stop.signal.aborted) {
    try {
      const processed = await processBuilderTurn(db, provider, stop.signal);
      if (!processed) await setTimeout(1000, undefined, { signal: stop.signal });
    } catch {
      if (!stop.signal.aborted) {
        console.error('Builder worker could not process work.');
        await setTimeout(1000, undefined, { signal: stop.signal }).catch(() => {});
      }
    }
  }
} finally { await db.pool.end(); }
