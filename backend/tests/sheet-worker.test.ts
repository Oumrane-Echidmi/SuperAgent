import assert from 'node:assert/strict';
import test from 'node:test';
import { readSheetWorkerConfig } from '../src/sheet-worker-config.ts';

test('Sheets worker requires separate opt-in, Google configuration and a dedicated database URL',()=>{
  const env={SHEETS_WORKER_ENABLED:'true',SHEETS_DELIVERY_ENABLED:'true',GOOGLE_CONNECTIONS_ENABLED:'true',GOOGLE_CLIENT_ID:'client',GOOGLE_CLIENT_SECRET:'secret',GOOGLE_REDIRECT_URI:'https://app.example.test/callback',CREDENTIAL_ACTIVE_KEY_ID:'key',CREDENTIAL_KEYS_JSON:JSON.stringify({key:Buffer.alloc(32,1).toString('base64')}),SHEETS_WORKER_DATABASE_URL:'postgresql://superagent_sheet_worker:placeholder@127.0.0.1:5433/superagent_test'};
  assert.equal(readSheetWorkerConfig(env).connectionString,env.SHEETS_WORKER_DATABASE_URL);
  for(const key of ['SHEETS_WORKER_ENABLED','SHEETS_DELIVERY_ENABLED','GOOGLE_CONNECTIONS_ENABLED','SHEETS_WORKER_DATABASE_URL','CREDENTIAL_KEYS_JSON'])assert.throws(()=>readSheetWorkerConfig({...env,[key]:''}),/Sheets worker configuration/);
  assert.throws(()=>readSheetWorkerConfig({...env,SHEETS_WORKER_DATABASE_URL:'https://example.test'}),/Sheets worker configuration/);
});
