import { z } from 'zod';

export type GoogleFailureCode = 'AUTHORIZATION_FAILED' | 'RATE_LIMITED' | 'REQUEST_REJECTED' | 'OUTCOME_UNKNOWN' | 'INVALID_RESPONSE';
export class GoogleFailure extends Error {
  readonly code: GoogleFailureCode;
  constructor(code: GoogleFailureCode) { super(code); this.code = code; }
}
const token = z.string().min(1).max(16000).regex(/^[\x21-\x7e]+$/);
const destinationSchema = z.strictObject({ spreadsheetId: z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/),
  tab: z.string().min(1).max(100).regex(/^[^\x00-\x1f\x7f]+$/) });
type Destination = z.infer<typeof destinationSchema>;

async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error();
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 65536) { await reader.cancel(); throw new Error(); }
      chunks.push(chunk.value);
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  } finally { reader.releaseLock(); }
}

/** Low-level protocol only: callers must authorize tenant bindings and persist attempts before append. */
export class GoogleSheetsProvider {
  private readonly config: { clientId: string; clientSecret: string };
  private readonly request: typeof fetch;
  constructor(config: { clientId: string; clientSecret: string }, request: typeof fetch = fetch) {
    this.config = z.strictObject({ clientId: token, clientSecret: token }).parse(config); this.request = request;
  }
  async refresh(refreshToken: string, signal?: AbortSignal) {
    token.parse(refreshToken);
    const abort = AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]);
    try {
      abort.throwIfAborted();
      const response = await this.request('https://oauth2.googleapis.com/token', {
        method: 'POST', redirect: 'error', signal: abort, headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: this.config.clientId, client_secret: this.config.clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }).toString(),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new GoogleFailure(response.status === 400 || response.status === 401 || response.status === 403 ? 'AUTHORIZATION_FAILED'
          : response.status === 429 ? 'RATE_LIMITED' : 'REQUEST_REJECTED');
      }
      const result = z.object({ access_token: token, token_type: z.literal('Bearer'), expires_in: z.number().int().positive().max(86400) }).safeParse(await boundedJson(response));
      if (!result.success) throw new GoogleFailure('INVALID_RESPONSE');
      return { accessToken: result.data.access_token, expiresIn: result.data.expires_in };
    } catch (error) {
      if (error instanceof GoogleFailure) throw error;
      throw new GoogleFailure('INVALID_RESPONSE');
    }
  }
  async append(accessToken: string, destination: Destination, row: string[], signal?: AbortSignal) {
    token.parse(accessToken); const target = destinationSchema.parse(destination);
    const values = z.array(z.string().max(4000)).min(1).max(26).parse(row);
    const tab = `'${target.tab.replaceAll("'", "''")}'`;
    const lastColumn = String.fromCharCode(64 + values.length);
    const range = `${tab}!A:${lastColumn}`;
    const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${target.spreadsheetId}/values/${encodeURIComponent(range)}:append`);
    url.search = new URLSearchParams({ valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', includeValuesInResponse: 'false' }).toString();
    const abort = AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]);
    // Cancellation checked before dispatch has no remote effect. Once dispatched, failure is uncertain.
    abort.throwIfAborted();
    try {
      const response = await this.request(url, { method: 'POST', redirect: 'error', signal: abort,
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ majorDimension: 'ROWS', values: [values] }) });
      if (!response.ok) {
        await response.body?.cancel();
        throw new GoogleFailure(response.status >= 500 || response.status >= 300 && response.status < 400 ? 'OUTCOME_UNKNOWN'
          : response.status === 401 || response.status === 403 ? 'AUTHORIZATION_FAILED' : response.status === 429 ? 'RATE_LIMITED' : 'REQUEST_REJECTED');
      }
      const result = z.object({ spreadsheetId: z.literal(target.spreadsheetId), updates: z.object({ updatedRange: z.string().max(500),
        updatedRows: z.literal(1), updatedColumns: z.literal(values.length), updatedCells: z.literal(values.length) }) }).safeParse(await boundedJson(response));
      if (!result.success) throw new GoogleFailure('OUTCOME_UNKNOWN');
      // Google can omit quotes for simple titles. Compare a canonical tab name and a single positive row.
      const match = /^(.*)!A([1-9][0-9]*):([A-Z]+)([1-9][0-9]*)$/.exec(result.data.updates.updatedRange);
      if (!match || ![tab, target.tab].includes(match[1]!) || match[2] !== match[4] || match[3] !== lastColumn) throw new GoogleFailure('OUTCOME_UNKNOWN');
      return { updatedRange: result.data.updates.updatedRange };
    } catch (error) {
      if (error instanceof GoogleFailure) throw error;
      throw new GoogleFailure('OUTCOME_UNKNOWN');
    }
  }
}
