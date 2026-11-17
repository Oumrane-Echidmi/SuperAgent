DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='superagent_sheet_worker') THEN
    CREATE ROLE superagent_sheet_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO superagent_sheet_worker;
ALTER TABLE sheet_deliveries ADD UNIQUE(tenant_id,order_id,destination_id);
ALTER TABLE sheet_destinations ADD UNIQUE(tenant_id,id,connection_id);
CREATE TABLE sheet_delivery_jobs (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  order_id uuid NOT NULL,
  destination_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  requested_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','RUNNING','SUCCEEDED','BLOCKED','UNKNOWN','CANCELLED')),
  lease_id uuid,
  lease_until timestamptz,
  claim_count integer NOT NULL DEFAULT 0 CHECK(claim_count BETWEEN 0 AND 3),
  completed_at timestamptz,
  error_code text CHECK(error_code ~ '^[A-Z_]{1,60}$'),
  PRIMARY KEY(tenant_id,id),
  FOREIGN KEY(tenant_id,order_id,destination_id) REFERENCES sheet_deliveries(tenant_id,order_id,destination_id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,destination_id,connection_id) REFERENCES sheet_destinations(tenant_id,id,connection_id),
  CHECK(status<>'RUNNING' OR (lease_id IS NOT NULL AND lease_until IS NOT NULL AND claim_count>0)),
  CHECK((status IN ('QUEUED','RUNNING'))=(completed_at IS NULL))
);
CREATE UNIQUE INDEX sheet_delivery_job_active ON sheet_delivery_jobs(tenant_id,order_id) WHERE status IN ('QUEUED','RUNNING');
CREATE INDEX sheet_delivery_job_queue ON sheet_delivery_jobs(created_at,id) WHERE status IN ('QUEUED','RUNNING');
CREATE INDEX sheet_delivery_job_order ON sheet_delivery_jobs(tenant_id,order_id,created_at DESC,id);
ALTER TABLE sheet_delivery_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sheet_delivery_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY sheet_job_owner_read ON sheet_delivery_jobs FOR SELECT TO superagent_app
  USING(EXISTS(SELECT 1 FROM memberships m WHERE m.tenant_id=sheet_delivery_jobs.tenant_id AND m.role='OWNER'));
CREATE POLICY sheet_job_owner_create ON sheet_delivery_jobs FOR INSERT TO superagent_app
  WITH CHECK(requested_by=nullif(current_setting('app.user_id',true),'')::uuid AND status='QUEUED'
    AND lease_id IS NULL AND lease_until IS NULL AND claim_count=0 AND error_code IS NULL
    AND EXISTS(SELECT 1 FROM memberships m WHERE m.tenant_id=sheet_delivery_jobs.tenant_id AND m.role='OWNER')
    AND EXISTS(SELECT 1 FROM sheet_deliveries d WHERE d.tenant_id=sheet_delivery_jobs.tenant_id AND d.order_id=sheet_delivery_jobs.order_id AND d.dispatched_at IS NULL)
    AND EXISTS(SELECT 1 FROM google_connections c WHERE c.tenant_id=sheet_delivery_jobs.tenant_id AND c.id=connection_id AND c.status='CONNECTED'));
CREATE POLICY sheet_job_owner_cancel ON sheet_delivery_jobs FOR UPDATE TO superagent_app
  USING(status IN ('QUEUED','RUNNING') AND EXISTS(SELECT 1 FROM memberships m WHERE m.tenant_id=sheet_delivery_jobs.tenant_id AND m.role='OWNER'))
  WITH CHECK(status='CANCELLED' AND EXISTS(SELECT 1 FROM memberships m WHERE m.tenant_id=sheet_delivery_jobs.tenant_id AND m.role='OWNER'));
CREATE POLICY sheet_job_worker_read ON sheet_delivery_jobs FOR SELECT TO superagent_sheet_worker USING(true);
CREATE POLICY sheet_job_worker_update ON sheet_delivery_jobs FOR UPDATE TO superagent_sheet_worker
  USING(status IN ('QUEUED','RUNNING')) WITH CHECK(true);
