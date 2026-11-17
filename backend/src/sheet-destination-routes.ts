import { Router } from 'express';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { Database, HttpError } from './database.ts';
import { readBearerToken } from './auth.ts';
import { GoogleSheetsProvider, spreadsheetIdSchema } from './google-sheets.ts';
import type { GoogleConnectionConfig } from './google-oauth.ts';
import { inspectGoogleConnection, requireGoogleOwner } from './google-access.ts';
import type { GoogleSheetsAccess } from './google-access.ts';

const selectionSchema = z.strictObject({ id: z.uuid(), connectionId: z.uuid(), spreadsheetId: spreadsheetIdSchema, sheetId: z.number().int().min(0).max(2147483647) });
const publicColumns = `d.id,d.connection_id AS "connectionId",d.spreadsheet_id AS "spreadsheetId",d.sheet_id AS "sheetId",d.spreadsheet_title AS "spreadsheetTitle",
  d.tab_title AS "tabTitle",d.row_count AS "rowCount",d.column_count AS "columnCount",d.created_by AS "createdBy",d.checked_at AS "checkedAt",c.status AS "connectionStatus",
  CASE WHEN c.status='CONNECTED' THEN 'ACCESS_CHECKED' ELSE 'CONNECTION_UNAVAILABLE' END AS status`;
const from = 'FROM sheet_destinations d JOIN google_connections c ON c.tenant_id=d.tenant_id AND c.id=d.connection_id';
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new HttpError(422, 'INVALID_INPUT', 'Check the request fields.');
  return parsed.data;
}
async function load(client: PoolClient, tenantId: string, id: string) {
  return (await client.query(`SELECT ${publicColumns} ${from} WHERE d.tenant_id=$1 AND d.id=$2`, [tenantId, id])).rows[0];
}
function checkReplay(row: { connectionId: string; spreadsheetId: string; sheetId: number }, input: z.infer<typeof selectionSchema>) {
  if (row.connectionId !== input.connectionId || row.spreadsheetId !== input.spreadsheetId || row.sheetId !== input.sheetId) {
    throw new HttpError(409, 'DESTINATION_ID_REUSED', 'Use a new destination ID for a different selection.');
  }
}
export function sheetDestinationRoutes(db: Database, config?: GoogleConnectionConfig, suppliedProvider?: GoogleSheetsAccess) {
  const router = Router();
  const provider = suppliedProvider ?? (config ? new GoogleSheetsProvider({ clientId: config.clientId, clientSecret: config.clientSecret }) : undefined);
  const path = '/tenants/:tenantId/sheet-destinations';
  router.use(path, (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.post('/tenants/:tenantId/connections/google/:id/spreadsheet-inspections', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const bearer = readBearerToken(req.headers.authorization); const tenantId = parse(z.uuid(), req.params.tenantId); const id = parse(z.uuid(), req.params.id);
    const input = parse(z.strictObject({ spreadsheetId: spreadsheetIdSchema }), req.body);
    await db.authenticated(bearer, client => requireGoogleOwner(client, tenantId));
    if (!config || !provider) throw new HttpError(503, 'GOOGLE_DISABLED', 'Google connections are not enabled.');
    res.json(await inspectGoogleConnection(db, config, provider, bearer, tenantId, id, input.spreadsheetId, async (_client, inspection) => inspection));
  });
  router.post(path, async (req, res) => {
    const bearer = readBearerToken(req.headers.authorization); const tenantId = parse(z.uuid(), req.params.tenantId); const input = parse(selectionSchema, req.body);
    const existing = await db.authenticated(bearer, async client => { await requireGoogleOwner(client, tenantId); return load(client, tenantId, input.id); });
    if (existing) { checkReplay(existing, input); res.json(existing); return; }
    if (!config || !provider) throw new HttpError(503, 'GOOGLE_DISABLED', 'Google connections are not enabled.');
    const result = await inspectGoogleConnection(db, config, provider, bearer, tenantId, input.connectionId, input.spreadsheetId, async (client, inspection, userId) => {
      const tab = inspection.tabs.find(tab => tab.sheetId === input.sheetId);
      if (!tab) throw new HttpError(422, 'SHEET_TAB_UNAVAILABLE', 'Select a grid tab from the checked spreadsheet.');
      const inserted = await client.query(`INSERT INTO sheet_destinations(tenant_id,id,connection_id,spreadsheet_id,sheet_id,spreadsheet_title,tab_title,row_count,column_count,created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (tenant_id,id) DO NOTHING RETURNING id`,
      [tenantId, input.id, input.connectionId, inspection.spreadsheetId, tab.sheetId, inspection.title, tab.title, tab.rowCount, tab.columnCount, userId]);
      const row = await load(client, tenantId, input.id); checkReplay(row, input);
      return { status: inserted.rowCount ? 201 : 200, row };
    });
    res.status(result.status).json(result.row);
  });
  router.get(path, async (req, res) => {
    const bearer = readBearerToken(req.headers.authorization); const tenantId = parse(z.uuid(), req.params.tenantId);
    const query = parse(z.strictObject({ limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).max(10000).default(0) }), req.query);
    const data = await db.authenticated(bearer, async client => {
      await requireGoogleOwner(client, tenantId);
      return (await client.query(`SELECT ${publicColumns} ${from} WHERE d.tenant_id=$1 ORDER BY d.checked_at DESC,d.id LIMIT $2 OFFSET $3`, [tenantId, query.limit, query.offset])).rows;
    });
    res.json({ data, ...query });
  });
  router.get(path + '/:id', async (req, res) => {
    const bearer = readBearerToken(req.headers.authorization); const tenantId = parse(z.uuid(), req.params.tenantId); const id = parse(z.uuid(), req.params.id);
    const row = await db.authenticated(bearer, async client => { await requireGoogleOwner(client, tenantId); return load(client, tenantId, id); });
    if (!row) throw new HttpError(404, 'NOT_FOUND', 'Destination not found.');
    res.json(row);
  });
  return router;
}
