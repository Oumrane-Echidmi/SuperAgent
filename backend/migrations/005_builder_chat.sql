DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'superagent_builder_worker') THEN
    CREATE ROLE superagent_builder_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END $$;
CREATE TABLE builder_chat_sessions (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  language text NOT NULL CHECK (language IN ('darija', 'fr')),
  consent_to_openai boolean NOT NULL CHECK (consent_to_openai IS TRUE),
  revision integer NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 20),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE TABLE builder_chat_turns (
  tenant_id uuid NOT NULL,
  session_id uuid NOT NULL,
  id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision BETWEEN 1 AND 20),
  text text NOT NULL CHECK (length(text) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED')),
  prompt_version text NOT NULL,
  lease_id uuid,
  lease_expires_at timestamptz,
  result jsonb,
  error_code text,
  usage jsonb,
  provider_metadata jsonb,
  catalog_snapshot jsonb,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (tenant_id, session_id, id),
  UNIQUE (tenant_id, session_id, revision),
  FOREIGN KEY (tenant_id, session_id) REFERENCES builder_chat_sessions(tenant_id, id) ON DELETE CASCADE,
  CHECK (status <> 'RUNNING' OR (lease_id IS NOT NULL AND lease_expires_at IS NOT NULL)),
  CHECK (status <> 'SUCCEEDED' OR (result IS NOT NULL AND completed_at IS NOT NULL)),
  CHECK (status <> 'FAILED' OR (error_code IS NOT NULL AND completed_at IS NOT NULL))
);
CREATE UNIQUE INDEX builder_chat_active_idx ON builder_chat_turns(tenant_id, session_id) WHERE status IN ('QUEUED', 'RUNNING');
CREATE INDEX builder_chat_queue_idx ON builder_chat_turns(created_at) WHERE status IN ('QUEUED', 'RUNNING');
CREATE INDEX builder_chat_retention_idx ON builder_chat_sessions(created_at);
CREATE TABLE builder_ai_quota (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  day date NOT NULL,
  reserved integer NOT NULL CHECK (reserved BETWEEN 1 AND 20),
  PRIMARY KEY (tenant_id, day)
);
ALTER TABLE builder_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder_chat_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE builder_chat_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder_chat_turns FORCE ROW LEVEL SECURITY;
ALTER TABLE builder_ai_quota ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder_ai_quota FORCE ROW LEVEL SECURITY;

CREATE POLICY chat_session_read ON builder_chat_sessions FOR SELECT TO superagent_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = builder_chat_sessions.tenant_id));
CREATE POLICY chat_session_create ON builder_chat_sessions FOR INSERT TO superagent_app
  WITH CHECK (created_by = nullif(current_setting('app.user_id', true), '')::uuid
    AND EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = builder_chat_sessions.tenant_id AND m.role = 'OWNER'));
CREATE POLICY chat_session_update ON builder_chat_sessions FOR UPDATE TO superagent_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = builder_chat_sessions.tenant_id AND m.role = 'OWNER'))
  WITH CHECK (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = builder_chat_sessions.tenant_id AND m.role = 'OWNER'));
CREATE POLICY chat_turn_read ON builder_chat_turns FOR SELECT TO superagent_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = builder_chat_turns.tenant_id));
CREATE POLICY chat_turn_create ON builder_chat_turns FOR INSERT TO superagent_app
  WITH CHECK (status = 'QUEUED' AND result IS NULL AND error_code IS NULL AND usage IS NULL AND provider_metadata IS NULL AND catalog_snapshot IS NULL
    AND created_by = nullif(current_setting('app.user_id', true), '')::uuid
    AND EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = builder_chat_turns.tenant_id AND m.role = 'OWNER'));
CREATE POLICY ai_quota_read ON builder_ai_quota FOR SELECT TO superagent_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = builder_ai_quota.tenant_id));
CREATE POLICY ai_quota_write ON builder_ai_quota FOR ALL TO superagent_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = builder_ai_quota.tenant_id AND m.role = 'OWNER'))
  WITH CHECK (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = builder_ai_quota.tenant_id AND m.role = 'OWNER'));

CREATE POLICY worker_session_read ON builder_chat_sessions FOR SELECT TO superagent_builder_worker USING (true);
CREATE POLICY worker_turn_read ON builder_chat_turns FOR SELECT TO superagent_builder_worker USING (true);
CREATE POLICY worker_turn_update ON builder_chat_turns FOR UPDATE TO superagent_builder_worker USING (true) WITH CHECK (true);
CREATE POLICY worker_catalog_read ON scenario_releases FOR SELECT TO superagent_builder_worker USING (true);
CREATE POLICY worker_membership_read ON memberships FOR SELECT TO superagent_builder_worker
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
REVOKE ALL ON builder_chat_sessions, builder_chat_turns, builder_ai_quota FROM PUBLIC;
GRANT SELECT, INSERT ON builder_chat_sessions, builder_chat_turns, builder_ai_quota TO superagent_app;
GRANT UPDATE (revision) ON builder_chat_sessions TO superagent_app;
GRANT UPDATE (reserved) ON builder_ai_quota TO superagent_app;
GRANT SELECT ON builder_chat_sessions, builder_chat_turns, memberships, scenario_releases TO superagent_builder_worker;
GRANT UPDATE (status, lease_id, lease_expires_at, result, error_code, usage, provider_metadata, catalog_snapshot, completed_at) ON builder_chat_turns TO superagent_builder_worker;
