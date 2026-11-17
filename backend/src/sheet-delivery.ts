import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { Database, HttpError } from './database.ts';
import { requireGoogleOwner, useGoogleConnectionForActor } from './google-access.ts';
import { ownerSheetExecution } from './sheet-execution.ts';
import type { SheetExecution } from './sheet-execution.ts';
import type { GoogleConnectionConfig } from './google-oauth.ts';
import type { GoogleSheetsProvider, SpreadsheetInspection } from './google-sheets.ts';
import { codRowRange, inspectCodRows } from './sheet-delivery-contract.ts';

export type GoogleDeliveryProvider = Pick<GoogleSheetsProvider,'refresh'|'inspect'|'readRows'|'append'>;
interface Delivery {
  tenant_id: string; order_id: string; destination_id: string; expected_row: string[]; status: string; attempt_id: string|null;
  attempt_by: string|null; lease_valid: boolean|null; dispatched_at: Date|null; completed_at: Date|null; remote_range: string|null;
  evidence_kind: string|null; error_code: string|null; created_by: string; created_at: Date;
}
export async function loadSheetDelivery(client: PoolClient, tenantId: string, orderId: string, lock=false): Promise<Delivery> {
  const result=await client.query<Delivery>(`SELECT *,lease_until>clock_timestamp() AS lease_valid FROM sheet_deliveries WHERE tenant_id=$1 AND order_id=$2${lock?' FOR UPDATE':''}`,[tenantId,orderId]);
  if (!result.rowCount && lock) return loadSheetDelivery(client,tenantId,orderId);
  if (!result.rowCount) throw new HttpError(404,'NOT_FOUND','Sheet delivery not found.');
  return result.rows[0]!;
}
export const sheetDeliveryView=(d:Delivery)=>({ orderId:d.order_id,destinationId:d.destination_id,operationKey:d.expected_row[0],rowPreview:d.expected_row,
  status:!d.lease_valid&&d.status==='DISPATCHED'?'UNKNOWN':!d.lease_valid&&d.status==='PREPARING'?'READY':d.status,
  createdBy:d.created_by,createdAt:d.created_at,attemptBy:d.attempt_by,dispatchedAt:d.dispatched_at,completedAt:d.completed_at,
  remoteRange:d.remote_range,evidenceKind:d.evidence_kind,errorCode:d.error_code });
