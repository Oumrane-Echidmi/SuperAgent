import {setTimeout} from 'node:timers/promises';
import {Database} from './database.ts';
import {GoogleSheetsProvider} from './google-sheets.ts';
import {readSheetWorkerConfig} from './sheet-worker-config.ts';
import {processSheetJob} from './sheet-job-worker.ts';

const config=readSheetWorkerConfig(process.env),db=new Database(config.connectionString),stop=new AbortController();
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{stop.abort();});
try{
  await db.checkRuntimeRole();
  const role=await db.pool.query('SELECT current_user AS name');
  if(role.rows[0].name!=='superagent_sheet_worker')throw new Error('Use the dedicated Sheets worker database login.');
  const provider=new GoogleSheetsProvider({clientId:config.google.clientId,clientSecret:config.google.clientSecret});
  console.log('Sheets worker ready.');
  while(!stop.signal.aborted){
    try{const processed=await processSheetJob(db,config.google,provider);if(!processed)await setTimeout(1000,undefined,{signal:stop.signal});}
    catch{if(!stop.signal.aborted){console.error('Sheets worker could not process work.');await setTimeout(1000,undefined,{signal:stop.signal}).catch(()=>{});}}
  }
}finally{await db.pool.end();}
