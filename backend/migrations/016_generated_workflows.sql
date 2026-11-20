-- AI-generated workflows: validated and simulated like scenarios, but private to one business and
-- usable only after that business's owner approves the exact result.
CREATE TABLE generated_workflows (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  goal text NOT NULL CHECK (length(goal) BETWEEN 1 AND 1000),
  language text NOT NULL CHECK (language IN ('darija', 'fr')),
  status text NOT NULL CHECK (status IN ('READY', 'INVALID')),
  workflow jsonb NOT NULL CHECK (octet_length(workflow::text) <= 65536),
  fixtures jsonb NOT NULL CHECK (octet_length(fixtures::text) <= 65536),
  report jsonb NOT NULL,
  model text NOT NULL CHECK (length(model) BETWEEN 1 AND 200),
  usage jsonb,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  PRIMARY KEY (tenant_id, id),
  CHECK (approved_at IS NULL OR status = 'READY'),
  CHECK ((approved_by IS NULL) = (approved_at IS NULL))
);
CREATE INDEX generated_workflows_tenant ON generated_workflows(tenant_id, created_at DESC, id);
ALTER TABLE generated_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_workflows FORCE ROW LEVEL SECURITY;
CREATE POLICY generated_read ON generated_workflows FOR SELECT TO superagent_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = generated_workflows.tenant_id));
CREATE POLICY generated_insert ON generated_workflows FOR INSERT TO superagent_app
  WITH CHECK (created_by = nullif(current_setting('app.user_id', true), '')::uuid
    AND approved_at IS NULL
    AND EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = generated_workflows.tenant_id AND m.role = 'OWNER'));
-- Only the one-way approval columns can change, and only while unapproved.
CREATE POLICY generated_approve ON generated_workflows FOR UPDATE TO superagent_app
  USING (approved_at IS NULL AND EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = generated_workflows.tenant_id AND m.role = 'OWNER'))
  WITH CHECK (approved_by = nullif(current_setting('app.user_id', true), '')::uuid);
REVOKE ALL ON generated_workflows FROM PUBLIC;
GRANT SELECT, INSERT ON generated_workflows TO superagent_app;
GRANT UPDATE (approved_by, approved_at) ON generated_workflows TO superagent_app;

-- A publication now comes from exactly one source: an approved scenario draft or an approved generated workflow.
ALTER TABLE workflow_publications
  ALTER COLUMN draft_id DROP NOT NULL, ALTER COLUMN draft_revision DROP NOT NULL,
  ALTER COLUMN scenario_id DROP NOT NULL, ALTER COLUMN scenario_revision DROP NOT NULL,
  ADD COLUMN generated_workflow_id uuid,
  ADD FOREIGN KEY (tenant_id, generated_workflow_id) REFERENCES generated_workflows(tenant_id, id),
  ADD CONSTRAINT publication_single_source CHECK ((draft_id IS NOT NULL) <> (generated_workflow_id IS NOT NULL));
