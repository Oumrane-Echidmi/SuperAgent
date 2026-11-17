CREATE TABLE workspace_records (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('document','knowledge','agent','canvas','workflow','chat')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  content jsonb NOT NULL CHECK (jsonb_typeof(content)='object' AND octet_length(content::text)<=60000),
  initial_intent jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  archived boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id)
);
CREATE INDEX workspace_records_list ON workspace_records(tenant_id,kind,updated_at DESC,id);
ALTER TABLE workspace_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_records FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_read ON workspace_records FOR SELECT TO superagent_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id=workspace_records.tenant_id));
CREATE POLICY workspace_create ON workspace_records FOR INSERT TO superagent_app
  WITH CHECK (created_by=nullif(current_setting('app.user_id',true),'')::uuid AND
    EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id=workspace_records.tenant_id AND (m.role='OWNER' OR kind='chat')));
CREATE POLICY workspace_edit ON workspace_records FOR UPDATE TO superagent_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id=workspace_records.tenant_id AND (m.role='OWNER' OR kind='chat')))
  WITH CHECK (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id=workspace_records.tenant_id AND (m.role='OWNER' OR kind='chat')));
REVOKE ALL ON workspace_records FROM PUBLIC;
GRANT SELECT,INSERT ON workspace_records TO superagent_app;
GRANT UPDATE(title,content,revision,archived,updated_at) ON workspace_records TO superagent_app;

CREATE TABLE workspace_messages (
  tenant_id uuid NOT NULL,
  record_id uuid NOT NULL,
  id uuid NOT NULL,
  model text NOT NULL CHECK (model IN ('opus','sonnet','astra','sol')),
  text text NOT NULL CHECK (length(text) BETWEEN 1 AND 12000),
  role text NOT NULL DEFAULT 'user' CHECK (role='user'),
  status text NOT NULL DEFAULT 'AWAITING_PROVIDER' CHECK (status='AWAITING_PROVIDER'),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,record_id) REFERENCES workspace_records(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX workspace_messages_history ON workspace_messages(tenant_id,record_id,created_at,id);
ALTER TABLE workspace_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY message_read ON workspace_messages FOR SELECT TO superagent_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id=workspace_messages.tenant_id));
CREATE POLICY message_create ON workspace_messages FOR INSERT TO superagent_app
  WITH CHECK (created_by=nullif(current_setting('app.user_id',true),'')::uuid AND
    EXISTS (SELECT 1 FROM workspace_records r WHERE r.tenant_id=workspace_messages.tenant_id AND r.id=record_id AND r.kind='chat' AND NOT r.archived));
REVOKE ALL ON workspace_messages FROM PUBLIC;
GRANT SELECT,INSERT ON workspace_messages TO superagent_app;
