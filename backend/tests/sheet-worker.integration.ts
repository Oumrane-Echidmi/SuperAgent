import assert from 'node:assert/strict';
import test from 'node:test';
import {randomBytes,randomUUID} from 'node:crypto';
import {once} from 'node:events';
import pg from 'pg';
import {Database,hashToken} from '../src/database.ts';
import {createApp} from '../src/app.ts';
import {CredentialVault} from '../src/credentials.ts';
import {GOOGLE_FILE_SCOPE} from '../src/google-oauth.ts';
import {COD_SHEET_HEADERS} from '../src/sheet-delivery-contract.ts';
import {GoogleFailure} from '../src/google-sheets.ts';
import type {GoogleDeliveryProvider} from '../src/sheet-delivery.ts';
import {processSheetJob} from '../src/sheet-job-worker.ts';

for(const key of ['DATABASE_URL','ADMIN_DATABASE_URL','SHEETS_WORKER_DATABASE_URL']){
  if(!process.env[key]||new URL(process.env[key]!).pathname!=='/superagent_test')throw new Error('Dedicated test database required.');
}
test('opt-in queued Sheets delivery isolates worker privileges and fences cancellation, recovery and owner revocation',async()=>{
  const db=new Database(process.env.DATABASE_URL!),worker=new Database(process.env.SHEETS_WORKER_DATABASE_URL!),admin=new pg.Pool({connectionString:process.env.ADMIN_DATABASE_URL});
  const users=[randomUUID(),randomUUID(),randomUUID()],tenants=[randomUUID(),randomUUID()],tokens=users.map(()=>randomBytes(32).toString('base64url'));
  const connection=randomUUID(),destination=randomUUID(),vault=new CredentialVault('key',{key:randomBytes(32).toString('base64')});
  const config={clientId:'client',clientSecret:'secret',redirectUri:'https://app.example.test/callback',vault};
  let rows:(string|number|boolean)[][]=[[...COD_SHEET_HEADERS]],appends=0,mode='ok';let release:(()=>void)|undefined;
  const provider:GoogleDeliveryProvider={
    async refresh(){return {accessToken:'access',expiresIn:3600};},
    async inspect(){return {spreadsheetId:'sheet-123',title:'Orders',tabs:[{sheetId:0,title:'Orders',rowCount:1000,columnCount:26}]};},
    async readRows(){if(mode==='read-wait')await new Promise<void>(resolve=>{release=resolve;});return structuredClone(rows);},
    async append(_token,_target,row){appends++;rows.push([...row]);if(mode==='lost')throw new GoogleFailure('OUTCOME_UNKNOWN');if(mode==='write-wait')await new Promise<void>(resolve=>{release=resolve;});return {updatedRange:`Orders!A${rows.length}:L${rows.length}`};},
  };
  async function wait(){for(let i=0;!release&&i<200;i++)await new Promise(resolve=>setTimeout(resolve,10));assert.ok(release);}
  function resume(){assert.ok(release);release();release=undefined;}
  const server=createApp(db,{google:config,sheetDeliveryEnabled:true,googleDelivery:provider}).listen(0,'127.0.0.1');await once(server,'listening');
  const address=server.address();assert.ok(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}/v1`,root=`/tenants/${tenants[0]}`;
  async function request(path:string,method='GET',body?:unknown,bearer=tokens[0]!){const response=await fetch(base+path,{method,headers:{Authorization:`Bearer ${bearer}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json()};}
  const jobs=(id:string)=>`${root}/orders/${id}/sheet-delivery/jobs`;
  async function order(){const id=randomUUID(),conversationId=randomUUID();assert.equal((await request(root+'/conversations','POST',{id:conversationId,customerReference:id,language:'fr'})).status,201);
    const draft=await request(root+'/order-attempts','POST',{id,conversationId,details:{item:'Article',quantity:1,recipient:'Client',phone:'+212612345678',address:'Casablanca',unitAmountMinor:10000,deliveryAmountMinor:0}});
    assert.equal((await request(root+`/order-attempts/${id}/decisions`,'POST',{id:randomUUID(),expectedRevision:1,summaryHash:draft.body.summaryHash,decision:'CONFIRM',evidence:'Confirmed by phone.'})).status,201);
    assert.equal((await request(root+`/orders/${id}/sheet-delivery`,'POST',{destinationId:destination})).status,201);return id;}
  const enqueue=(id:string,job=randomUUID())=>request(jobs(id),'POST',{id:job});
  try{
    await worker.checkRuntimeRole();await assert.rejects(processSheetJob(db,config,provider),/dedicated Sheets worker/);
    for(let i=0;i<users.length;i++){
      await admin.query('INSERT INTO users(id,email,password_hash) VALUES ($1,$2,$3)',[users[i],`${users[i]}@example.test`,'worker-fixture']);
      await admin.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '1 hour')",[hashToken(tokens[i]!),users[i]]);
      if(i<tenants.length){await admin.query('INSERT INTO tenants(id,name,created_by) VALUES ($1,$2,$3)',[tenants[i],'Sheet worker shop',users[i]]);await admin.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES ($1,$2,'OWNER')",[tenants[i],users[i]]);}
    }
    await admin.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES ($1,$2,'STAFF')",[tenants[0],users[2]]);
    await admin.query(`INSERT INTO google_connections(tenant_id,id,created_by,oauth_client_id,redirect_uri,status,credential_envelope,scopes,connected_at) VALUES ($1,$2,$3,'client',$4,'CONNECTED',$5,$6,now())`,[tenants[0],connection,users[0],config.redirectUri,JSON.stringify(vault.seal('refresh',{tenantId:tenants[0]!,connectionId:connection,provider:'google'})),[GOOGLE_FILE_SCOPE]]);
    await admin.query(`INSERT INTO sheet_destinations(tenant_id,id,connection_id,spreadsheet_id,sheet_id,spreadsheet_title,tab_title,row_count,column_count,created_by) VALUES ($1,$2,$3,'sheet-123',0,'Orders','Orders',1000,26,$4)`,[tenants[0],destination,connection,users[0]]);
    const first=await order();assert.equal(await processSheetJob(worker,config,provider),false);assert.equal(appends,0);
    assert.equal((await worker.pool.query('SELECT expected_row FROM sheet_deliveries')).rowCount,0);
    assert.equal((await worker.pool.query('SELECT credential_envelope FROM google_connections')).rowCount,0);
    for(const table of ['users','sessions','orders','builder_chat_turns'])await assert.rejects(worker.pool.query(`SELECT * FROM ${table}`),{code:'42501'});
    await assert.rejects(worker.pool.query('SELECT verifier_envelope FROM google_connections'),{code:'42501'});
    await assert.rejects(worker.pool.query("UPDATE google_connections SET status='DISCONNECTED'"),{code:'42501'});
    await assert.rejects(worker.pool.query('INSERT INTO sheet_delivery_jobs(tenant_id,id) VALUES ($1,$2)',[tenants[0],randomUUID()]),{code:'42501'});
    await assert.rejects(worker.pool.query('UPDATE sheet_delivery_jobs SET requested_by=$1',[users[0]]),{code:'42501'});
    assert.equal((await request(jobs(first),'POST',{id:randomUUID()},tokens[1])).status,404);
    assert.equal((await request(jobs(first),'POST',{id:randomUUID()},tokens[2])).status,403);
    const jobId=randomUUID(),enqueues=await Promise.all([enqueue(first,jobId),enqueue(first,jobId)]);assert.deepEqual(enqueues.map(result=>result.status).sort(),[200,201]);
    await assert.rejects(db.authenticated(tokens[0]!,client=>client.query("UPDATE sheet_delivery_jobs SET status='SUCCEEDED',completed_at=now() WHERE tenant_id=$1 AND id=$2",[tenants[0],jobId])),{code:'42501'});
    assert.equal((await enqueue(first)).status,409);assert.equal((await request(jobs(first))).body.data.length,1);
    assert.equal(await processSheetJob(worker,config,provider),true);assert.equal(appends,1);
    assert.equal((await request(jobs(first)+'/'+jobId)).body.status,'SUCCEEDED');assert.equal(await processSheetJob(worker,config,provider),false);
    assert.equal((await enqueue(first,jobId)).body.status,'SUCCEEDED');assert.equal(appends,1);
    const cancelled=await order(),cancelledJob=(await enqueue(cancelled)).body.id;
    assert.equal((await enqueue(cancelled,jobId)).status,409);
    assert.equal((await request(jobs(cancelled)+'/'+cancelledJob,'DELETE')).body.status,'CANCELLED');assert.equal(await processSheetJob(worker,config,provider),false);
    const revoked=await order(),revokedJob=(await enqueue(revoked)).body.id;
    await admin.query("UPDATE memberships SET role='STAFF' WHERE tenant_id=$1 AND user_id=$2",[tenants[0],users[0]]);
    assert.equal(await processSheetJob(worker,config,provider),true);assert.equal(appends,1);
    await admin.query("UPDATE memberships SET role='OWNER' WHERE tenant_id=$1 AND user_id=$2",[tenants[0],users[0]]);
    assert.equal((await request(jobs(revoked)+'/'+revokedJob)).body.status,'BLOCKED');
    const during=await order(),duringJob=(await enqueue(during)).body.id;mode='read-wait';const pending=processSheetJob(worker,config,provider);await wait();
    const active=(await admin.query('SELECT lease_id FROM sheet_delivery_jobs WHERE tenant_id=$1 AND id=$2',[tenants[0],duringJob])).rows[0];
    await worker.transaction(async client=>{
      await client.query("SELECT set_config('app.user_id',$1,true),set_config('app.sheet_job_id',$2,true),set_config('app.sheet_job_lease',$3,true)",[users[0],duringJob,active.lease_id]);
      assert.deepEqual((await client.query('SELECT order_id FROM sheet_deliveries')).rows,[{order_id:during}]);
      assert.equal((await client.query('SELECT credential_envelope FROM google_connections')).rowCount,1);
      assert.equal((await client.query('SELECT id FROM sheet_destinations')).rowCount,1);
      await client.query("SELECT set_config('app.sheet_job_lease',$1,true)",[randomUUID()]);
      assert.equal((await client.query('SELECT expected_row FROM sheet_deliveries')).rowCount,0);
      assert.equal((await client.query('SELECT credential_envelope FROM google_connections')).rowCount,0);
    });
    assert.equal(await processSheetJob(worker,config,provider),false);
    assert.equal((await request(jobs(during)+'/'+duringJob,'DELETE')).body.status,'CANCELLED');mode='ok';resume();await pending;assert.equal(appends,1);
    await admin.query('UPDATE google_connections SET access_lease_id=NULL,access_lease_until=NULL WHERE tenant_id=$1 AND id=$2',[tenants[0],connection]);
    const lost=await order(),lostJob=(await enqueue(lost)).body.id;mode='lost';await processSheetJob(worker,config,provider);assert.equal(appends,2);
    assert.equal((await request(jobs(lost)+'/'+lostJob)).body.status,'UNKNOWN');assert.equal((await enqueue(lost)).status,409);mode='ok';
    const expired=await order(),expiredJob=(await enqueue(expired)).body.id;
    await admin.query("UPDATE sheet_delivery_jobs SET status='RUNNING',lease_id=$3,lease_until=now()-interval '1 second',claim_count=1 WHERE tenant_id=$1 AND id=$2",[tenants[0],expiredJob,randomUUID()]);
    await processSheetJob(worker,config,provider);assert.equal(appends,3);assert.equal((await request(jobs(expired)+'/'+expiredJob)).body.claimCount,2);
    const crash=await order(),crashJob=(await enqueue(crash)).body.id;mode='write-wait';const inFlight=processSheetJob(worker,config,provider);await wait();assert.equal(appends,4);
    assert.equal((await request(jobs(crash)+'/'+crashJob,'DELETE')).status,409);
    await admin.query("UPDATE sheet_delivery_jobs SET lease_until=now()-interval '1 second' WHERE tenant_id=$1 AND id=$2",[tenants[0],crashJob]);
    mode='ok';await processSheetJob(worker,config,provider);resume();await inFlight;assert.equal(appends,4);
    assert.equal((await request(jobs(crash)+'/'+crashJob)).body.status,'UNKNOWN');
    assert.equal((await worker.pool.query('SELECT expected_row FROM sheet_deliveries')).rowCount,0);
    await admin.query('UPDATE google_connections SET access_lease_id=NULL,access_lease_until=NULL WHERE tenant_id=$1 AND id=$2',[tenants[0],connection]);
    const limited=await order(),limitedJob=(await enqueue(limited)).body.id;
    await admin.query("UPDATE sheet_delivery_jobs SET status='RUNNING',lease_id=$3,lease_until=now()-interval '1 second',claim_count=3 WHERE tenant_id=$1 AND id=$2",[tenants[0],limitedJob,randomUUID()]);
    await processSheetJob(worker,config,provider);assert.equal(appends,4);assert.equal((await request(jobs(limited)+'/'+limitedJob)).body.errorCode,'WORKER_RECOVERY_LIMIT');
    const midRevoked=await order(),midJob=(await enqueue(midRevoked)).body.id;mode='read-wait';const revoking=processSheetJob(worker,config,provider);await wait();
    await admin.query("UPDATE memberships SET role='STAFF' WHERE tenant_id=$1 AND user_id=$2",[tenants[0],users[0]]);mode='ok';resume();await revoking;assert.equal(appends,4);
    await admin.query("UPDATE memberships SET role='OWNER' WHERE tenant_id=$1 AND user_id=$2",[tenants[0],users[0]]);assert.equal((await request(jobs(midRevoked)+'/'+midJob)).body.status,'BLOCKED');
    await admin.query('UPDATE google_connections SET access_lease_id=NULL,access_lease_until=NULL WHERE tenant_id=$1 AND id=$2',[tenants[0],connection]);
    const manual=await order(),manualJob=(await enqueue(manual)).body.id;mode='read-wait';const manualDispatch=request(root+`/orders/${manual}/sheet-delivery/dispatch`,'POST',{});await wait();
    assert.equal((await request(jobs(manual)+'/'+manualJob,'DELETE')).body.status,'CANCELLED');mode='ok';resume();assert.equal((await manualDispatch).body.status,'SUCCEEDED');assert.equal(appends,5);
    const deferred=await order(),deferredJob=(await enqueue(deferred)).body.id;
    await admin.query("UPDATE google_connections SET access_lease_id=$3,access_lease_until=now()+interval '1 minute' WHERE tenant_id=$1 AND id=$2",[tenants[0],connection,randomUUID()]);
    await processSheetJob(worker,config,provider);assert.equal(appends,5);assert.equal((await request(jobs(deferred)+'/'+deferredJob)).body.status,'QUEUED');
    assert.equal(await processSheetJob(worker,config,provider),false);
    await admin.query('UPDATE google_connections SET access_lease_id=NULL,access_lease_until=NULL WHERE tenant_id=$1 AND id=$2',[tenants[0],connection]);
    await admin.query("UPDATE sheet_delivery_jobs SET available_at=now()-interval '1 second' WHERE tenant_id=$1 AND id=$2",[tenants[0],deferredJob]);
    await processSheetJob(worker,config,provider);assert.equal(appends,6);assert.equal((await request(jobs(deferred)+'/'+deferredJob)).body.status,'SUCCEEDED');
  }finally{
    release?.();server.close();await once(server,'close');for(const tenant of tenants)await admin.query('DELETE FROM tenants WHERE id=$1',[tenant]);for(const user of users)await admin.query('DELETE FROM users WHERE id=$1',[user]);await db.pool.end();await worker.pool.end();await admin.end();
  }
});