REVOKE ALL ON sheet_delivery_jobs FROM PUBLIC;
GRANT SELECT,INSERT ON sheet_delivery_jobs TO superagent_app;
GRANT UPDATE(status,completed_at,error_code) ON sheet_delivery_jobs TO superagent_app;
GRANT SELECT ON sheet_delivery_jobs TO superagent_sheet_worker;
GRANT UPDATE(status,lease_id,lease_until,claim_count,completed_at,error_code) ON sheet_delivery_jobs TO superagent_sheet_worker;

CREATE POLICY sheet_worker_membership ON memberships FOR SELECT TO superagent_sheet_worker
  USING(user_id=nullif(current_setting('app.user_id',true),'')::uuid AND EXISTS(
    SELECT 1 FROM sheet_delivery_jobs j WHERE j.tenant_id=memberships.tenant_id AND j.requested_by=memberships.user_id
      AND j.id=nullif(current_setting('app.sheet_job_id',true),'')::uuid
      AND j.lease_id=nullif(current_setting('app.sheet_job_lease',true),'')::uuid
      AND j.status='RUNNING' AND j.lease_until>clock_timestamp()));
GRANT SELECT(tenant_id,user_id,role) ON memberships TO superagent_sheet_worker;
CREATE FUNCTION sheet_worker_authorized(p_tenant uuid,p_order uuid,p_destination uuid,p_connection uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
    SELECT EXISTS(SELECT 1 FROM sheet_delivery_jobs j JOIN memberships m ON m.tenant_id=j.tenant_id AND m.user_id=j.requested_by AND m.role='OWNER'
      WHERE j.tenant_id=p_tenant AND j.requested_by=nullif(current_setting('app.user_id',true),'')::uuid
        AND j.id=nullif(current_setting('app.sheet_job_id',true),'')::uuid
        AND j.lease_id=nullif(current_setting('app.sheet_job_lease',true),'')::uuid AND j.status='RUNNING' AND j.lease_until>clock_timestamp()
        AND (p_order IS NULL OR j.order_id=p_order) AND (p_destination IS NULL OR j.destination_id=p_destination) AND (p_connection IS NULL OR j.connection_id=p_connection))
  $$;
REVOKE ALL ON FUNCTION sheet_worker_authorized(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sheet_worker_authorized(uuid,uuid,uuid,uuid) TO superagent_sheet_worker;
CREATE POLICY sheet_worker_delivery_read ON sheet_deliveries FOR SELECT TO superagent_sheet_worker
  USING(sheet_worker_authorized(tenant_id,order_id,NULL,NULL));
CREATE POLICY sheet_worker_delivery_update ON sheet_deliveries FOR UPDATE TO superagent_sheet_worker
  USING(status<>'SUCCEEDED' AND sheet_worker_authorized(tenant_id,order_id,NULL,NULL))
  WITH CHECK(sheet_worker_authorized(tenant_id,order_id,NULL,NULL));
GRANT SELECT ON sheet_deliveries TO superagent_sheet_worker;
GRANT UPDATE(status,attempt_id,attempt_by,lease_until,dispatched_at,completed_at,remote_range,evidence_kind,error_code,updated_at) ON sheet_deliveries TO superagent_sheet_worker;
CREATE POLICY sheet_worker_destination_read ON sheet_destinations FOR SELECT TO superagent_sheet_worker
  USING(sheet_worker_authorized(tenant_id,NULL,id,NULL));
GRANT SELECT(tenant_id,id,connection_id,spreadsheet_id,sheet_id) ON sheet_destinations TO superagent_sheet_worker;
CREATE POLICY sheet_worker_connection_read ON google_connections FOR SELECT TO superagent_sheet_worker
  USING(sheet_worker_authorized(tenant_id,NULL,NULL,id));
CREATE POLICY sheet_worker_connection_update ON google_connections FOR UPDATE TO superagent_sheet_worker
  USING(sheet_worker_authorized(tenant_id,NULL,NULL,id)) WITH CHECK(sheet_worker_authorized(tenant_id,NULL,NULL,id));
GRANT SELECT(tenant_id,id,status,credential_envelope,scopes,oauth_client_id,access_lease_id,access_lease_until,inspection_count,inspection_window) ON google_connections TO superagent_sheet_worker;
GRANT UPDATE(credential_envelope,access_lease_id,access_lease_until,inspection_count,inspection_window) ON google_connections TO superagent_sheet_worker;
