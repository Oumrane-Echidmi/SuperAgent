CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (length(email) <= 254),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tenants (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE memberships (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('OWNER', 'STAFF')),
  PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX memberships_user_idx ON memberships(user_id);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE auth_limits (
  key text PRIMARY KEY,
  attempts integer NOT NULL,
  window_start timestamptz NOT NULL
);
CREATE TABLE business_profiles (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  language text NOT NULL DEFAULT 'darija' CHECK (language IN ('darija', 'fr')),
  timezone text NOT NULL DEFAULT 'Africa/Casablanca',
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 4000),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_profiles FORCE ROW LEVEL SECURITY;

CREATE POLICY membership_read ON memberships FOR SELECT TO superagent_app
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
CREATE POLICY membership_create ON memberships FOR INSERT TO superagent_app
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid
    AND role = 'OWNER' AND EXISTS (SELECT 1 FROM tenants t WHERE t.id = tenant_id AND t.created_by = user_id));
CREATE POLICY tenant_read ON tenants FOR SELECT TO superagent_app
  USING (created_by = nullif(current_setting('app.user_id', true), '')::uuid
    OR EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = id));
CREATE POLICY tenant_create ON tenants FOR INSERT TO superagent_app
  WITH CHECK (created_by = nullif(current_setting('app.user_id', true), '')::uuid);
CREATE POLICY profile_read ON business_profiles FOR SELECT TO superagent_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = business_profiles.tenant_id));
CREATE POLICY profile_create ON business_profiles FOR INSERT TO superagent_app
  WITH CHECK (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = business_profiles.tenant_id AND m.role = 'OWNER'));
CREATE POLICY profile_update ON business_profiles FOR UPDATE TO superagent_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = business_profiles.tenant_id AND m.role = 'OWNER'))
  WITH CHECK (EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = business_profiles.tenant_id AND m.role = 'OWNER'));

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
GRANT SELECT, INSERT ON users, sessions, tenants, memberships TO superagent_app;
GRANT DELETE ON sessions TO superagent_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_limits TO superagent_app;
GRANT SELECT, INSERT, UPDATE ON business_profiles TO superagent_app;
