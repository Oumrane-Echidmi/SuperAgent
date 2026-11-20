-- Publication of approved drafts and durable, resumable workflow runs.
CREATE TABLE workflow_publications (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  draft_id uuid NOT NULL,
  draft_revision integer NOT NULL CHECK (draft_revision > 0),
  scenario_id uuid NOT NULL,
  scenario_revision integer NOT NULL CHECK (scenario_revision > 0),
  whatsapp_number_id uuid NOT NULL,
  manifest jsonb NOT NULL CHECK (octet_length(manifest::text) <= 65536),
  manifest_hash text NOT NULL CHECK (manifest_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED')),
  published_by uuid NOT NULL REFERENCES users(id),
  published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, draft_id) REFERENCES builder_drafts(tenant_id, id),
  FOREIGN KEY (tenant_id, whatsapp_number_id) REFERENCES whatsapp_numbers(tenant_id, id)
);
-- A number routes to at most one live publication.
CREATE UNIQUE INDEX one_active_publication_per_number ON workflow_publications(tenant_id, whatsapp_number_id) WHERE status = 'ACTIVE';
ALTER TABLE workflow_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_publications FORCE ROW LEVEL SECURITY;
CREATE POLICY publication_read ON workflow_publications FOR SELECT TO superagent_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = workflow_publications.tenant_id));
CREATE POLICY publication_insert ON workflow_publications FOR INSERT TO superagent_app
  WITH CHECK (published_by = nullif(current_setting('app.user_id', true), '')::uuid
    AND EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = workflow_publications.tenant_id AND m.role = 'OWNER'));
CREATE POLICY publication_update ON workflow_publications FOR UPDATE TO superagent_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = workflow_publications.tenant_id AND m.role = 'OWNER'))
  WITH CHECK (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = workflow_publications.tenant_id AND m.role = 'OWNER'));
REVOKE ALL ON workflow_publications FROM PUBLIC;
GRANT SELECT, INSERT ON workflow_publications TO superagent_app;
GRANT UPDATE (status, updated_at) ON workflow_publications TO superagent_app;

CREATE TABLE workflow_runs (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  publication_id uuid NOT NULL,
  message_id text NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_until timestamptz,
  reason text CHECK (reason IS NULL OR length(reason) <= 4000),
  error_code text CHECK (error_code IS NULL OR length(error_code) <= 80),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, publication_id, message_id),
  FOREIGN KEY (tenant_id, publication_id) REFERENCES workflow_publications(tenant_id, id)
);
CREATE INDEX workflow_runs_claim ON workflow_runs(status, lease_until, created_at);
CREATE INDEX workflow_runs_tenant ON workflow_runs(tenant_id, created_at DESC, id);
ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY run_read ON workflow_runs FOR SELECT TO superagent_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = workflow_runs.tenant_id));
CREATE POLICY run_update ON workflow_runs FOR UPDATE TO superagent_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = workflow_runs.tenant_id AND m.role = 'OWNER'))
  WITH CHECK (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = workflow_runs.tenant_id AND m.role = 'OWNER'));
REVOKE ALL ON workflow_runs FROM PUBLIC;
GRANT SELECT ON workflow_runs TO superagent_app;
GRANT UPDATE (status, lease_until, reason, error_code, updated_at) ON workflow_runs TO superagent_app;

-- Append-only step journal. The next node is derived from the last recorded route,
-- so a crashed run resumes without repeating a committed step or its side effect.
CREATE TABLE workflow_run_steps (
  tenant_id uuid NOT NULL,
  run_id uuid NOT NULL,
  seq integer NOT NULL CHECK (seq >= 0),
  node_id text NOT NULL,
  route text CHECK (route IN ('next', 'match', 'default')),
  outputs jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, run_id, seq),
  FOREIGN KEY (tenant_id, run_id) REFERENCES workflow_runs(tenant_id, id) ON DELETE CASCADE
);
ALTER TABLE workflow_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_run_steps FORCE ROW LEVEL SECURITY;
CREATE POLICY step_read ON workflow_run_steps FOR SELECT TO superagent_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = workflow_run_steps.tenant_id));
CREATE POLICY step_insert ON workflow_run_steps FOR INSERT TO superagent_app
  WITH CHECK (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = workflow_run_steps.tenant_id AND m.role = 'OWNER'));
REVOKE ALL ON workflow_run_steps FROM PUBLIC;
GRANT SELECT, INSERT ON workflow_run_steps TO superagent_app;

-- Webhook intake now also routes a newly stored message to the number's live publication.
CREATE OR REPLACE FUNCTION record_whatsapp_message(p_phone_number_id text, p_message_id text, p_customer_phone text,
  p_message_type text, p_body text, p_sent_at timestamptz) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid; v_number uuid; v_publication uuid;
BEGIN
  SELECT tenant_id, id INTO v_tenant, v_number FROM whatsapp_numbers WHERE phone_number_id = p_phone_number_id;
  IF v_tenant IS NULL THEN RETURN 'UNKNOWN_NUMBER'; END IF;
  INSERT INTO whatsapp_messages(tenant_id, message_id, phone_number_id, customer_phone, message_type, body, sent_at)
    VALUES (v_tenant, p_message_id, p_phone_number_id, p_customer_phone, p_message_type, left(p_body, 4096), p_sent_at)
    ON CONFLICT (tenant_id, message_id) DO NOTHING;
  IF NOT FOUND THEN RETURN 'DUPLICATE'; END IF;
  IF p_message_type = 'text' AND p_body IS NOT NULL THEN
    SELECT id INTO v_publication FROM workflow_publications WHERE tenant_id = v_tenant AND whatsapp_number_id = v_number AND status = 'ACTIVE';
    IF v_publication IS NOT NULL THEN
      INSERT INTO workflow_runs(tenant_id, id, publication_id, message_id) VALUES (v_tenant, gen_random_uuid(), v_publication, p_message_id)
        ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN 'RECORDED';
END $$;

-- Cross-tenant queue claim. Leases make a crashed worker's run claimable again;
-- a run is failed after five claims. The worker then acts as the publisher under normal RLS.
CREATE FUNCTION claim_workflow_run() RETURNS TABLE(tenant_id uuid, run_id uuid, acting_user uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid; v_run uuid; v_publication uuid;
BEGIN
  UPDATE workflow_runs r SET status = 'FAILED', error_code = 'RETRIES_EXHAUSTED', lease_until = NULL, updated_at = clock_timestamp()
    WHERE r.status = 'RUNNING' AND r.lease_until <= clock_timestamp() AND r.attempts >= 5;
  SELECT r.tenant_id, r.id, r.publication_id INTO v_tenant, v_run, v_publication FROM workflow_runs r
    WHERE r.status = 'QUEUED' OR (r.status = 'RUNNING' AND r.lease_until <= clock_timestamp())
    ORDER BY r.created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF v_run IS NULL THEN RETURN; END IF;
  UPDATE workflow_runs r SET status = 'RUNNING', attempts = r.attempts + 1, lease_until = clock_timestamp() + interval '60 seconds',
    updated_at = clock_timestamp() WHERE r.tenant_id = v_tenant AND r.id = v_run;
  RETURN QUERY SELECT v_tenant, v_run, p.published_by FROM workflow_publications p WHERE p.tenant_id = v_tenant AND p.id = v_publication;
END $$;
REVOKE ALL ON FUNCTION claim_workflow_run() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_workflow_run() TO superagent_app;
