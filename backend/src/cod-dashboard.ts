import { Router } from 'express';
import { z } from 'zod';
import { Database, HttpError } from './database.ts';
import { readBearerToken } from './auth.ts';
import { requireTenant } from './builder.ts';
import { parseCod } from './cod-routes.ts';

const date = z.iso.date().refine(value => !value.startsWith('0000-'));
const period = z.strictObject({ from: date, to: date }).refine(({ from, to }) => {
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
  return days >= 0 && days <= 365;
});
interface Counts { pending: number; confirmed: number; declined: number; confirmedOrderValueMinor: string; sheetSyncWaiting: number }
function outcome(row: Counts) { return { ...row, confirmationRate: row.confirmed + row.declined ? row.confirmed / (row.confirmed + row.declined) : null }; }
export function codDashboardRoutes(db: Database) {
  const router = Router();
  router.get('/tenants/:tenantId/dashboard/outcomes', async (req, res) => {
    const result = await db.authenticated(readBearerToken(req.headers.authorization), async client => {
      const tenantId = parseCod(z.uuid(), req.params.tenantId); await requireTenant(client, tenantId, false);
      const { from, to } = parseCod(period, req.query);
      const profile = await client.query('SELECT timezone FROM business_profiles WHERE tenant_id = $1', [tenantId]);
      if (!profile.rowCount) throw new HttpError(409, 'PROFILE_REQUIRED', 'Set the business timezone before viewing outcomes.');
      const timezone = profile.rows[0].timezone as string;
      const rows = await client.query<Counts & { date: string }>(`SELECT (a.started_at AT TIME ZONE $4)::date::text AS date,
        (count(*) FILTER (WHERE a.status = 'PENDING'))::integer AS pending,
        (count(*) FILTER (WHERE a.status = 'CONFIRMED'))::integer AS confirmed,
        (count(*) FILTER (WHERE a.status = 'DECLINED'))::integer AS declined,
        coalesce(sum(o.amount_minor) FILTER (WHERE a.status = 'CONFIRMED'), 0)::text AS "confirmedOrderValueMinor",
        (count(*) FILTER (WHERE s.status = 'AWAITING_CONNECTION' AND d.status IS DISTINCT FROM 'SUCCEEDED'))::integer AS "sheetSyncWaiting"
        FROM order_attempts a LEFT JOIN orders o ON o.tenant_id = a.tenant_id AND o.attempt_id = a.id
        LEFT JOIN sheet_sync_requests s ON s.tenant_id = o.tenant_id AND s.order_id = o.id
        LEFT JOIN sheet_deliveries d ON d.tenant_id=o.tenant_id AND d.order_id=o.id
        WHERE a.tenant_id = $1 AND a.started_at >= ($2::date::timestamp AT TIME ZONE $4)
          AND a.started_at < (($3::date + 1)::timestamp AT TIME ZONE $4)
        GROUP BY (a.started_at AT TIME ZONE $4)::date ORDER BY date`, [tenantId, from, to, timezone]);
      const totals = rows.rows.reduce<Counts>((total, row) => ({ pending: total.pending + row.pending, confirmed: total.confirmed + row.confirmed,
        declined: total.declined + row.declined, sheetSyncWaiting: total.sheetSyncWaiting + row.sheetSyncWaiting,
        confirmedOrderValueMinor: (BigInt(total.confirmedOrderValueMinor) + BigInt(row.confirmedOrderValueMinor)).toString() }),
      { pending: 0, confirmed: 0, declined: 0, confirmedOrderValueMinor: '0', sheetSyncWaiting: 0 });
      return { from, to, timezone, currency: 'MAD', totals: outcome(totals), days: rows.rows.map(row => ({ date: row.date, ...outcome(row) })) };
    });
    res.set('Cache-Control', 'no-store').json(result);
  });
  return router;
}
