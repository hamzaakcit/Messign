-- WP-04: engage schema, tenancy foundation (ADR-002, ADR-004).
-- New tables only plus one defaulted column on organizations, so no legacy writer can break.
-- Every engage.* table: organization_id NOT NULL, ENABLE + FORCE RLS, tenant policy in this same migration.
-- Needs an admin role with CREATEROLE (the migration runner's role). The engage role is created
-- NOLOGIN here; the operator sets its login and password out of band (db/scripts/create_engage_role.sql).

CREATE SCHEMA IF NOT EXISTS engage;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'messign_engage') THEN
    CREATE ROLE messign_engage NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
ALTER ROLE messign_engage NOSUPERUSER NOBYPASSRLS;

-- Own tenant function: legacy current_tenant_id() lives in scripts outside the runner, so a fresh DB lacks it.
-- Reads the same transaction-local setting that withTenantQuery sets. Empty or unset means no tenant (NULL).
CREATE OR REPLACE FUNCTION engage.current_org_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_tenant', true), '')::uuid
$$;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS product text NOT NULL DEFAULT 'workspace';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_product_check') THEN
    ALTER TABLE organizations
      ADD CONSTRAINT organizations_product_check CHECK (product IN ('workspace', 'engage'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS engage.tenant_settings (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'Europe/Istanbul',
  quiet_hours_start time,
  quiet_hours_end time,
  event_retention_days integer NOT NULL DEFAULT 365 CHECK (event_retention_days > 0),
  send_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS engage.tenant_readiness (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel text NOT NULL,
  item text NOT NULL,
  value text NOT NULL,
  evidence_url text,
  recorded_by uuid,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, channel, item)
);

CREATE TABLE IF NOT EXISTS engage.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT '{}',
  rate_limit_per_min integer NOT NULL DEFAULT 600 CHECK (rate_limit_per_min > 0),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS api_keys_org_idx ON engage.api_keys (organization_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenant_settings', 'tenant_readiness', 'api_keys'] LOOP
    EXECUTE format('ALTER TABLE engage.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE engage.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON engage.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON engage.%I FOR ALL
         USING (organization_id = engage.current_org_id())
         WITH CHECK (organization_id = engage.current_org_id())', t);
  END LOOP;
END $$;

-- An API key request has no tenant yet. Allow reading exactly the row whose hash the caller presents
-- (set transaction-locally by the engage pool); writes still need the tenant policy above.
DROP POLICY IF EXISTS api_key_lookup ON engage.api_keys;
CREATE POLICY api_key_lookup ON engage.api_keys FOR SELECT
  USING (key_hash = NULLIF(current_setting('engage.lookup_key_hash', true), ''));

-- Auth lookup of the legacy user row. The engage role gets no direct access to legacy tables.
CREATE OR REPLACE FUNCTION engage.lookup_user(p_auth_user_id text)
RETURNS TABLE (user_id uuid, role text, organization_id uuid, org_slug text, org_product text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT u.id, u.role::text, u.organization_id, o.slug::text, o.product
  FROM public.reimbursement_users u
  JOIN public.organizations o ON o.id = u.organization_id
  WHERE u.auth_user_id = p_auth_user_id
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION engage.lookup_user(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION engage.lookup_user(text) TO messign_engage;

GRANT USAGE ON SCHEMA engage TO messign_engage;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA engage TO messign_engage;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA engage TO messign_engage;
GRANT EXECUTE ON FUNCTION engage.current_org_id() TO messign_engage;
ALTER DEFAULT PRIVILEGES IN SCHEMA engage GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO messign_engage;
ALTER DEFAULT PRIVILEGES IN SCHEMA engage GRANT USAGE, SELECT ON SEQUENCES TO messign_engage;
