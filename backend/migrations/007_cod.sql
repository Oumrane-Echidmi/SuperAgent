CREATE TABLE conversations (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  channel text NOT NULL DEFAULT 'MANUAL' CHECK (channel = 'MANUAL'),
  ownership text NOT NULL DEFAULT 'HUMAN_ACTIVE' CHECK (ownership = 'HUMAN_ACTIVE'),
  customer_reference text NOT NULL,
  language text NOT NULL CHECK (language IN ('darija', 'fr')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE TABLE order_attempts (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'DECLINED')),
  current_revision integer NOT NULL DEFAULT 1 CHECK (current_revision > 0),
  initial_intent jsonb NOT NULL,
  confirmed_order_id uuid,
  created_by uuid NOT NULL REFERENCES users(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES conversations(tenant_id, id) ON DELETE CASCADE,
  CHECK ((status = 'CONFIRMED') = (confirmed_order_id IS NOT NULL)),
  CHECK (confirmed_order_id IS NULL OR confirmed_order_id = id)
);
CREATE UNIQUE INDEX one_pending_order_attempt ON order_attempts(tenant_id, conversation_id) WHERE status = 'PENDING';
CREATE INDEX order_attempt_outcomes_idx ON order_attempts(tenant_id, started_at);
CREATE TABLE order_attempt_revisions (
  tenant_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  revision integer NOT NULL,
  details jsonb NOT NULL,
  summary_hash text NOT NULL CHECK (summary_hash ~ '^[a-f0-9]{64}$'),
  policy_version text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, attempt_id, revision),
  UNIQUE (tenant_id, attempt_id, revision, summary_hash),
  FOREIGN KEY (tenant_id, attempt_id) REFERENCES order_attempts(tenant_id, id) ON DELETE CASCADE
);
ALTER TABLE order_attempts ADD FOREIGN KEY (tenant_id, id, current_revision)
  REFERENCES order_attempt_revisions(tenant_id, attempt_id, revision) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE order_decision_receipts (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  reviewed_revision integer NOT NULL,
  summary_hash text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('CONFIRM', 'DECLINE', 'AMBIGUOUS')),
  source text NOT NULL DEFAULT 'STAFF_RECORDED' CHECK (source = 'STAFF_RECORDED'),
  evidence text NOT NULL,
  request jsonb NOT NULL,
  outcome jsonb NOT NULL,
  order_id uuid,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, id, attempt_id),
  FOREIGN KEY (tenant_id, attempt_id) REFERENCES order_attempts(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, attempt_id, reviewed_revision, summary_hash)
    REFERENCES order_attempt_revisions(tenant_id, attempt_id, revision, summary_hash),
  CHECK ((decision = 'CONFIRM') = (order_id IS NOT NULL))
);
CREATE TABLE orders (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  reviewed_revision integer NOT NULL,
  summary_hash text NOT NULL,
  confirmation_event_id uuid NOT NULL,
  details jsonb NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 0 AND 1001000000000),
  currency text NOT NULL DEFAULT 'MAD' CHECK (currency = 'MAD'),
  status text NOT NULL DEFAULT 'CONFIRMED' CHECK (status = 'CONFIRMED'),
  policy_version text NOT NULL,
  confirmed_by uuid NOT NULL REFERENCES users(id),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id), UNIQUE (tenant_id, attempt_id), UNIQUE (tenant_id, confirmation_event_id),
  CHECK (id = attempt_id),
  CHECK ((details ?& ARRAY['item', 'quantity', 'recipient', 'phone', 'address', 'unitAmountMinor', 'deliveryAmountMinor']) IS TRUE),
  CHECK ((details->>'quantity')::integer BETWEEN 1 AND 1000),
  CHECK ((details->>'unitAmountMinor')::bigint BETWEEN 0 AND 1000000000),
  CHECK ((details->>'deliveryAmountMinor')::bigint BETWEEN 0 AND 1000000000),
  CHECK (amount_minor = (details->>'quantity')::bigint * (details->>'unitAmountMinor')::bigint + (details->>'deliveryAmountMinor')::bigint),
  FOREIGN KEY (tenant_id, attempt_id) REFERENCES order_attempts(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, attempt_id, reviewed_revision, summary_hash)
    REFERENCES order_attempt_revisions(tenant_id, attempt_id, revision, summary_hash),
  FOREIGN KEY (tenant_id, confirmation_event_id, attempt_id) REFERENCES order_decision_receipts(tenant_id, id, attempt_id) DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE order_attempts ADD FOREIGN KEY (tenant_id, confirmed_order_id) REFERENCES orders(tenant_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE order_decision_receipts ADD FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE sheet_sync_requests (
  tenant_id uuid NOT NULL,
  order_id uuid NOT NULL,
  operation_key text NOT NULL,
  status text NOT NULL DEFAULT 'AWAITING_CONNECTION' CHECK (status = 'AWAITING_CONNECTION'),
  payload jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, order_id), UNIQUE (tenant_id, operation_key),
  FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id) ON DELETE CASCADE,
  CHECK ((payload->>'orderId' = order_id::text) IS TRUE), CHECK ((payload->>'schemaVersion' = '1') IS TRUE)
);
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['conversations', 'order_attempts', 'order_attempt_revisions', 'order_decision_receipts', 'orders', 'sheet_sync_requests'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tab);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tab);
    EXECUTE format('CREATE POLICY member_read ON %I FOR SELECT TO superagent_app USING (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = %I.tenant_id))', tab, tab);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC', tab);
    EXECUTE format('GRANT SELECT, INSERT ON %I TO superagent_app', tab);
  END LOOP;
