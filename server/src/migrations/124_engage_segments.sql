-- WP-36: rule-based segments and the scheduled segment trigger (ADR-013).
--   * engage.segments names a segment per tenant; engage.segment_versions holds an immutable definition (a change is a
--     new version). A journey pins one version, so changing who a journey targets is a new journey version and goes
--     through approval (ADR-011); nothing re-targets a running journey behind its approval.
--   * engage.segment_runs records each scheduled run of a segment-triggered journey, one row per (journey, slot): the
--     claim that makes a run happen once, its counts, and a keyset cursor so an interrupted run resumes.
--   * Enrollments started by a run have trigger_kind 'segment' and the key segment:<slot>, so a customer is enrolled at
--     most once per run (the unique key of migration 121), whatever retries or concurrent workers do.
--   * engage.due_segment_work lists segment-triggered journeys across tenants (ids only), like the lists of 121-123.

CREATE TABLE IF NOT EXISTS engage.segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, key)
);

CREATE TABLE IF NOT EXISTS engage.segment_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  segment_id uuid NOT NULL,
  version integer NOT NULL CHECK (version BETWEEN 1 AND 100000),
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object' AND octet_length(definition::text) <= 65536),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, segment_id, version),
  FOREIGN KEY (organization_id, segment_id) REFERENCES engage.segments (organization_id, id)
);

CREATE TABLE IF NOT EXISTS engage.segment_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  journey_id uuid NOT NULL,
  journey_version_id uuid NOT NULL,
  segment_version_id uuid NOT NULL,
  -- The scheduled moment this run belongs to. The segment is evaluated as of this moment.
  slot_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed')),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  matched integer NOT NULL DEFAULT 0 CHECK (matched >= 0),
  enrolled integer NOT NULL DEFAULT 0 CHECK (enrolled >= 0),
  skipped integer NOT NULL DEFAULT 0 CHECK (skipped >= 0),
  truncated boolean NOT NULL DEFAULT false,
  last_profile_id uuid,
  error_code text CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_]{1,64}$'),
  UNIQUE (organization_id, journey_id, slot_at),
  FOREIGN KEY (organization_id, journey_id) REFERENCES engage.journeys (organization_id, id),
  FOREIGN KEY (organization_id, journey_version_id) REFERENCES engage.journey_versions (organization_id, id),
  FOREIGN KEY (organization_id, segment_version_id) REFERENCES engage.segment_versions (organization_id, id),
  CHECK ((status = 'running') = (finished_at IS NULL)),
  CHECK (matched = enrolled + skipped)
);

-- A finished run stays finished, and a run keeps its identity.
CREATE OR REPLACE FUNCTION engage.segment_run_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'running' THEN RAISE EXCEPTION 'a finished segment run cannot change' USING ERRCODE = '42501'; END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.journey_id IS DISTINCT FROM OLD.journey_id
     OR NEW.journey_version_id IS DISTINCT FROM OLD.journey_version_id OR NEW.segment_version_id IS DISTINCT FROM OLD.segment_version_id
     OR NEW.slot_at IS DISTINCT FROM OLD.slot_at OR NEW.started_at IS DISTINCT FROM OLD.started_at THEN
    RAISE EXCEPTION 'a segment run''s identity cannot change' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS segment_run_guard ON engage.segment_runs;
CREATE TRIGGER segment_run_guard BEFORE UPDATE ON engage.segment_runs FOR EACH ROW EXECUTE FUNCTION engage.segment_run_guard();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['segments', 'segment_versions', 'segment_runs'] LOOP
    EXECUTE format('ALTER TABLE engage.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE engage.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON engage.%I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON engage.%I FOR ALL
      USING (organization_id = engage.current_org_id())
      WITH CHECK (organization_id = engage.current_org_id())', t);
  END LOOP;
END $$;

REVOKE UPDATE, DELETE ON engage.segments, engage.segment_versions, engage.segment_runs FROM messign_engage;
GRANT UPDATE (status, claimed_at, finished_at, matched, enrolled, skipped, truncated, last_profile_id, error_code) ON engage.segment_runs TO messign_engage;

-- Enrollments can now also start from a segment run.
ALTER TABLE engage.enrollments DROP CONSTRAINT IF EXISTS enrollments_trigger_kind_check;
ALTER TABLE engage.enrollments ADD CONSTRAINT enrollments_trigger_kind_check CHECK (trigger_kind IN ('event', 'api', 'segment'));

CREATE OR REPLACE FUNCTION engage.due_segment_work(p_orgs uuid[] DEFAULT NULL)
RETURNS TABLE (organization_id uuid, journey_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT v.organization_id, v.journey_id FROM engage.journey_versions v
   WHERE v.activated_at IS NOT NULL AND v.deactivated_at IS NULL AND v.definition->'trigger'->>'type' = 'segment'
     AND (p_orgs IS NULL OR v.organization_id = ANY (p_orgs))
   ORDER BY v.organization_id, v.journey_id LIMIT 1000
$$;
REVOKE ALL ON FUNCTION engage.due_segment_work(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION engage.due_segment_work(uuid[]) TO messign_engage;
