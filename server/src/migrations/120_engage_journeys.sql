-- WP-15: journey definitions, versions, approval and activation (target-state D, principle 7).
--   * engage.journeys names a journey per tenant; its key is what the trigger API and events address.
--   * engage.journey_versions holds an immutable definition (validated by the application against the v1 schema).
--   * Lifecycle per version, enforced here and not only in code (principle 4):
--       created -> approved (a person, recorded) -> activated (recorded) -> deactivated (recorded)
--     A version cannot be activated without approval (CHECK), each step happens once and never goes back (trigger),
--     a deactivated version is never reactivated (a rollback is a new version), and a journey has at most one active
--     version (partial unique index). The definition itself can never change (no column grant).

CREATE TABLE IF NOT EXISTS engage.journeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, key)
);

CREATE TABLE IF NOT EXISTS engage.journey_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  journey_id uuid NOT NULL,
  version integer NOT NULL CHECK (version BETWEEN 1 AND 100000),
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object' AND octet_length(definition::text) <= 262144),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  activated_by uuid,
  activated_at timestamptz,
  deactivated_by uuid,
  deactivated_at timestamptz,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, journey_id, version),
  FOREIGN KEY (organization_id, journey_id) REFERENCES engage.journeys (organization_id, id),
  CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
  CHECK ((activated_at IS NULL) = (activated_by IS NULL)),
  CHECK ((deactivated_at IS NULL) = (deactivated_by IS NULL)),
  -- The acceptance criterion of WP-15: no activation without approval.
  CHECK (activated_at IS NULL OR approved_at IS NOT NULL),
  CHECK (deactivated_at IS NULL OR activated_at IS NOT NULL),
  CHECK (approved_at IS NULL OR approved_at >= created_at),
  CHECK (activated_at IS NULL OR activated_at >= approved_at),
  CHECK (deactivated_at IS NULL OR deactivated_at >= activated_at)
);

-- At most one active version per journey.
CREATE UNIQUE INDEX IF NOT EXISTS journey_versions_one_active_uq
  ON engage.journey_versions (organization_id, journey_id)
  WHERE activated_at IS NOT NULL AND deactivated_at IS NULL;

-- Each lifecycle step is written once and never changed or undone.
CREATE OR REPLACE FUNCTION engage.journey_version_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.journey_id IS DISTINCT FROM OLD.journey_id
     OR NEW.version IS DISTINCT FROM OLD.version OR NEW.definition IS DISTINCT FROM OLD.definition
     OR NEW.schema_version IS DISTINCT FROM OLD.schema_version
     OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'a journey version is immutable' USING ERRCODE = '42501';
  END IF;
  IF (OLD.approved_at IS NOT NULL AND (NEW.approved_at IS DISTINCT FROM OLD.approved_at OR NEW.approved_by IS DISTINCT FROM OLD.approved_by))
     OR (OLD.activated_at IS NOT NULL AND (NEW.activated_at IS DISTINCT FROM OLD.activated_at OR NEW.activated_by IS DISTINCT FROM OLD.activated_by))
     OR (OLD.deactivated_at IS NOT NULL AND (NEW.deactivated_at IS DISTINCT FROM OLD.deactivated_at OR NEW.deactivated_by IS DISTINCT FROM OLD.deactivated_by)) THEN
    RAISE EXCEPTION 'a journey version lifecycle step cannot be changed or undone' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS journey_version_lifecycle ON engage.journey_versions;
CREATE TRIGGER journey_version_lifecycle BEFORE UPDATE ON engage.journey_versions
  FOR EACH ROW EXECUTE FUNCTION engage.journey_version_lifecycle();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['journeys', 'journey_versions'] LOOP
    EXECUTE format('ALTER TABLE engage.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE engage.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON engage.%I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON engage.%I FOR ALL
      USING (organization_id = engage.current_org_id())
      WITH CHECK (organization_id = engage.current_org_id())', t);
  END LOOP;
END $$;

-- Grants: nothing is deleted; only the lifecycle columns of a version can be written after insert.
REVOKE UPDATE, DELETE ON engage.journeys, engage.journey_versions FROM messign_engage;
GRANT UPDATE (approved_by, approved_at, activated_by, activated_at, deactivated_by, deactivated_at) ON engage.journey_versions TO messign_engage;
