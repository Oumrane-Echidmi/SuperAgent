import { Router } from 'express';
import { z } from 'zod';
import { Database, HttpError } from './database.ts';
import { readBearerToken } from './auth.ts';
import { requireGoogleOwner } from './google-access.ts';
import type { GoogleConnectionConfig } from './google-oauth.ts';
import { GoogleSheetsProvider } from './google-sheets.ts';
import { buildCodSheetRow, COD_SHEET_HEADERS } from './sheet-delivery-contract.ts';
import { loadSheetDelivery, runSheetDelivery, sheetDeliveryView } from './sheet-delivery.ts';
import type { GoogleDeliveryProvider } from './sheet-delivery.ts';

function parse<T>(schema:z.ZodType<T>,input:unknown):T {
  const result=schema.safeParse(input); if(!result.success) throw new HttpError(422,'INVALID_INPUT','Check the request fields.'); return result.data;
}
export function sheetDeliveryRoutes(db:Database,enabled:boolean,config?:GoogleConnectionConfig,suppliedProvider?:GoogleDeliveryProvider) {
  const router=Router(); const path='/tenants/:tenantId/orders/:orderId/sheet-delivery';
  const provider=suppliedProvider??(config?new GoogleSheetsProvider({clientId:config.clientId,clientSecret:config.clientSecret}):undefined);
  router.use(path,(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.get(path,async(req,res)=>{
    const bearer=readBearerToken(req.headers.authorization),tid=parse(z.uuid(),req.params.tenantId),id=parse(z.uuid(),req.params.orderId);
    res.json(await db.authenticated(bearer,async client=>{await requireGoogleOwner(client,tid);return {...sheetDeliveryView(await loadSheetDelivery(client,tid,id)),headers:COD_SHEET_HEADERS};}));
  });
  router.post(path,async(req,res)=>{
    const bearer=readBearerToken(req.headers.authorization),tid=parse(z.uuid(),req.params.tenantId),id=parse(z.uuid(),req.params.orderId);
    const input=parse(z.strictObject({destinationId:z.uuid()}),req.body);
    const result=await db.authenticated(bearer,async(client,userId)=>{
      await requireGoogleOwner(client,tid);
      const existing=await client.query('SELECT destination_id FROM sheet_deliveries WHERE tenant_id=$1 AND order_id=$2',[tid,id]);
      if(existing.rowCount){
        if(existing.rows[0].destination_id!==input.destinationId)throw new HttpError(409,'SHEET_DESTINATION_PINNED','This order already has a pinned destination.');
        return {status:200,row:sheetDeliveryView(await loadSheetDelivery(client,tid,id))};
      }
      const intent=await client.query('SELECT payload FROM sheet_sync_requests WHERE tenant_id=$1 AND order_id=$2',[tid,id]);
      const destination=await client.query('SELECT 1 FROM sheet_destinations WHERE tenant_id=$1 AND id=$2',[tid,input.destinationId]);
      if(!intent.rowCount||!destination.rowCount)throw new HttpError(404,'NOT_FOUND','Order intent or destination not found.');
      const row=buildCodSheetRow(intent.rows[0].payload);
      const inserted=await client.query(`INSERT INTO sheet_deliveries(tenant_id,order_id,destination_id,expected_row,created_by) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (tenant_id,order_id) DO NOTHING RETURNING order_id`,[tid,id,input.destinationId,JSON.stringify(row),userId]);
      const current=await loadSheetDelivery(client,tid,id);
      if(current.destination_id!==input.destinationId)throw new HttpError(409,'SHEET_DESTINATION_PINNED','This order already has a pinned destination.');
      return {status:inserted.rowCount?201:200,row:sheetDeliveryView(current)};
    });res.status(result.status).json(result.row);
  });
  for(const action of ['dispatch','reconcile'] as const)router.post(path+'/'+action,async(req,res)=>{
    const bearer=readBearerToken(req.headers.authorization),tid=parse(z.uuid(),req.params.tenantId),id=parse(z.uuid(),req.params.orderId);parse(z.strictObject({}),req.body);
    const current=await db.authenticated(bearer,async client=>{await requireGoogleOwner(client,tid);return sheetDeliveryView(await loadSheetDelivery(client,tid,id));});
    if(current.status==='SUCCEEDED'){res.json(current);return;}
    if((action==='dispatch'&&!enabled)||!config||!provider)throw new HttpError(503,'SHEET_DELIVERY_DISABLED','Sheets delivery is not enabled.');
    res.json(await runSheetDelivery(db,config,provider,bearer,tid,id,action==='reconcile'));
  });
  return router;
}
