-- WP-16: the journey executor's state (ADR-003, ADR-007, ADR-011).
--   * engage.enrollments: one row per profile entering an active journey version. The trigger key (the event id, or
--     the API idempotency key) is unique per journey, so a replayed event or a retried API call never enrolls twice,
--     and a profile has at most one active enrollment per journey.
--   * engage.enrollment_steps: one row per step per enrollment, written once. The executor reads it before acting, so
--     running an enrollment again (a retried job, a crash, two workers) never repeats a step's effect.
--   * The database rows are the truth; pg-boss only wakes the executor up (ADR-007's outbox variant).

CREATE TABLE IF NOT EXISTS engage.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  journey_id uuid NOT NULL,
  journey_version_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  trigger_kind text NOT NULL CHECK (trigger_kind IN ('event', 'api')),
  trigger_key text NOT NULL CHECK (char_length(trigger_key) BETWEEN 1 AND 250),
  request_hash text CHECK (request_hash IS NULL OR request_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  -- When the trigger happened (the event's occurred_at, or when the API call arrived). Exit events count from here.
  entered_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'exited', 'failed')),
  current_step text NOT NULL CHECK (char_length(current_step) BETWEEN 1 AND 32),
  next_run_at timestamptz NOT NULL,
  end_reason text CHECK (end_reason IS NULL OR end_reason ~ '^[a-z0-9_]{1,64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, journey_id, trigger_key),
  FOREIGN KEY (organization_id, journey_id) REFERENCES engage.journeys (organization_id, id),
  FOREIGN KEY (organization_id, journey_version_id) REFERENCES engage.journey_versions (organization_id, id),
  FOREIGN KEY (organization_id, profile_id) REFERENCES engage.profiles (organization_id, id),
  CHECK ((status = 'active') = (ended_at IS NULL)),
  CHECK ((status = 'active') = (end_reason IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS enrollments_one_active_uq ON engage.enrollments (organization_id, journey_id, profile_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS enrollments_due_idx ON engage.enrollments (next_run_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS enrollments_profile_idx ON engage.enrollments (organization_id, profile_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS engage.enrollment_steps (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL,
  step_id text NOT NULL CHECK (char_length(step_id) BETWEEN 1 AND 32),
  step_type text NOT NULL CHECK (step_type IN ('delay', 'wait_until', 'branch', 'message', 'exit')),
  status text NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'done')),
  started_at timestamptz NOT NULL,
  -- delay: when to continue; wait_until: the deadline.
  wake_at timestamptz,
  outcome text CHECK (outcome IS NULL OR outcome ~ '^[a-z_]{1,32}$'),
  next_step text CHECK (next_step IS NULL OR char_length(next_step) BETWEEN 1 AND 32),
  done_at timestamptz,
  UNIQUE (organization_id, enrollment_id, step_id),
  FOREIGN KEY (organization_id, enrollment_id) REFERENCES engage.enrollments (organization_id, id),
  CHECK ((status = 'done') = (done_at IS NOT NULL)),
  CHECK (status = 'started' OR outcome IS NOT NULL)
);

-- An ended enrollment stays ended, and a finished step stays finished (no resurrection, no re-running).
CREATE OR REPLACE FUNCTION engage.enrollment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'active' THEN RAISE EXCEPTION 'an ended enrollment cannot change' USING ERRCODE = '42501'; END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.journey_id IS DISTINCT FROM OLD.journey_id
     OR NEW.journey_version_id IS DISTINCT FROM OLD.journey_version_id OR NEW.profile_id IS DISTINCT FROM OLD.profile_id
     OR NEW.trigger_key IS DISTINCT FROM OLD.trigger_key OR NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.entered_at IS DISTINCT FROM OLD.entered_at THEN
    RAISE EXCEPTION 'an enrollment''s identity cannot change' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enrollment_guard ON engage.enrollments;
CREATE TRIGGER enrollment_guard BEFORE UPDATE ON engage.enrollments FOR EACH ROW EXECUTE FUNCTION engage.enrollment_guard();

CREATE OR REPLACE FUNCTION engage.enrollment_step_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'done' THEN RAISE EXCEPTION 'a finished step cannot change' USING ERRCODE = '42501'; END IF;
  IF NEW.enrollment_id IS DISTINCT FROM OLD.enrollment_id OR NEW.step_id IS DISTINCT FROM OLD.step_id
     OR NEW.started_at IS DISTINCT FROM OLD.started_at OR NEW.wake_at IS DISTINCT FROM OLD.wake_at THEN
    RAISE EXCEPTION 'a step''s start cannot change' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enrollment_step_guard ON engage.enrollment_steps;
CREATE TRIGGER enrollment_step_guard BEFORE UPDATE ON engage.enrollment_steps FOR EACH ROW EXECUTE FUNCTION engage.enrollment_step_guard();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['enrollments', 'enrollment_steps'] LOOP
    EXECUTE format('ALTER TABLE engage.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE engage.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON engage.%I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON engage.%I FOR ALL
      USING (organization_id = engage.current_org_id())
      WITH CHECK (organization_id = engage.current_org_id())', t);
  END LOOP;
END $$;

REVOKE UPDATE, DELETE ON engage.enrollments, engage.enrollment_steps FROM messign_engage;
GRANT UPDATE (status, current_step, next_run_at, end_reason, updated_at, ended_at) ON engage.enrollments TO messign_engage;
GRANT UPDATE (status, outcome, next_step, done_at) ON engage.enrollment_steps TO messign_engage;

-- The scheduler has to find work across tenants. These two functions return identifiers only (tenant and row id),
-- never content; the work itself is then done inside that tenant's context. They run as the migration owner, which
-- must be a superuser or have BYPASSRLS for the forced RLS above (true on Railway and in the test harness).
CREATE OR REPLACE FUNCTION engage.pending_trigger_work(p_limit integer)
RETURNS TABLE (organization_id uuid, outbox_id bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT o.organization_id, o.id FROM engage.trigger_outbox o
   WHERE o.status = 'pending' ORDER BY o.id LIMIT LEAST(GREATEST(p_limit, 1), 1000)
$$;
CREATE OR REPLACE FUNCTION engage.due_enrollment_work(p_limit integer, p_now timestamptz)
RETURNS TABLE (organization_id uuid, enrollment_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT e.organization_id, e.id FROM engage.enrollments e
   WHERE e.status = 'active' AND e.next_run_at <= p_now ORDER BY e.next_run_at LIMIT LEAST(GREATEST(p_limit, 1), 1000)
$$;
REVOKE ALL ON FUNCTION engage.pending_trigger_work(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION engage.due_enrollment_work(integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION engage.pending_trigger_work(integer) TO messign_engage;
GRANT EXECUTE ON FUNCTION engage.due_enrollment_work(integer, timestamptz) TO messign_engage;
