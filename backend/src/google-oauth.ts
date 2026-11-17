import { createHash } from 'node:crypto';
import { z } from 'zod';
import { CredentialVault } from './credentials.ts';
import { GoogleFailure, readGoogleResponse } from './google-sheets.ts';

export const GOOGLE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const asciiToken = z.string().min(1).max(16000).regex(/^[\x21-\x7e]+$/);
const verifierSchema = z.string().regex(/^[A-Za-z0-9_-]{43,128}$/);
const callbackSchema = z.url().max(2000).refine(value => {
  const url = new URL(value);
  return !url.username && !url.password && !url.hash && !url.search
    && (url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
});
const oauthConfigSchema = z.strictObject({ clientId: asciiToken, clientSecret: asciiToken, redirectUri: callbackSchema });
type OAuthConfig = z.infer<typeof oauthConfigSchema>;
export type GoogleConnectionConfig = OAuthConfig & { vault: CredentialVault };

export function readGoogleConnectionConfig(env: Record<string, string | undefined>): GoogleConnectionConfig | undefined {
  try {
    const enabled = env.GOOGLE_CONNECTIONS_ENABLED ?? 'false';
    if (enabled === 'false') return undefined;
    if (enabled !== 'true') throw new Error();
    const config = oauthConfigSchema.parse({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: env.GOOGLE_REDIRECT_URI });
    const keys = z.record(z.string(), z.string()).parse(JSON.parse(env.CREDENTIAL_KEYS_JSON ?? ''));
    return { ...config, vault: new CredentialVault(env.CREDENTIAL_ACTIVE_KEY_ID ?? '', keys) };
  } catch { throw new Error('Check Google connection configuration and credential keys.'); }
}

export interface GoogleOAuth {
  authorizationUrl(state: string, verifier: string): string;
  exchange(code: string, verifier: string): Promise<{ refreshToken: string; scopes: string[] }>;
}

export class GoogleOAuthProvider implements GoogleOAuth {
  private readonly config: OAuthConfig;
  private readonly request: typeof fetch;
  constructor(config: OAuthConfig, request: typeof fetch = fetch) {
    this.config = oauthConfigSchema.parse(config); this.request = request;
  }
  authorizationUrl(state: string, verifier: string) {
    verifierSchema.parse(state); verifierSchema.parse(verifier);
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({ client_id: this.config.clientId, redirect_uri: this.config.redirectUri, response_type: 'code',
      scope: GOOGLE_FILE_SCOPE, access_type: 'offline', prompt: 'consent', state,
      code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') }).toString();
    return url.toString();
  }
  async exchange(code: string, verifier: string) {
    asciiToken.parse(code); verifierSchema.parse(verifier);
    try {
      const response = await this.request('https://oauth2.googleapis.com/token', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: this.config.clientId, client_secret: this.config.clientSecret, redirect_uri: this.config.redirectUri,
          grant_type: 'authorization_code', code, code_verifier: verifier }).toString(),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new GoogleFailure('AUTHORIZATION_FAILED');
      }
      const result = z.object({ access_token: asciiToken, token_type: z.literal('Bearer'), expires_in: z.number().int().positive().max(86400),
        refresh_token: asciiToken.optional(), scope: z.string().max(8000) }).safeParse(await readGoogleResponse(response));
      if (!result.success) throw new GoogleFailure('INVALID_RESPONSE');
      const scopes = [...new Set(result.data.scope.split(/\s+/).filter(Boolean))].sort();
      if (!result.data.refresh_token || !scopes.includes(GOOGLE_FILE_SCOPE)) throw new GoogleFailure('AUTHORIZATION_FAILED');
      // The temporary access token is deliberately not returned or persisted.
      return { refreshToken: result.data.refresh_token, scopes };
    } catch (error) {
      if (error instanceof GoogleFailure) throw error;
      throw new GoogleFailure('OUTCOME_UNKNOWN');
    }
  }
}