END $$;
CREATE POLICY conversation_create ON conversations FOR INSERT TO superagent_app
  WITH CHECK (channel = 'MANUAL' AND ownership = 'HUMAN_ACTIVE' AND created_by = nullif(current_setting('app.user_id', true), '')::uuid
    AND EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = conversations.tenant_id));
CREATE POLICY attempt_create ON order_attempts FOR INSERT TO superagent_app
  WITH CHECK (status = 'PENDING' AND current_revision = 1 AND confirmed_order_id IS NULL AND created_by = nullif(current_setting('app.user_id', true), '')::uuid
    AND EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = order_attempts.tenant_id));
CREATE POLICY attempt_update ON order_attempts FOR UPDATE TO superagent_app
  USING (status = 'PENDING' AND EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = order_attempts.tenant_id))
  WITH CHECK (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = order_attempts.tenant_id));
GRANT UPDATE (current_revision, status, confirmed_order_id) ON order_attempts TO superagent_app;
CREATE POLICY attempt_revision_create ON order_attempt_revisions FOR INSERT TO superagent_app
  WITH CHECK (created_by = nullif(current_setting('app.user_id', true), '')::uuid
    AND EXISTS (SELECT 1 FROM order_attempts a WHERE a.tenant_id = order_attempt_revisions.tenant_id AND a.id = attempt_id AND a.current_revision = revision AND a.status = 'PENDING'));
CREATE POLICY order_create ON orders FOR INSERT TO superagent_app
  WITH CHECK (confirmed_by = nullif(current_setting('app.user_id', true), '')::uuid
    AND EXISTS (SELECT 1 FROM order_attempts a JOIN order_attempt_revisions r ON r.tenant_id = a.tenant_id AND r.attempt_id = a.id AND r.revision = a.current_revision
      WHERE a.tenant_id = orders.tenant_id AND a.id = orders.attempt_id AND a.status = 'CONFIRMED' AND a.confirmed_order_id = orders.id
        AND r.details = orders.details AND r.summary_hash = orders.summary_hash AND r.revision = orders.reviewed_revision AND r.policy_version = orders.policy_version));
CREATE POLICY decision_create ON order_decision_receipts FOR INSERT TO superagent_app
  WITH CHECK (created_by = nullif(current_setting('app.user_id', true), '')::uuid
    AND EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = order_decision_receipts.tenant_id)
    AND (decision <> 'CONFIRM' OR EXISTS (SELECT 1 FROM orders o WHERE o.tenant_id = order_decision_receipts.tenant_id AND o.id = order_id AND o.confirmation_event_id = order_decision_receipts.id)));
CREATE POLICY sheet_intent_create ON sheet_sync_requests FOR INSERT TO superagent_app
  WITH CHECK (created_by = nullif(current_setting('app.user_id', true), '')::uuid
    AND EXISTS (SELECT 1 FROM orders o WHERE o.tenant_id = sheet_sync_requests.tenant_id AND o.id = order_id));
