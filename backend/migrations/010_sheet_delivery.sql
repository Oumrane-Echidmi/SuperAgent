CREATE TABLE sheet_deliveries (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  destination_id uuid NOT NULL,
  expected_row jsonb NOT NULL CHECK (jsonb_typeof(expected_row)='array' AND jsonb_array_length(expected_row)=12),
  status text NOT NULL DEFAULT 'READY' CHECK (status IN ('READY','PREPARING','BLOCKED','DISPATCHED','UNKNOWN','SUCCEEDED')),
  attempt_id uuid,
  attempt_by uuid REFERENCES users(id),
  lease_until timestamptz,
  dispatched_at timestamptz,
  completed_at timestamptz,
  remote_range text CHECK (length(remote_range)<=500),
  evidence_kind text CHECK (evidence_kind IN ('APPEND_ACK','ROW_OBSERVED')),
  error_code text CHECK (error_code ~ '^[A-Z_]{1,60}$'),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,order_id),
  FOREIGN KEY (tenant_id,order_id) REFERENCES sheet_sync_requests(tenant_id,order_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,destination_id) REFERENCES sheet_destinations(tenant_id,id),
  CHECK ((expected_row->>0='cod:sheet:'||order_id::text AND expected_row->>1=order_id::text) IS TRUE),
  CHECK (
    (status='READY' AND attempt_id IS NULL AND attempt_by IS NULL AND lease_until IS NULL AND dispatched_at IS NULL)
    OR (status='PREPARING' AND attempt_id IS NOT NULL AND attempt_by IS NOT NULL AND lease_until IS NOT NULL AND dispatched_at IS NULL)
    OR (status='BLOCKED' AND attempt_id IS NOT NULL AND attempt_by IS NOT NULL AND lease_until IS NULL AND dispatched_at IS NULL)
    OR (status='DISPATCHED' AND attempt_id IS NOT NULL AND attempt_by IS NOT NULL AND lease_until IS NOT NULL AND dispatched_at IS NOT NULL)
    OR (status='UNKNOWN' AND attempt_id IS NOT NULL AND attempt_by IS NOT NULL AND lease_until IS NULL AND dispatched_at IS NOT NULL)
    OR (status='SUCCEEDED' AND attempt_id IS NOT NULL AND attempt_by IS NOT NULL AND lease_until IS NULL)
  ),
  CHECK ((status='SUCCEEDED')=(remote_range IS NOT NULL AND evidence_kind IS NOT NULL AND completed_at IS NOT NULL)),
  CHECK (status='SUCCEEDED' OR (remote_range IS NULL AND evidence_kind IS NULL AND completed_at IS NULL))
);
CREATE INDEX sheet_deliveries_destination ON sheet_deliveries(tenant_id,destination_id);
CREATE FUNCTION guard_sheet_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF OLD.dispatched_at IS NOT NULL AND (NEW.dispatched_at IS DISTINCT FROM OLD.dispatched_at
    OR NEW.attempt_id IS DISTINCT FROM OLD.attempt_id OR NEW.attempt_by IS DISTINCT FROM OLD.attempt_by
    OR NEW.status NOT IN ('DISPATCHED','UNKNOWN','SUCCEEDED')) THEN
    RAISE EXCEPTION 'A dispatched delivery cannot be restarted' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sheet_dispatch_guard BEFORE UPDATE ON sheet_deliveries FOR EACH ROW EXECUTE FUNCTION guard_sheet_dispatch();
REVOKE ALL ON FUNCTION guard_sheet_dispatch() FROM PUBLIC;
ALTER TABLE sheet_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE sheet_deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY sheet_delivery_read ON sheet_deliveries FOR SELECT TO superagent_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id=sheet_deliveries.tenant_id));
CREATE POLICY sheet_delivery_create ON sheet_deliveries FOR INSERT TO superagent_app
  WITH CHECK (created_by=nullif(current_setting('app.user_id',true),'')::uuid AND status='READY'
    AND EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id=sheet_deliveries.tenant_id AND m.role='OWNER')
    AND EXISTS (SELECT 1 FROM sheet_destinations d WHERE d.tenant_id=sheet_deliveries.tenant_id AND d.id=destination_id));
CREATE POLICY sheet_delivery_update ON sheet_deliveries FOR UPDATE TO superagent_app
  USING (status<>'SUCCEEDED' AND EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id=sheet_deliveries.tenant_id AND m.role='OWNER'))
  WITH CHECK (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id=sheet_deliveries.tenant_id AND m.role='OWNER'));
REVOKE ALL ON sheet_deliveries FROM PUBLIC;
GRANT SELECT,INSERT ON sheet_deliveries TO superagent_app;
GRANT UPDATE(status,attempt_id,attempt_by,lease_until,dispatched_at,completed_at,remote_range,evidence_kind,error_code,updated_at) ON sheet_deliveries TO superagent_app;