const stale=()=>new HttpError(409,'SHEET_DELIVERY_CHANGED','Reload the current delivery state.');
const unknown=()=>new HttpError(409,'SHEET_OUTCOME_UNKNOWN','The write may have happened. Reconcile it before any recovery.');
async function requireAttempt(client:PoolClient,tid:string,id:string,attempt:string,status:string) {
  const row=await loadSheetDelivery(client,tid,id,true);
  if(row.status!==status||row.attempt_id!==attempt||!row.lease_valid) throw stale();
}
function targetTab(inspection:SpreadsheetInspection,id:number) {
  const tab=inspection.tabs.find(tab=>tab.sheetId===id);
  if(!tab||tab.columnCount<12||tab.rowCount>1000) throw new HttpError(422,'SHEET_LAYOUT_UNSUPPORTED','Use a grid tab with at least 12 columns and at most 1000 rows.');
  return tab;
}
async function succeeded(client:PoolClient,tid:string,id:string,attempt:string,range:string,kind:'APPEND_ACK'|'ROW_OBSERVED') {
  const updated=await client.query(`UPDATE sheet_deliveries SET status='SUCCEEDED',lease_until=NULL,remote_range=$4,evidence_kind=$5,completed_at=clock_timestamp(),error_code=NULL,updated_at=clock_timestamp()
    WHERE tenant_id=$1 AND order_id=$2 AND attempt_id=$3 AND status IN ('PREPARING','DISPATCHED','UNKNOWN') RETURNING order_id`,[tid,id,attempt,range,kind]);
  if(!updated.rowCount) throw stale();
  return sheetDeliveryView(await loadSheetDelivery(client,tid,id));
}
export async function runSheetDeliveryForActor(actor:SheetExecution,config:GoogleConnectionConfig,provider:GoogleDeliveryProvider,tid:string,id:string,reconcile=false,attemptId?:string) {
  const claim=await actor.transaction(async(client,userId)=>{
    await requireGoogleOwner(client,tid); const row=await loadSheetDelivery(client,tid,id,true); const view=sheetDeliveryView(row);
    if(view.status==='SUCCEEDED') return {done:view};
    if(reconcile) {
      if(view.status!=='UNKNOWN') throw new HttpError(409,'SHEET_RECONCILIATION_UNAVAILABLE','Reconciliation requires an uncertain dispatched write.');
      await client.query("UPDATE sheet_deliveries SET status='UNKNOWN',lease_until=NULL WHERE tenant_id=$1 AND order_id=$2",[tid,id]);
    } else {
      if(view.status==='UNKNOWN') throw unknown();
      if(['DISPATCHED','PREPARING'].includes(view.status)) throw new HttpError(409,'SHEET_DELIVERY_BUSY','A delivery attempt is already in progress.');
      const attempt=attemptId??randomUUID();
      await client.query(`UPDATE sheet_deliveries SET status='PREPARING',attempt_id=$3,attempt_by=$4,lease_until=clock_timestamp()+interval '120 seconds',error_code=NULL,updated_at=clock_timestamp()
        WHERE tenant_id=$1 AND order_id=$2`,[tid,id,attempt,userId]);
      row.attempt_id=attempt;
    }
    const destination=await client.query('SELECT connection_id,spreadsheet_id,sheet_id FROM sheet_destinations WHERE tenant_id=$1 AND id=$2',[tid,row.destination_id]);
    if(!destination.rowCount) throw new HttpError(404,'NOT_FOUND','Destination not found.');
    return {row,destination:destination.rows[0] as {connection_id:string;spreadsheet_id:string;sheet_id:number}};
  });
  if('done' in claim) return claim.done;
  const {row,destination}=claim; let sent=false;
  try {
    return await useGoogleConnectionForActor(actor,config,provider,tid,destination.connection_id,destination.spreadsheet_id,async use=>{
      const tab=targetTab(use.inspection,destination.sheet_id); const target={spreadsheetId:destination.spreadsheet_id,tab:tab.title};
      const rows=await provider.readRows(use.accessToken,target,tab.rowCount);
      let observed:ReturnType<typeof inspectCodRows>;
      try {observed=inspectCodRows(rows,row.expected_row);} catch(error) {
        if(error instanceof Error&&error.message==='SHEET_LAYOUT')throw new HttpError(422,'SHEET_LAYOUT','Use one contiguous COD table under the headers.');
        throw new HttpError(422,'SHEET_HEADERS','Use the exact COD sheet headers in row 1.');
      }
      if(observed.kind==='CONFLICT') throw new HttpError(409,'SHEET_ROW_CONFLICT','The operation key has duplicate or changed sheet rows.');
      if(reconcile) {
        return use.transaction(async client=>{
          const current=await loadSheetDelivery(client,tid,id,true);
          if(current.status==='SUCCEEDED') return sheetDeliveryView(current);
          if(current.status!=='UNKNOWN'||current.attempt_id!==row.attempt_id) throw stale();
          if(observed.kind==='MATCH') return succeeded(client,tid,id,row.attempt_id!,codRowRange(tab.title,observed.row),'ROW_OBSERVED');
          await client.query("UPDATE sheet_deliveries SET error_code='ROW_NOT_OBSERVED',updated_at=clock_timestamp() WHERE tenant_id=$1 AND order_id=$2",[tid,id]);
          return sheetDeliveryView(await loadSheetDelivery(client,tid,id));
        });
      }
      if(observed.kind==='MATCH') return use.transaction(async client=>{
        await requireAttempt(client,tid,id,row.attempt_id!,'PREPARING');
        return succeeded(client,tid,id,row.attempt_id!,codRowRange(tab.title,observed.row),'ROW_OBSERVED');
      });
      await use.transaction(async client=>{
        await requireAttempt(client,tid,id,row.attempt_id!,'PREPARING');
        await client.query("UPDATE sheet_deliveries SET status='DISPATCHED',dispatched_at=clock_timestamp(),lease_until=clock_timestamp()+interval '120 seconds',updated_at=clock_timestamp() WHERE tenant_id=$1 AND order_id=$2",[tid,id]);
      });
      sent=true; const receipt=await provider.append(use.accessToken,target,row.expected_row);
      // A known acknowledgement is durable evidence even if local disconnect followed dispatch.
      return actor.transaction(async client=>{
        await requireGoogleOwner(client,tid); await requireAttempt(client,tid,id,row.attempt_id!,'DISPATCHED');
        return succeeded(client,tid,id,row.attempt_id!,receipt.updatedRange,'APPEND_ACK');
      });
    });
  } catch(error) {
    const code=error instanceof HttpError?error.code:'SHEET_CHECK_FAILED';
    await actor.transaction(async client=>{
      await requireGoogleOwner(client,tid);
      if(sent) await client.query("UPDATE sheet_deliveries SET status='UNKNOWN',lease_until=NULL,error_code='SHEET_OUTCOME_UNKNOWN',updated_at=clock_timestamp() WHERE tenant_id=$1 AND order_id=$2 AND attempt_id=$3 AND status='DISPATCHED'",[tid,id,row.attempt_id]);
      else if(!reconcile) await client.query("UPDATE sheet_deliveries SET status='BLOCKED',lease_until=NULL,error_code=$4,updated_at=clock_timestamp() WHERE tenant_id=$1 AND order_id=$2 AND attempt_id=$3 AND status='PREPARING'",[tid,id,row.attempt_id,code]);
    }).catch(()=>{});
    if(sent) throw unknown();
    if(error instanceof HttpError) throw error;
    throw new HttpError(502,'SHEET_CHECK_FAILED','The sheet could not be checked. No new append was dispatched.');
  }
}
export async function runSheetDelivery(db:Database,config:GoogleConnectionConfig,provider:GoogleDeliveryProvider,bearer:string,tid:string,id:string,reconcile=false) {
  return runSheetDeliveryForActor(ownerSheetExecution(db,bearer),config,provider,tid,id,reconcile);
}
