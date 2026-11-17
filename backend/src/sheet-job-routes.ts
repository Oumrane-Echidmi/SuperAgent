import {Router} from 'express';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {Database,HttpError} from './database.ts';
import {readBearerToken} from './auth.ts';
import {requireGoogleOwner} from './google-access.ts';
import {loadSheetDelivery,sheetDeliveryView} from './sheet-delivery.ts';

const columns=`id,order_id AS "orderId",destination_id AS "destinationId",status,requested_by AS "requestedBy",created_at AS "createdAt",available_at AS "availableAt",claim_count AS "claimCount",completed_at AS "completedAt",error_code AS "errorCode"`;
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new HttpError(422,'INVALID_INPUT','Check the request fields.');return result.data;}
async function load(client:PoolClient,tid:string,id:string,lock=false){
  const result=await client.query(`SELECT ${columns} FROM sheet_delivery_jobs WHERE tenant_id=$1 AND id=$2${lock?' FOR UPDATE':''}`,[tid,id]);
  if(!result.rowCount&&lock)return load(client,tid,id);
  if(!result.rowCount)throw new HttpError(404,'NOT_FOUND','Delivery job not found.');return result.rows[0];
}
export function sheetJobRoutes(db:Database,enabled:boolean){
  const router=Router(),path='/tenants/:tenantId/orders/:orderId/sheet-delivery/jobs';
  router.use(path,(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.post(path,async(req,res)=>{
    const token=readBearerToken(req.headers.authorization),tid=parse(z.uuid(),req.params.tenantId),orderId=parse(z.uuid(),req.params.orderId),input=parse(z.strictObject({id:z.uuid()}),req.body);
    const result=await db.authenticated(token,async(client,userId)=>{
      await requireGoogleOwner(client,tid);
      const existing=await client.query('SELECT order_id FROM sheet_delivery_jobs WHERE tenant_id=$1 AND id=$2',[tid,input.id]);
      if(existing.rowCount){if(existing.rows[0].order_id!==orderId)throw new HttpError(409,'SHEET_JOB_ID_REUSED','Use a new job ID for another order.');return {status:200,row:await load(client,tid,input.id)};}
      if(!enabled)throw new HttpError(503,'SHEET_DELIVERY_DISABLED','Sheets delivery is not enabled.');
      const active=await client.query("SELECT id FROM sheet_delivery_jobs WHERE tenant_id=$1 AND order_id=$2 AND status IN ('QUEUED','RUNNING') FOR UPDATE",[tid,orderId]);
      if(active.rowCount){if(active.rows[0].id===input.id)return {status:200,row:await load(client,tid,input.id)};throw new HttpError(409,'SHEET_JOB_ACTIVE','This order already has an active delivery job.');}
      const delivery=await loadSheetDelivery(client,tid,orderId,true),view=sheetDeliveryView(delivery);
      if(!['READY','BLOCKED'].includes(view.status)||delivery.dispatched_at)throw new HttpError(409,'SHEET_JOB_UNAVAILABLE','Only an undispatched delivery can be queued.');
      const destination=await client.query(`SELECT d.connection_id FROM sheet_destinations d JOIN google_connections c ON c.tenant_id=d.tenant_id AND c.id=d.connection_id
        WHERE d.tenant_id=$1 AND d.id=$2 AND c.status='CONNECTED'`,[tid,delivery.destination_id]);
      if(!destination.rowCount)throw new HttpError(409,'GOOGLE_RECONNECT_REQUIRED','Reconnect Google before queueing delivery.');
      const inserted=await client.query(`INSERT INTO sheet_delivery_jobs(tenant_id,id,order_id,destination_id,connection_id,requested_by) VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT DO NOTHING RETURNING id`,[tid,input.id,orderId,delivery.destination_id,destination.rows[0].connection_id,userId]);
      if(!inserted.rowCount){const replay=await client.query('SELECT order_id FROM sheet_delivery_jobs WHERE tenant_id=$1 AND id=$2',[tid,input.id]);if(!replay.rowCount)throw new HttpError(409,'SHEET_JOB_ACTIVE','This order already has an active delivery job.');if(replay.rows[0].order_id!==orderId)throw new HttpError(409,'SHEET_JOB_ID_REUSED','Use a new job ID for another order.');}
      return {status:inserted.rowCount?201:200,row:await load(client,tid,input.id)};
    });res.status(result.status).json(result.row);
  });
  router.get(path,async(req,res)=>{
    const token=readBearerToken(req.headers.authorization),tid=parse(z.uuid(),req.params.tenantId),id=parse(z.uuid(),req.params.orderId),q=parse(z.strictObject({limit:z.coerce.number().int().min(1).max(100).default(20),offset:z.coerce.number().int().min(0).max(10000).default(0)}),req.query);
    const data=await db.authenticated(token,async client=>{await requireGoogleOwner(client,tid);return (await client.query(`SELECT ${columns} FROM sheet_delivery_jobs WHERE tenant_id=$1 AND order_id=$2 ORDER BY created_at DESC,id LIMIT $3 OFFSET $4`,[tid,id,q.limit,q.offset])).rows;});res.json({data,...q});
  });
  router.get(path+'/:id',async(req,res)=>{
    const token=readBearerToken(req.headers.authorization),tid=parse(z.uuid(),req.params.tenantId),id=parse(z.uuid(),req.params.id),orderId=parse(z.uuid(),req.params.orderId);
    const row=await db.authenticated(token,async client=>{await requireGoogleOwner(client,tid);return load(client,tid,id);});if(row.orderId!==orderId)throw new HttpError(404,'NOT_FOUND','Delivery job not found.');res.json(row);
  });
  router.delete(path+'/:id',async(req,res)=>{
    const token=readBearerToken(req.headers.authorization),tid=parse(z.uuid(),req.params.tenantId),id=parse(z.uuid(),req.params.id),orderId=parse(z.uuid(),req.params.orderId);
    const row=await db.authenticated(token,async client=>{
      await requireGoogleOwner(client,tid);const job=await load(client,tid,id,true);if(job.orderId!==orderId)throw new HttpError(404,'NOT_FOUND','Delivery job not found.');
      if(!['QUEUED','RUNNING'].includes(job.status))return job;
      const delivery=await loadSheetDelivery(client,tid,orderId,true);
      const lease=await client.query('SELECT lease_id FROM sheet_delivery_jobs WHERE tenant_id=$1 AND id=$2',[tid,id]);
      const ownsAttempt=job.status==='RUNNING'&&delivery.attempt_id===lease.rows[0].lease_id;
      if(ownsAttempt&&delivery.dispatched_at)throw new HttpError(409,'SHEET_JOB_ALREADY_DISPATCHED','An authorized dispatch cannot be recalled.');
      await client.query("UPDATE sheet_delivery_jobs SET status='CANCELLED',completed_at=clock_timestamp(),error_code=NULL WHERE tenant_id=$1 AND id=$2",[tid,id]);
      if(ownsAttempt&&delivery.status==='PREPARING')await client.query("UPDATE sheet_deliveries SET status='BLOCKED',lease_until=NULL,error_code='SHEET_JOB_CANCELLED' WHERE tenant_id=$1 AND order_id=$2",[tid,orderId]);
      return load(client,tid,id);
    });res.json(row);
  });return router;
}
