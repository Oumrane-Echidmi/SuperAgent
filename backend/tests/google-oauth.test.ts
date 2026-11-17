import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { GoogleOAuthProvider, GOOGLE_FILE_SCOPE, readGoogleConnectionConfig } from '../src/google-oauth.ts';
import { GoogleFailure } from '../src/google-sheets.ts';

const config = { clientId: 'client.apps.googleusercontent.com', clientSecret: 'secret', redirectUri: 'https://app.example.test/google/callback' };
const verifier = 'x'.repeat(43); const state = 's'.repeat(43);
test('Google OAuth requests offline per-file consent with state and S256 PKCE', () => {
  const provider = new GoogleOAuthProvider(config);
  const url = new URL(provider.authorizationUrl(state, verifier));
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.pathname, '/o/oauth2/v2/auth');
  for (const [key, value] of Object.entries({ response_type: 'code', scope: GOOGLE_FILE_SCOPE, state, access_type: 'offline', prompt: 'consent',
    code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url'), redirect_uri: config.redirectUri })) {
    assert.equal(url.searchParams.get(key), value);
  }
  assert.ok(!url.toString().includes(verifier)); assert.ok(!url.toString().includes('client_secret'));
});
test('authorization code exchange validates offline credentials and granted scope', async () => {
  let calls = 0;
  const provider = new GoogleOAuthProvider(config, async (url, init) => {
    calls++; assert.equal(String(url), 'https://oauth2.googleapis.com/token'); assert.equal(init?.redirect, 'error'); assert.ok(init?.signal);
    const body = new URLSearchParams(String(init?.body));
    for (const [key, value] of Object.entries({ grant_type: 'authorization_code', code: 'code&value', code_verifier: verifier, redirect_uri: config.redirectUri, client_secret: 'secret' })) assert.equal(body.get(key), value);
    return Response.json({ access_token: 'access', token_type: 'Bearer', expires_in: 3600, refresh_token: 'refresh', scope: GOOGLE_FILE_SCOPE });
  });
  assert.deepEqual(await provider.exchange('code&value', verifier), { refreshToken: 'refresh', scopes: [GOOGLE_FILE_SCOPE] });
  assert.equal(calls, 1);
  for (const payload of [{ access_token: 'access', token_type: 'Bearer', expires_in: 3600, scope: GOOGLE_FILE_SCOPE },
    { access_token: 'access', token_type: 'Bearer', expires_in: 3600, refresh_token: 'secret', scope: 'openid' }]) {
    const invalid = new GoogleOAuthProvider(config, async () => Response.json(payload));
    await assert.rejects(invalid.exchange('code', verifier), (error: unknown) => error instanceof GoogleFailure && error.code === 'AUTHORIZATION_FAILED');
  }
});
test('OAuth exchange fails safely without retrying transport, malformed or rejected responses', async () => {
  for (const response of [() => { throw new Error('secret'); }, () => new Response('secret', { status: 400 }), () => new Response('invalid-json'), () => new Response('x'.repeat(65537))]) {
    let calls = 0;
    const provider = new GoogleOAuthProvider(config, async () => { calls++; return response(); });
    await assert.rejects(provider.exchange('code', verifier), (error: unknown) => error instanceof GoogleFailure && !error.message.includes('secret'));
    assert.equal(calls, 1);
  }
});
test('connection configuration is opt-in, validates keys and permits only fixed safe callback URLs', () => {
  assert.equal(readGoogleConnectionConfig({}), undefined);
  assert.throws(() => readGoogleConnectionConfig({ GOOGLE_CONNECTIONS_ENABLED: 'yes' }), /Google connection configuration/);
  const env = { GOOGLE_CONNECTIONS_ENABLED: 'true', GOOGLE_CLIENT_ID: config.clientId, GOOGLE_CLIENT_SECRET: config.clientSecret, GOOGLE_REDIRECT_URI: config.redirectUri,
    CREDENTIAL_ACTIVE_KEY_ID: 'key-1', CREDENTIAL_KEYS_JSON: JSON.stringify({ 'key-1': Buffer.alloc(32, 1).toString('base64') }) };
  assert.equal(readGoogleConnectionConfig(env)?.redirectUri, config.redirectUri);
  for (const url of ['http://remote.example.test/callback', 'https://user:pass@app.example.test/callback', 'https://app.example.test/callback#fragment', 'https://app.example.test/callback?query=1']) {
    assert.throws(() => readGoogleConnectionConfig({ ...env, GOOGLE_REDIRECT_URI: url }), /Google connection configuration/);
  }
  assert.ok(readGoogleConnectionConfig({ ...env, GOOGLE_REDIRECT_URI: 'http://127.0.0.1:5173/google/callback' }));
  assert.throws(() => readGoogleConnectionConfig({ ...env, CREDENTIAL_KEYS_JSON: '{"key-1":"weak"}' }), /Google connection configuration/);
});
