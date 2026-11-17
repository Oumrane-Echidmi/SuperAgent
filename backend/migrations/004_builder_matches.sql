CREATE TABLE builder_match_requests (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  goal text NOT NULL CHECK (length(goal) BETWEEN 2 AND 4000),
  language text NOT NULL CHECK (language IN ('darija', 'fr')),
  result jsonb NOT NULL CHECK (result->>'state' IN ('CANDIDATES', 'UNSUPPORTED')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX builder_match_review_idx ON builder_match_requests(created_at, tenant_id, id) WHERE result->>'state' = 'UNSUPPORTED';
ALTER TABLE builder_match_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder_match_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY match_request_read ON builder_match_requests FOR SELECT TO superagent_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = builder_match_requests.tenant_id)
    OR (result->>'state' = 'UNSUPPORTED' AND EXISTS (SELECT 1 FROM platform_admins)));
CREATE POLICY match_request_create ON builder_match_requests FOR INSERT TO superagent_app
  WITH CHECK (created_by = nullif(current_setting('app.user_id', true), '')::uuid
    AND EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = builder_match_requests.tenant_id AND m.role = 'OWNER'));
REVOKE ALL ON builder_match_requests FROM PUBLIC;
GRANT SELECT, INSERT ON builder_match_requests TO superagent_app;
