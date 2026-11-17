CREATE TABLE platform_admins (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE scenarios (
  id uuid PRIMARY KEY,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  initial_definition jsonb NOT NULL,
  draft jsonb NOT NULL CHECK (octet_length(draft::text) <= 65536),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE scenario_releases (
  scenario_id uuid NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  definition jsonb NOT NULL,
  validation_report jsonb NOT NULL CHECK ((validation_report->>'valid')::boolean IS TRUE),
  simulation_report jsonb NOT NULL CHECK ((simulation_report->>'valid')::boolean IS TRUE),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scenario_id, revision)
);
CREATE TABLE scenario_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scenario_id uuid NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL CHECK (action IN ('CREATE_DRAFT', 'UPDATE_DRAFT', 'RELEASE')),
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scenario_audit_scenario_idx ON scenario_audit(scenario_id, id);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admins FORCE ROW LEVEL SECURITY;
ALTER TABLE scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenarios FORCE ROW LEVEL SECURITY;
ALTER TABLE scenario_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenario_releases FORCE ROW LEVEL SECURITY;
ALTER TABLE scenario_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenario_audit FORCE ROW LEVEL SECURITY;

CREATE POLICY admin_self ON platform_admins FOR SELECT TO superagent_app
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
CREATE POLICY scenario_read ON scenarios FOR SELECT TO superagent_app
  USING (EXISTS (SELECT 1 FROM platform_admins));
CREATE POLICY scenario_create ON scenarios FOR INSERT TO superagent_app
  WITH CHECK (EXISTS (SELECT 1 FROM platform_admins)
    AND created_by = nullif(current_setting('app.user_id', true), '')::uuid AND initial_definition = draft);
CREATE POLICY scenario_update ON scenarios FOR UPDATE TO superagent_app
  USING (EXISTS (SELECT 1 FROM platform_admins)) WITH CHECK (EXISTS (SELECT 1 FROM platform_admins));
CREATE POLICY release_read ON scenario_releases FOR SELECT TO superagent_app
  USING (nullif(current_setting('app.user_id', true), '') IS NOT NULL);
CREATE POLICY release_create ON scenario_releases FOR INSERT TO superagent_app
  WITH CHECK (EXISTS (SELECT 1 FROM platform_admins)
    AND created_by = nullif(current_setting('app.user_id', true), '')::uuid
    AND EXISTS (SELECT 1 FROM scenarios s WHERE s.id = scenario_id AND s.revision = scenario_releases.revision AND s.draft = definition));
CREATE POLICY audit_read ON scenario_audit FOR SELECT TO superagent_app
  USING (EXISTS (SELECT 1 FROM platform_admins));
CREATE POLICY audit_create ON scenario_audit FOR INSERT TO superagent_app
  WITH CHECK (EXISTS (SELECT 1 FROM platform_admins) AND actor_id = nullif(current_setting('app.user_id', true), '')::uuid);

REVOKE ALL ON platform_admins, scenarios, scenario_releases, scenario_audit FROM PUBLIC;
GRANT SELECT ON platform_admins TO superagent_app;
GRANT SELECT, INSERT ON scenarios, scenario_releases, scenario_audit TO superagent_app;
GRANT UPDATE (draft, revision, updated_at) ON scenarios TO superagent_app;
GRANT USAGE, SELECT ON SEQUENCE scenario_audit_id_seq TO superagent_app;
