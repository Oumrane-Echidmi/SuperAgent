import {randomUUID} from 'node:crypto';
import {Database,HttpError} from './database.ts';
import {requireGoogleOwner} from './google-access.ts';
import type {GoogleConnectionConfig} from './google-oauth.ts';
import type {SheetExecution} from './sheet-execution.ts';
import {loadSheetDelivery,runSheetDeliveryForActor} from './sheet-delivery.ts';
import type {GoogleDeliveryProvider} from './sheet-delivery.ts';

interface Job {tenant_id:string;id:string;order_id:string;requested_by:string;lease_id:string;claim_count:number;recovered:boolean;limited:boolean}
function execution(db:Database,job:Job):SheetExecution{
  return {transaction:work=>db.transaction(async client=>{
    const current=await client.query(`SELECT 1 FROM sheet_delivery_jobs WHERE tenant_id=$1 AND id=$2 AND status='RUNNING' AND lease_id=$3 AND lease_until>clock_timestamp() FOR SHARE`,[job.tenant_id,job.id,job.lease_id]);
    if(!current.rowCount)throw new HttpError(409,'SHEET_JOB_CHANGED','The delivery job is no longer active.');
    await client.query("SELECT set_config('app.user_id',$1,true),set_config('app.sheet_job_id',$2,true),set_config('app.sheet_job_lease',$3,true)",[job.requested_by,job.id,job.lease_id]);
    await requireGoogleOwner(client,job.tenant_id);
    return work(client,job.requested_by);
  })};
}
export async function processSheetJob(db:Database,config:GoogleConnectionConfig,provider:GoogleDeliveryProvider):Promise<boolean>{
  const role=await db.pool.query('SELECT current_user AS name');
  if(role.rows[0].name!=='superagent_sheet_worker')throw new Error('Use the dedicated Sheets worker database login.');
  const job=await db.transaction(async client=>{
    const candidate=await client.query(`SELECT tenant_id,id,order_id,connection_id,requested_by,claim_count,status='RUNNING' AS recovered FROM sheet_delivery_jobs j
      WHERE ((status='QUEUED' AND available_at<=clock_timestamp()) OR (status='RUNNING' AND lease_until<=clock_timestamp()))
      AND NOT EXISTS(SELECT 1 FROM sheet_delivery_jobs active WHERE active.tenant_id=j.tenant_id AND active.connection_id=j.connection_id
        AND active.id<>j.id AND active.status='RUNNING' AND active.lease_until>clock_timestamp())
      ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1`);
    if(!candidate.rowCount)return null;
    const row=candidate.rows[0];
    const lock=await client.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,73910211)) AS locked',[`${row.tenant_id}:${row.connection_id}`]);
    if(!lock.rows[0].locked)return null;
    const active=await client.query("SELECT 1 FROM sheet_delivery_jobs WHERE tenant_id=$1 AND connection_id=$2 AND id<>$3 AND status='RUNNING' AND lease_until>clock_timestamp()",[row.tenant_id,row.connection_id,row.id]);
    if(active.rowCount)return null;
    const lease=randomUUID();
    await client.query("UPDATE sheet_delivery_jobs SET status='RUNNING',lease_id=$3,lease_until=clock_timestamp()+interval '180 seconds',claim_count=least(claim_count+1,3) WHERE tenant_id=$1 AND id=$2",[row.tenant_id,row.id,lease]);
    return {...row,lease_id:lease,limited:row.claim_count>=3} as Job;
  });
  if(!job)return false;
  let status:'SUCCEEDED'|'BLOCKED'|'UNKNOWN'|'QUEUED'='BLOCKED',errorCode:string|null=null,delay=2;
  const actor=execution(db,job);
  try{
    const before=await actor.transaction(client=>loadSheetDelivery(client,job.tenant_id,job.order_id));
    if(before.status==='SUCCEEDED')status='SUCCEEDED';
    else if(before.dispatched_at)status='UNKNOWN';
    else if(job.limited){status='BLOCKED';errorCode='WORKER_RECOVERY_LIMIT';}
    else if(job.recovered&&before.status==='BLOCKED'){status='BLOCKED';errorCode=before.error_code??'SHEET_PREFLIGHT_BLOCKED';}
    else{
      // Admission avoids consuming a preparation attempt for ordinary connection contention/quota.
      const admission=await actor.transaction(client=>client.query(`SELECT c.access_lease_until>clock_timestamp() AS busy,
        c.inspection_count>=20 AND c.inspection_window>clock_timestamp()-interval '15 minutes' AS quota
        FROM sheet_destinations d JOIN google_connections c ON c.tenant_id=d.tenant_id AND c.id=d.connection_id WHERE d.tenant_id=$1 AND d.id=$2`,[job.tenant_id,before.destination_id]));
      if(admission.rows[0]?.busy)throw new HttpError(409,'GOOGLE_BUSY','Connection is busy.');
      if(admission.rows[0]?.quota)throw new HttpError(429,'RATE_LIMITED','Connection quota is exhausted.');
      const result=await runSheetDeliveryForActor(actor,config,provider,job.tenant_id,job.order_id,false,job.lease_id);
      status=result?.status==='SUCCEEDED'?'SUCCEEDED':'BLOCKED';
    }
  }catch(error){
    errorCode=error instanceof HttpError?error.code:'SHEET_WORKER_FAILED';
    status=errorCode==='SHEET_OUTCOME_UNKNOWN'?'UNKNOWN':'BLOCKED';
    // Reclassify from durable evidence if a worker error followed a committed dispatch.
    try{
      const row=await actor.transaction(client=>loadSheetDelivery(client,job.tenant_id,job.order_id));
      if(row.status==='SUCCEEDED')status='SUCCEEDED';else if(row.dispatched_at)status='UNKNOWN';
      else if(!job.limited&&['GOOGLE_BUSY','RATE_LIMITED'].includes(errorCode)){status='QUEUED';delay=errorCode==='RATE_LIMITED'?900:2;}
    }catch{}
  }
  await db.transaction(client=>client.query(`UPDATE sheet_delivery_jobs SET status=$4,completed_at=CASE WHEN $4='QUEUED' THEN NULL ELSE clock_timestamp() END,error_code=$5,
    available_at=CASE WHEN $4='QUEUED' THEN clock_timestamp()+$6*interval '1 second' ELSE available_at END,
    claim_count=CASE WHEN $4='QUEUED' THEN $7 ELSE claim_count END
    WHERE tenant_id=$1 AND id=$2 AND lease_id=$3 AND status='RUNNING' AND lease_until>clock_timestamp()`,[job.tenant_id,job.id,job.lease_id,status,status==='SUCCEEDED'?null:errorCode,delay,job.claim_count]));
  return true;
}
