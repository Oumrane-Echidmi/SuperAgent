import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';
import { simulateScenario, scenarioDefinitionSchema } from '../src/scenario-contracts.ts';
import { validateWorkflow } from '../src/workflow-compiler.ts';

// Releases the ready-made scenarios in backend/examples/scenarios as platform content.
// Usage: npm run scenarios:seed -- admin@example.com   (the user must already exist)
const email = process.argv[2];
if (!process.env.ADMIN_DATABASE_URL || !email) throw new Error('Usage: npm run scenarios:seed -- <platform-admin-email>');
const directory = new URL('../examples/scenarios/', import.meta.url);
const client = new pg.Client({ connectionString: process.env.ADMIN_DATABASE_URL });
await client.connect();
try {
  const user = await client.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (!user.rowCount) throw new Error('No user has that email. Register first.');
  const admin = await client.query('SELECT 1 FROM platform_admins WHERE user_id = $1', [user.rows[0].id]);
  if (!admin.rowCount) throw new Error('That user is not a platform admin. Run npm run admin:grant first.');
  for (const file of (await readdir(directory)).filter(name => name.endsWith('.json')).sort()) {
    const { id, definition } = JSON.parse(await readFile(new URL(file, directory), 'utf8')) as { id: string; definition: unknown };
    const parsed = scenarioDefinitionSchema.parse(definition);
    const validation = validateWorkflow(parsed.workflow);
    const simulation = simulateScenario(definition);
    if (!validation.valid || !simulation.valid) throw new Error(`${file} does not pass validation and simulation.`);
    await client.query('BEGIN');
    const existing = await client.query('SELECT 1 FROM scenario_releases WHERE scenario_id = $1', [id]);
    if (existing.rowCount) { await client.query('ROLLBACK'); console.log(`skipped ${parsed.name} (already released)`); continue; }
    await client.query('INSERT INTO scenarios(id, initial_definition, draft, created_by) VALUES ($1, $2, $2, $3) ON CONFLICT (id) DO NOTHING', [id, definition, user.rows[0].id]);
    await client.query('INSERT INTO scenario_releases(scenario_id, revision, definition, validation_report, simulation_report, created_by) VALUES ($1, 1, $2, $3, $4, $5)',
      [id, definition, validation, simulation, user.rows[0].id]);
    await client.query('COMMIT');
    console.log(`released ${parsed.name}`);
  }
} finally { await client.end(); }
