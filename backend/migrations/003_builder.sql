CREATE TABLE builder_drafts (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  scenario_id uuid NOT NULL,
  scenario_revision integer NOT NULL,
  initial_intent jsonb NOT NULL,
  current_revision integer NOT NULL DEFAULT 1 CHECK (current_revision > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (scenario_id, scenario_revision) REFERENCES scenario_releases(scenario_id, revision)
);
CREATE TABLE draft_revisions (
  tenant_id uuid NOT NULL,
  draft_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  content jsonb NOT NULL,
  revision_hash text NOT NULL CHECK (revision_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, draft_id, revision),
  UNIQUE (tenant_id, draft_id, revision, revision_hash),
  FOREIGN KEY (tenant_id, draft_id) REFERENCES builder_drafts(tenant_id, id) ON DELETE CASCADE
);
ALTER TABLE builder_drafts ADD CONSTRAINT builder_current_revision_fk
  FOREIGN KEY (tenant_id, id, current_revision) REFERENCES draft_revisions(tenant_id, draft_id, revision)
  DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE draft_simulations (
  tenant_id uuid NOT NULL,
  draft_id uuid NOT NULL,
  revision integer NOT NULL,
  simulator_version text NOT NULL,
  revision_hash text NOT NULL,
  report jsonb NOT NULL CHECK (jsonb_typeof(report->'valid') = 'boolean'),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, draft_id, revision, simulator_version),
  UNIQUE (tenant_id, draft_id, revision, simulator_version, revision_hash),
  FOREIGN KEY (tenant_id, draft_id, revision, revision_hash) REFERENCES draft_revisions(tenant_id, draft_id, revision, revision_hash) ON DELETE CASCADE
);
CREATE TABLE draft_approvals (
  tenant_id uuid NOT NULL,
  draft_id uuid NOT NULL,
  revision integer NOT NULL,
  simulator_version text NOT NULL,
  revision_hash text NOT NULL,
  approved_by uuid NOT NULL REFERENCES users(id),
  approved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, draft_id, revision, simulator_version),
  FOREIGN KEY (tenant_id, draft_id, revision, simulator_version, revision_hash)
    REFERENCES draft_simulations(tenant_id, draft_id, revision, simulator_version, revision_hash) ON DELETE CASCADE
);

ALTER TABLE builder_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder_drafts FORCE ROW LEVEL SECURITY;
ALTER TABLE draft_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE draft_simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_simulations FORCE ROW LEVEL SECURITY;
ALTER TABLE draft_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_approvals FORCE ROW LEVEL SECURITY;

CREATE POLICY builder_read ON builder_drafts FOR SELECT TO superagent_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = builder_drafts.tenant_id));
CREATE POLICY builder_create ON builder_drafts FOR INSERT TO superagent_app
  WITH CHECK (created_by = nullif(current_setting('app.user_id', true), '')::uuid
    AND EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = builder_drafts.tenant_id AND m.role = 'OWNER'));
CREATE POLICY builder_update ON builder_drafts FOR UPDATE TO superagent_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = builder_drafts.tenant_id AND m.role = 'OWNER'))
  WITH CHECK (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = builder_drafts.tenant_id AND m.role = 'OWNER'));
CREATE POLICY revision_read ON draft_revisions FOR SELECT TO superagent_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = draft_revisions.tenant_id));
CREATE POLICY revision_create ON draft_revisions FOR INSERT TO superagent_app
  WITH CHECK (created_by = nullif(current_setting('app.user_id', true), '')::uuid
    AND EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = draft_revisions.tenant_id AND m.role = 'OWNER')
    AND EXISTS (SELECT 1 FROM builder_drafts d WHERE d.tenant_id = draft_revisions.tenant_id AND d.id = draft_id AND d.current_revision = revision));
CREATE POLICY simulation_read ON draft_simulations FOR SELECT TO superagent_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = draft_simulations.tenant_id));
CREATE POLICY simulation_create ON draft_simulations FOR INSERT TO superagent_app
  WITH CHECK (created_by = nullif(current_setting('app.user_id', true), '')::uuid
    AND EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = draft_simulations.tenant_id AND m.role = 'OWNER')
    AND EXISTS (SELECT 1 FROM builder_drafts d WHERE d.tenant_id = draft_simulations.tenant_id AND d.id = draft_id AND d.current_revision = revision));
CREATE POLICY approval_read ON draft_approvals FOR SELECT TO superagent_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = draft_approvals.tenant_id));
CREATE POLICY approval_create ON draft_approvals FOR INSERT TO superagent_app
  WITH CHECK (approved_by = nullif(current_setting('app.user_id', true), '')::uuid
    AND EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = draft_approvals.tenant_id AND m.role = 'OWNER')
    AND EXISTS (SELECT 1 FROM builder_drafts d WHERE d.tenant_id = draft_approvals.tenant_id AND d.id = draft_id AND d.current_revision = revision)
    AND EXISTS (SELECT 1 FROM draft_simulations s WHERE s.tenant_id = draft_approvals.tenant_id AND s.draft_id = draft_approvals.draft_id
      AND s.revision = draft_approvals.revision AND s.simulator_version = draft_approvals.simulator_version AND s.report->>'valid' = 'true'));

REVOKE ALL ON builder_drafts, draft_revisions, draft_simulations, draft_approvals FROM PUBLIC;
GRANT SELECT, INSERT ON builder_drafts, draft_revisions, draft_simulations, draft_approvals TO superagent_app;
GRANT UPDATE (current_revision, updated_at) ON builder_drafts TO superagent_app;
