import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import pg from 'pg';
import { Database, hashToken } from '../src/database.ts';
import { createApp } from '../src/app.ts';
import { CredentialVault } from '../src/credentials.ts';
import { GOOGLE_FILE_SCOPE } from '../src/google-oauth.ts';
import { GoogleFailure } from '../src/google-sheets.ts';
import { COD_SHEET_HEADERS } from '../src/sheet-delivery-contract.ts';
import type { GoogleDeliveryProvider } from '../src/sheet-delivery.ts';

for (const key of ['DATABASE_URL','ADMIN_DATABASE_URL']) {
  if (!process.env[key] || new URL(process.env[key]!).pathname !== '/superagent_test') throw new Error('Dedicated test database required.');
}
test('durable delivery appends once, preserves uncertain outcomes and reconciles without resending', async () => {
  const db = new Database(process.env.DATABASE_URL!); const admin = new pg.Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
  const users = [randomUUID(),randomUUID(),randomUUID()]; const tenants = [randomUUID(),randomUUID()]; const tokens = users.map(() => randomBytes(32).toString('base64url'));
  const connectionId = randomUUID(); const destinationId = randomUUID(); const vault = new CredentialVault('key', { key: randomBytes(32).toString('base64') });
  const config = { clientId: 'client',clientSecret: 'secret',redirectUri: 'https://app.example.test/callback',vault };
  let rows: (string|number|boolean)[][] = [[...COD_SHEET_HEADERS]]; let appends = 0; let mode = 'ok'; let release: (()=>void)|undefined;
  const provider: GoogleDeliveryProvider = {
    async refresh() { return { accessToken: 'access',expiresIn: 3600 }; },
    async inspect() { return { spreadsheetId: 'sheet-123',title: 'Orders',tabs: [{ sheetId: 0,title: 'Renamed orders',rowCount: 1000,columnCount: 26 }] }; },
    async readRows() { if(mode==='read-wait')await new Promise<void>(resolve=>{release=resolve;});return structuredClone(rows); },
    async append(_token,target,row) {
      appends++; assert.equal(target.tab, 'Renamed orders');
      const stored = (await admin.query('SELECT status,dispatched_at FROM sheet_deliveries WHERE tenant_id=$1 AND order_id=$2', [tenants[0],row[1]])).rows[0];
      assert.equal(stored.status,'DISPATCHED'); assert.ok(stored.dispatched_at);
      if (mode !== 'reject') rows.push([...row]);
      if (mode === 'lost-response') throw new GoogleFailure('OUTCOME_UNKNOWN');
      if (mode === 'reject') throw new GoogleFailure('AUTHORIZATION_FAILED');
      if (mode === 'wait') await new Promise<void>(resolve => { release=resolve; });
      if (mode === 'commit-failure') await admin.query('REVOKE UPDATE(remote_range) ON sheet_deliveries FROM superagent_app');
      return { updatedRange: `'Renamed orders'!A${rows.length}:L${rows.length}` };
    },
  };
  async function waitForAppend() { for(let i=0;!release&&i<200;i++) await new Promise(resolve=>setTimeout(resolve,10)); assert.ok(release); }
  function resume() { assert.ok(release); release(); release=undefined; }
  const server=createApp(db,{google:config,sheetDeliveryEnabled:true,googleDelivery:provider}).listen(0,'127.0.0.1'); await once(server,'listening');
  const address=server.address(); assert.ok(address&&typeof address!=='string'); const base=`http://127.0.0.1:${address.port}/v1`; const root=`/tenants/${tenants[0]}`;
  async function request(path:string,method='GET',body?:unknown,bearer=tokens[0]!) {
    const res=await fetch(base+path,{method,headers:{Authorization:`Bearer ${bearer}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:res.status,body:await res.json()};
  }
  const delivery=(id:string)=>`${root}/orders/${id}/sheet-delivery`;
  async function order() {
    const cid=randomUUID(), id=randomUUID();
    assert.equal((await request(root+'/conversations','POST',{id:cid,customerReference:randomUUID(),language:'fr'})).status,201);
    const draft=await request(root+'/order-attempts','POST',{id,conversationId:cid,details:{item:'=literal',quantity:2,recipient:'Client',phone:'+212612345678',address:'Casablanca',unitAmountMinor:12550,deliveryAmountMinor:3000}});
    assert.equal(draft.status,201);
    assert.equal((await request(root+`/order-attempts/${id}/decisions`,'POST',{id:randomUUID(),expectedRevision:1,summaryHash:draft.body.summaryHash,decision:'CONFIRM',evidence:'Confirmed by phone.'})).status,201);
    return id;
  }
  const bind=(id:string)=>request(delivery(id),'POST',{destinationId});
  const dispatch=(id:string)=>request(delivery(id)+'/dispatch','POST',{});
  const reconcile=(id:string)=>request(delivery(id)+'/reconcile','POST',{});
  try {
    for(let i=0;i<users.length;i++) {
      await admin.query('INSERT INTO users(id,email,password_hash) VALUES ($1,$2,$3)',[users[i],`${users[i]}@example.test`,'delivery-fixture']);
      await admin.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '1 hour')",[hashToken(tokens[i]!),users[i]]);
      if(i<tenants.length) {
        await admin.query('INSERT INTO tenants(id,name,created_by) VALUES ($1,$2,$3)',[tenants[i],'Delivery shop',users[i]]);
        await admin.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES ($1,$2,'OWNER')",[tenants[i],users[i]]);
        await admin.query('INSERT INTO business_profiles(tenant_id) VALUES ($1)',[tenants[i]]);
      }
    }
    await admin.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES ($1,$2,'STAFF')",[tenants[0],users[2]]);
    await admin.query(`INSERT INTO google_connections(tenant_id,id,created_by,oauth_client_id,redirect_uri,status,credential_envelope,scopes,connected_at)
      VALUES ($1,$2,$3,'client',$4,'CONNECTED',$5,$6,now())`,[tenants[0],connectionId,users[0],config.redirectUri,JSON.stringify(vault.seal('refresh',{tenantId:tenants[0]!,connectionId,provider:'google'})),[GOOGLE_FILE_SCOPE]]);
    await admin.query(`INSERT INTO sheet_destinations(tenant_id,id,connection_id,spreadsheet_id,sheet_id,spreadsheet_title,tab_title,row_count,column_count,created_by)
      VALUES ($1,$2,$3,'sheet-123',0,'Orders','Old name',1000,26,$4)`,[tenants[0],destinationId,connectionId,users[0]]);
    const first=await order();
    assert.equal((await request(delivery(first),'POST',{destinationId},'')).status,401);
    assert.equal((await request(delivery(first),'POST',{destinationId},tokens[1])).status,404);
    assert.equal((await request(delivery(first),'POST',{destinationId},tokens[2])).status,403);
    assert.equal((await bind(first)).status,201); assert.equal((await bind(first)).status,200);
    assert.equal((await request(delivery(first),'POST',{destinationId:randomUUID()})).status,409);
    const disabled=createApp(db,{google:config,googleDelivery:provider}).listen(0,'127.0.0.1');await once(disabled,'listening');
    try {
      const addr=disabled.address();assert.ok(addr&&typeof addr!=='string');
      const response=await fetch(`http://127.0.0.1:${addr.port}/v1${delivery(first)}/dispatch`,{method:'POST',headers:{Authorization:`Bearer ${tokens[0]}`,'Content-Type':'application/json'},body:'{}'});
      assert.equal(response.status,503);assert.equal(appends,0);
    }finally{disabled.close();await once(disabled,'close');}
    assert.equal((await dispatch(first)).body.status,'SUCCEEDED'); assert.equal(appends,1);
    assert.equal((await dispatch(first)).body.status,'SUCCEEDED'); assert.equal(appends,1);
    assert.equal((await request(root+'/orders/'+first)).body.sheetSync.delivery.status,'SUCCEEDED');
    assert.equal((await request(root+'/orders')).body.data.find((entry:{id:string})=>entry.id===first).sheetDeliveryStatus,'SUCCEEDED');
    await db.authenticated(tokens[0]!,async client=>assert.equal((await client.query("UPDATE sheet_deliveries SET status='READY' WHERE tenant_id=$1 AND order_id=$2",[tenants[0],first])).rowCount,0));
    await assert.rejects(db.authenticated(tokens[0]!,client=>client.query("UPDATE sheet_deliveries SET expected_row='[]' WHERE tenant_id=$1 AND order_id=$2",[tenants[0],first])),{code:'42501'});

    const uncertain=await order(); await bind(uncertain); mode='lost-response';
    assert.equal((await dispatch(uncertain)).body.error.code,'SHEET_OUTCOME_UNKNOWN');
    assert.equal((await request(delivery(uncertain))).body.status,'UNKNOWN');
    assert.equal((await dispatch(uncertain)).status,409); assert.equal(appends,2);
    mode='ok'; assert.equal((await reconcile(uncertain)).body.status,'SUCCEEDED'); assert.equal(appends,2);

    const absent=await order(); await bind(absent); mode='reject';
    assert.equal((await dispatch(absent)).status,409); assert.equal(appends,3);
    mode='ok'; assert.equal((await reconcile(absent)).body.status,'UNKNOWN'); assert.equal(appends,3);
    assert.equal((await dispatch(absent)).status,409); assert.equal(appends,3);
    await assert.rejects(db.authenticated(tokens[0]!,client=>client.query(`UPDATE sheet_deliveries SET status='PREPARING',dispatched_at=NULL,attempt_id=$3,lease_until=now()+interval '2 minutes' WHERE tenant_id=$1 AND order_id=$2`,[tenants[0],absent,randomUUID()])),(error:unknown)=>error instanceof Error&&error.message.includes('cannot be restarted'));

    const badHeaders=await order(); await bind(badHeaders); rows[0]=['wrong'];
    assert.equal((await dispatch(badHeaders)).body.error.code,'SHEET_HEADERS'); assert.equal(appends,3);
    assert.equal((await request(delivery(badHeaders))).body.status,'BLOCKED'); rows[0]=[...COD_SHEET_HEADERS];
    assert.equal((await dispatch(badHeaders)).body.status,'SUCCEEDED'); assert.equal(appends,4);
    const expiredPreparation=await order();await bind(expiredPreparation);mode='read-wait';const preparing=dispatch(expiredPreparation);await waitForAppend();
    await admin.query("UPDATE sheet_deliveries SET lease_until=now()-interval '1 second' WHERE tenant_id=$1 AND order_id=$2",[tenants[0],expiredPreparation]);
    mode='ok';resume();assert.equal((await preparing).status,409);assert.equal(appends,4);

    const duplicate=await order(); const dup=await bind(duplicate); rows.push(dup.body.rowPreview,dup.body.rowPreview);
    assert.equal((await dispatch(duplicate)).body.error.code,'SHEET_ROW_CONFLICT'); assert.equal(appends,4);

    const race=await order(); await bind(race); mode='wait'; const pending=dispatch(race); await waitForAppend();
    assert.equal((await dispatch(race)).body.error.code,'SHEET_DELIVERY_BUSY');
    await admin.query("UPDATE sheet_deliveries SET lease_until=now()-interval '1 second' WHERE tenant_id=$1 AND order_id=$2",[tenants[0],race]);
    await admin.query("UPDATE google_connections SET access_lease_until=now()-interval '1 second' WHERE tenant_id=$1 AND id=$2",[tenants[0],connectionId]);
    assert.equal((await request(delivery(race))).body.status,'UNKNOWN'); mode='ok';
    assert.equal((await reconcile(race)).body.status,'SUCCEEDED'); resume(); assert.equal((await pending).status,409); assert.equal(appends,5);

    const lostCommit=await order(); await bind(lostCommit); mode='commit-failure';
    try {assert.equal((await dispatch(lostCommit)).body.error.code,'SHEET_OUTCOME_UNKNOWN');}
    finally {await admin.query('GRANT UPDATE(remote_range) ON sheet_deliveries TO superagent_app');}
    assert.equal((await request(delivery(lostCommit))).body.status,'UNKNOWN'); mode='ok';
    assert.equal((await reconcile(lostCommit)).body.status,'SUCCEEDED'); assert.equal(appends,6);
    const disconnect=await order(); await bind(disconnect); mode='wait'; const inFlight=dispatch(disconnect); await waitForAppend();
    assert.equal((await request(root+`/connections/google/${connectionId}`,'DELETE')).status,200); resume();
    assert.equal((await inFlight).body.status,'SUCCEEDED'); assert.equal(appends,7);
    const held=await order(); await bind(held); mode='ok'; assert.equal((await dispatch(held)).status,409); assert.equal(appends,7);
    const dashboard=await request(root+`/dashboard/outcomes?from=${new Date().toISOString().slice(0,10)}&to=${new Date().toISOString().slice(0,10)}`);
    const waiting=(await admin.query("SELECT count(*)::int AS count FROM orders o LEFT JOIN sheet_deliveries d ON d.tenant_id=o.tenant_id AND d.order_id=o.id WHERE o.tenant_id=$1 AND d.status IS DISTINCT FROM 'SUCCEEDED'",[tenants[0]])).rows[0].count;
    assert.equal(dashboard.body.totals.sheetSyncWaiting,waiting);
    await db.authenticated(tokens[1]!,async client=>assert.equal((await client.query('SELECT * FROM sheet_deliveries WHERE tenant_id=$1',[tenants[0]])).rowCount,0));
    const worker=new Database(process.env.BUILDER_WORKER_DATABASE_URL!);
    try { await assert.rejects(worker.pool.query('SELECT * FROM sheet_deliveries'),{code:'42501'}); } finally { await worker.pool.end(); }
  } finally {
    release?.(); server.close(); await once(server,'close');
    for(const tenant of tenants) await admin.query('DELETE FROM tenants WHERE id=$1',[tenant]);
    for(const user of users) await admin.query('DELETE FROM users WHERE id=$1',[user]);
    await db.pool.end(); await admin.end();
  }
});
