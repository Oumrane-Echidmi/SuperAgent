import { readGoogleConnectionConfig } from './google-oauth.ts';

export function readSheetWorkerConfig(env:Record<string,string|undefined>) {
  try {
    if(env.SHEETS_WORKER_ENABLED!=='true'||env.SHEETS_DELIVERY_ENABLED!=='true')throw new Error();
    const google=readGoogleConnectionConfig(env);if(!google)throw new Error();
    const url=new URL(env.SHEETS_WORKER_DATABASE_URL??'');
    if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error();
    return {google,connectionString:env.SHEETS_WORKER_DATABASE_URL!};
  }catch{throw new Error('Check Sheets worker configuration, opt-in flags and dedicated database URL.');}
}
