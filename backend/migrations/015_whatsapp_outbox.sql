-- Outbound WhatsApp messages. A workflow step only records the intent here (inside its own transaction);
-- a separate sender delivers it, so no network call ever runs inside a database transaction.
CREATE TABLE whatsapp_outbox (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  run_id uuid NOT NULL,
  node_id text NOT NULL,
  phone_number_id text NOT NULL CHECK (phone_number_id ~ '^[0-9]{5,32}$'),
  to_phone text NOT NULL CHECK (to_phone ~ '^[0-9]{5,20}$'),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4096),
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'SENDING', 'SENT', 'FAILED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_until timestamptz,
  provider_message_id text CHECK (provider_message_id IS NULL OR length(provider_message_id) <= 200),
  error_code text CHECK (error_code IS NULL OR length(error_code) <= 80),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  sent_at timestamptz,
  PRIMARY KEY (tenant_id, id),
  -- One message per workflow node per run: a replayed step cannot queue a duplicate.
  UNIQUE (tenant_id, run_id, node_id),
  FOREIGN KEY (tenant_id, run_id) REFERENCES workflow_runs(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX whatsapp_outbox_claim ON whatsapp_outbox(status, lease_until, created_at);
CREATE INDEX whatsapp_outbox_tenant ON whatsapp_outbox(tenant_id, created_at DESC, id);
ALTER TABLE whatsapp_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY outbox_read ON whatsapp_outbox FOR SELECT TO superagent_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = whatsapp_outbox.tenant_id));
CREATE POLICY outbox_insert ON whatsapp_outbox FOR INSERT TO superagent_app
  WITH CHECK (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = whatsapp_outbox.tenant_id AND m.role = 'OWNER'));
REVOKE ALL ON whatsapp_outbox FROM PUBLIC;
GRANT SELECT, INSERT ON whatsapp_outbox TO superagent_app;

-- Cross-tenant claim for the sender. A lease lets a crashed sender's message be retried (at-least-once);
-- a message is failed after five claims.
CREATE FUNCTION claim_whatsapp_outbox() RETURNS TABLE(tenant_id uuid, message_id uuid, phone_number_id text, to_phone text, body text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid; v_id uuid;
BEGIN
  UPDATE whatsapp_outbox o SET status = 'FAILED', error_code = coalesce(o.error_code, 'RETRIES_EXHAUSTED'), lease_until = NULL
    WHERE o.status IN ('SENDING', 'QUEUED') AND o.attempts >= 5 AND (o.lease_until IS NULL OR o.lease_until <= clock_timestamp());
  SELECT o.tenant_id, o.id INTO v_tenant, v_id FROM whatsapp_outbox o
    WHERE (o.status = 'QUEUED' OR o.status = 'SENDING') AND (o.lease_until IS NULL OR o.lease_until <= clock_timestamp())
    ORDER BY o.created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF v_id IS NULL THEN RETURN; END IF;
  UPDATE whatsapp_outbox o SET status = 'SENDING', attempts = o.attempts + 1, lease_until = clock_timestamp() + interval '120 seconds'
    WHERE o.tenant_id = v_tenant AND o.id = v_id;
  RETURN QUERY SELECT o.tenant_id, o.id, o.phone_number_id, o.to_phone, o.body FROM whatsapp_outbox o WHERE o.tenant_id = v_tenant AND o.id = v_id;
END $$;
REVOKE ALL ON FUNCTION claim_whatsapp_outbox() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_whatsapp_outbox() TO superagent_app;

-- p_retry = true returns the message to the queue (transient failure); otherwise the outcome is final.
CREATE FUNCTION finish_whatsapp_outbox(p_tenant uuid, p_id uuid, p_sent boolean, p_provider_id text, p_error text, p_retry boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_sent THEN
    UPDATE whatsapp_outbox SET status = 'SENT', provider_message_id = left(p_provider_id, 200), sent_at = clock_timestamp(), lease_until = NULL, error_code = NULL
      WHERE tenant_id = p_tenant AND id = p_id AND status = 'SENDING';
  ELSIF p_retry THEN
    UPDATE whatsapp_outbox SET status = 'QUEUED', error_code = left(p_error, 80), lease_until = clock_timestamp() + interval '15 seconds' * attempts
      WHERE tenant_id = p_tenant AND id = p_id AND status = 'SENDING';
  ELSE
    UPDATE whatsapp_outbox SET status = 'FAILED', error_code = left(p_error, 80), lease_until = NULL
      WHERE tenant_id = p_tenant AND id = p_id AND status = 'SENDING';
  END IF;
END $$;
REVOKE ALL ON FUNCTION finish_whatsapp_outbox(uuid, uuid, boolean, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finish_whatsapp_outbox(uuid, uuid, boolean, text, text, boolean) TO superagent_app;
