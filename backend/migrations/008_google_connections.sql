CREATE TABLE google_connections (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  oauth_client_id text NOT NULL,
  redirect_uri text NOT NULL,
  status text NOT NULL CHECK (status IN ('AUTHORIZING','EXCHANGING','CONNECTED','FAILED','DISCONNECTED')),
  state_hash text CHECK (state_hash ~ '^[a-f0-9]{64}$'),
  verifier_envelope jsonb,
  credential_envelope jsonb,
  scopes text[] NOT NULL DEFAULT '{}',
  connected_at timestamptz,
  disconnected_by uuid REFERENCES users(id),
  PRIMARY KEY (tenant_id,id),
  CHECK (octet_length(verifier_envelope::text) <= 24000 AND octet_length(credential_envelope::text) <= 24000),
  CHECK (
    (status = 'AUTHORIZING' AND state_hash IS NOT NULL AND verifier_envelope IS NOT NULL AND credential_envelope IS NULL)
    OR (status IN ('EXCHANGING','FAILED','DISCONNECTED') AND state_hash IS NULL AND verifier_envelope IS NULL AND credential_envelope IS NULL)
    OR (status = 'CONNECTED' AND state_hash IS NULL AND verifier_envelope IS NULL AND credential_envelope IS NOT NULL
      AND connected_at IS NOT NULL AND 'https://www.googleapis.com/auth/drive.file' = ANY(scopes))
  )
);
CREATE INDEX google_connections_tenant_created ON google_connections(tenant_id,created_at DESC,id);
ALTER TABLE google_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY google_owner_read ON google_connections FOR SELECT TO superagent_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id=google_connections.tenant_id AND m.role='OWNER'));
CREATE POLICY google_owner_insert ON google_connections FOR INSERT TO superagent_app
  WITH CHECK (created_by=nullif(current_setting('app.user_id',true),'')::uuid
    AND status='AUTHORIZING'
    AND EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id=google_connections.tenant_id AND m.role='OWNER'));
CREATE POLICY google_owner_update ON google_connections FOR UPDATE TO superagent_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id=google_connections.tenant_id AND m.role='OWNER'))
  WITH CHECK (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id=google_connections.tenant_id AND m.role='OWNER'));
REVOKE ALL ON google_connections FROM PUBLIC;
GRANT SELECT, INSERT ON google_connections TO superagent_app;
GRANT UPDATE(status,state_hash,verifier_envelope,credential_envelope,scopes,connected_at,disconnected_by,updated_at) ON google_connections TO superagent_app;
