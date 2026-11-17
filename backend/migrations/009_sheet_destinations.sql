ALTER TABLE google_connections
  ADD COLUMN access_lease_id uuid,
  ADD COLUMN access_lease_until timestamptz,
  ADD COLUMN inspection_window timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN inspection_count integer NOT NULL DEFAULT 0 CHECK (inspection_count BETWEEN 0 AND 20),
  ADD CONSTRAINT google_access_lease_check CHECK (
    (access_lease_id IS NULL AND access_lease_until IS NULL)
    OR (status='CONNECTED' AND access_lease_id IS NOT NULL AND access_lease_until IS NOT NULL)
  );
GRANT UPDATE(access_lease_id,access_lease_until,inspection_window,inspection_count) ON google_connections TO superagent_app;

CREATE TABLE sheet_destinations (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  connection_id uuid NOT NULL,
  spreadsheet_id text NOT NULL CHECK (spreadsheet_id ~ '^[a-zA-Z0-9_-]{1,200}$'),
  sheet_id integer NOT NULL CHECK (sheet_id>=0),
  spreadsheet_title text NOT NULL CHECK (length(spreadsheet_title) BETWEEN 1 AND 500),
  tab_title text NOT NULL CHECK (length(tab_title) BETWEEN 1 AND 100),
  row_count integer NOT NULL CHECK (row_count BETWEEN 1 AND 10000000),
  column_count integer NOT NULL CHECK (column_count BETWEEN 1 AND 18278),
  created_by uuid NOT NULL REFERENCES users(id),
  checked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,connection_id) REFERENCES google_connections(tenant_id,id)
);
CREATE INDEX sheet_destinations_tenant_checked ON sheet_destinations(tenant_id,checked_at DESC,id);
CREATE INDEX sheet_destinations_connection ON sheet_destinations(tenant_id,connection_id);
ALTER TABLE sheet_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sheet_destinations FORCE ROW LEVEL SECURITY;
CREATE POLICY sheet_destination_owner_read ON sheet_destinations FOR SELECT TO superagent_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id=sheet_destinations.tenant_id AND m.role='OWNER'));
CREATE POLICY sheet_destination_owner_insert ON sheet_destinations FOR INSERT TO superagent_app
  WITH CHECK (created_by=nullif(current_setting('app.user_id',true),'')::uuid
    AND EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id=sheet_destinations.tenant_id AND m.role='OWNER')
    AND EXISTS (SELECT 1 FROM google_connections c WHERE c.tenant_id=sheet_destinations.tenant_id AND c.id=connection_id AND c.status='CONNECTED'
      AND c.access_lease_id IS NOT NULL AND c.access_lease_until>clock_timestamp()));
REVOKE ALL ON sheet_destinations FROM PUBLIC;
GRANT SELECT, INSERT ON sheet_destinations TO superagent_app;
