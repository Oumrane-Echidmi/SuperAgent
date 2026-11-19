-- WhatsApp Cloud API intake: a business number maps to exactly one tenant,
-- and verified inbound text messages are stored once per provider message id.
CREATE TABLE whatsapp_numbers (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  phone_number_id text NOT NULL CHECK (phone_number_id ~ '^[0-9]{5,32}$'),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 100),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (phone_number_id)
);
ALTER TABLE whatsapp_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_numbers FORCE ROW LEVEL SECURITY;
CREATE POLICY whatsapp_number_read ON whatsapp_numbers FOR SELECT TO superagent_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = whatsapp_numbers.tenant_id));
CREATE POLICY whatsapp_number_owner_insert ON whatsapp_numbers FOR INSERT TO superagent_app
  WITH CHECK (created_by = nullif(current_setting('app.user_id', true), '')::uuid
    AND EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = whatsapp_numbers.tenant_id AND m.role = 'OWNER'));
REVOKE ALL ON whatsapp_numbers FROM PUBLIC;
GRANT SELECT, INSERT ON whatsapp_numbers TO superagent_app;

CREATE TABLE whatsapp_messages (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  message_id text NOT NULL CHECK (length(message_id) BETWEEN 1 AND 200),
  phone_number_id text NOT NULL,
  customer_phone text NOT NULL CHECK (customer_phone ~ '^[0-9]{5,20}$'),
  message_type text NOT NULL CHECK (length(message_type) BETWEEN 1 AND 40),
  body text CHECK (body IS NULL OR length(body) <= 4096),
  sent_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, message_id)
);
CREATE INDEX whatsapp_messages_tenant_received ON whatsapp_messages(tenant_id, received_at DESC, message_id);
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY whatsapp_message_read ON whatsapp_messages FOR SELECT TO superagent_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = whatsapp_messages.tenant_id));
REVOKE ALL ON whatsapp_messages FROM PUBLIC;
GRANT SELECT ON whatsapp_messages TO superagent_app;

-- The webhook has no user session. This definer function is the only write path:
-- it resolves the tenant from the registered number and ignores unknown numbers.
CREATE FUNCTION record_whatsapp_message(p_phone_number_id text, p_message_id text, p_customer_phone text,
  p_message_type text, p_body text, p_sent_at timestamptz) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM whatsapp_numbers WHERE phone_number_id = p_phone_number_id;
  IF v_tenant IS NULL THEN RETURN 'UNKNOWN_NUMBER'; END IF;
  INSERT INTO whatsapp_messages(tenant_id, message_id, phone_number_id, customer_phone, message_type, body, sent_at)
    VALUES (v_tenant, p_message_id, p_phone_number_id, p_customer_phone, p_message_type, left(p_body, 4096), p_sent_at)
    ON CONFLICT (tenant_id, message_id) DO NOTHING;
  IF NOT FOUND THEN RETURN 'DUPLICATE'; END IF;
  RETURN 'RECORDED';
END $$;
REVOKE ALL ON FUNCTION record_whatsapp_message(text, text, text, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_whatsapp_message(text, text, text, text, text, timestamptz) TO superagent_app;
