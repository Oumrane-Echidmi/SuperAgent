import type { PoolClient } from 'pg';
import type { Database } from './database.ts';

/** Server-only transaction identity; never constructed from HTTP/model-supplied objects. */
export interface SheetExecution {
  transaction<T>(work:(client:PoolClient,userId:string)=>Promise<T>):Promise<T>;
}
export const ownerSheetExecution=(db:Database,bearer:string):SheetExecution=>({transaction:work=>db.authenticated(bearer,work)});
