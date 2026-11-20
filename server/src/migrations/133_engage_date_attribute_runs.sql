-- WP-25: the date-attribute trigger (ADR-021).
--   * A journey whose trigger is `date_attribute {attribute, offset_days, at_local_time}` starts for the customers whose
--     date attribute (an anniversary, a birthday) falls `offset_days` from a given day, every year. One scheduled run per
--     (journey, local day) is claimed in engage.date_runs, like a segment run (124): the claim makes a day happen once, the
--     counts are exact, and a keyset cursor lets an interrupted run resume.
--   * An enrollment started by a run has trigger_kind 'date' and the key date:<occurrence>:<customer>, so a customer is
--     enrolled at most once per occurrence (the unique trigger key of 121), whatever retries or concurrent workers do.
--   * engage.due_date_work lists date-triggered journeys across tenants (ids only), like the lists of 121-124.

CREATE TABLE IF NOT EXISTS engage.date_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  journey_id uuid NOT NULL,
  journey_version_id uuid NOT NULL,
  -- The tenant's local calendar day this run belongs to, and the moment of that day it was scheduled for.
  slot_date date NOT NULL,
  slot_at timestamptz NOT NULL,
  -- The date the matched customers' occasion falls on: slot_date minus the journey's offset_days.
  occurrence_date date NOT NULL,
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
  UNIQUE (organization_id, journey_id, slot_date),
  FOREIGN KEY (organization_id, journey_id) REFERENCES engage.journeys (organization_id, id),
  FOREIGN KEY (organization_id, journey_version_id) REFERENCES engage.journey_versions (organization_id, id),
  CHECK ((status = 'running') = (finished_at IS NULL)),
  CHECK (matched = enrolled + skipped)
);

-- The foreign key to the journey version needs its own index (the journey's is covered by the unique key above).
CREATE INDEX IF NOT EXISTS date_runs_journey_version_idx ON engage.date_runs (organization_id, journey_version_id);

-- A finished run stays finished, and a run keeps its identity.
CREATE OR REPLACE FUNCTION engage.date_run_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'running' THEN RAISE EXCEPTION 'a finished date run cannot change' USING ERRCODE = '42501'; END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.journey_id IS DISTINCT FROM OLD.journey_id
     OR NEW.journey_version_id IS DISTINCT FROM OLD.journey_version_id OR NEW.slot_date IS DISTINCT FROM OLD.slot_date
     OR NEW.slot_at IS DISTINCT FROM OLD.slot_at OR NEW.occurrence_date IS DISTINCT FROM OLD.occurrence_date
     OR NEW.started_at IS DISTINCT FROM OLD.started_at THEN
    RAISE EXCEPTION 'a date run''s identity cannot change' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS date_run_guard ON engage.date_runs;
CREATE TRIGGER date_run_guard BEFORE UPDATE ON engage.date_runs FOR EACH ROW EXECUTE FUNCTION engage.date_run_guard();

ALTER TABLE engage.date_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE engage.date_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON engage.date_runs;
CREATE POLICY tenant_isolation ON engage.date_runs FOR ALL
  USING (organization_id = engage.current_org_id())
  WITH CHECK (organization_id = engage.current_org_id());

REVOKE UPDATE, DELETE ON engage.date_runs FROM messign_engage;
GRANT UPDATE (status, claimed_at, finished_at, matched, enrolled, skipped, truncated, last_profile_id, error_code) ON engage.date_runs TO messign_engage;

-- Enrollments can now also start from a date run.
ALTER TABLE engage.enrollments DROP CONSTRAINT IF EXISTS enrollments_trigger_kind_check;
ALTER TABLE engage.enrollments ADD CONSTRAINT enrollments_trigger_kind_check CHECK (trigger_kind IN ('event', 'api', 'segment', 'date'));

CREATE OR REPLACE FUNCTION engage.due_date_work(p_orgs uuid[] DEFAULT NULL)
RETURNS TABLE (organization_id uuid, journey_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT v.organization_id, v.journey_id FROM engage.journey_versions v
   WHERE v.activated_at IS NOT NULL AND v.deactivated_at IS NULL AND v.definition->'trigger'->>'type' = 'date_attribute'
     AND (p_orgs IS NULL OR v.organization_id = ANY (p_orgs))
   ORDER BY v.organization_id, v.journey_id LIMIT 1000
$$;
REVOKE ALL ON FUNCTION engage.due_date_work(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION engage.due_date_work(uuid[]) TO messign_engage;
