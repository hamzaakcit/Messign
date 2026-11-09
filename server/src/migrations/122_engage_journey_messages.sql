-- WP-17: holdout, message steps and the dispatcher (ADR-012).
--   * enrollments.cohort: treatment or holdout, drawn once when the profile enters and never changed. Holdout
--     enrollments run every step but get no message; the step records that it was held out (D-11 uplift measurement).
--   * enrollment_steps.message_id: the message a message step created, in the same transaction as the step, with
--     idempotency key journey:<enrollment>:<step>, so a step and its message exist together or not at all.
--   * engage.due_message_work: the dispatcher's work list across tenants (ids only), like the two lists of 121.

ALTER TABLE engage.enrollments ADD COLUMN IF NOT EXISTS cohort text NOT NULL DEFAULT 'treatment';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'enrollments_cohort_ck') THEN
    ALTER TABLE engage.enrollments ADD CONSTRAINT enrollments_cohort_ck CHECK (cohort IN ('treatment', 'holdout'));
  END IF;
END $$;

ALTER TABLE engage.enrollment_steps ADD COLUMN IF NOT EXISTS message_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'enrollment_steps_message_fk') THEN
    ALTER TABLE engage.enrollment_steps ADD CONSTRAINT enrollment_steps_message_fk
      FOREIGN KEY (organization_id, message_id) REFERENCES engage.messages (organization_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'enrollment_steps_message_ck') THEN
    ALTER TABLE engage.enrollment_steps ADD CONSTRAINT enrollment_steps_message_ck CHECK (message_id IS NULL OR step_type = 'message');
  END IF;
END $$;
-- One step, one message: a message is never claimed by two steps.
CREATE UNIQUE INDEX IF NOT EXISTS enrollment_steps_message_uq ON engage.enrollment_steps (organization_id, message_id) WHERE message_id IS NOT NULL;

-- The cohort is part of an enrollment's identity (redefines the guard of 121).
CREATE OR REPLACE FUNCTION engage.enrollment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'active' THEN RAISE EXCEPTION 'an ended enrollment cannot change' USING ERRCODE = '42501'; END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.journey_id IS DISTINCT FROM OLD.journey_id
     OR NEW.journey_version_id IS DISTINCT FROM OLD.journey_version_id OR NEW.profile_id IS DISTINCT FROM OLD.profile_id
     OR NEW.trigger_key IS DISTINCT FROM OLD.trigger_key OR NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.entered_at IS DISTINCT FROM OLD.entered_at OR NEW.cohort IS DISTINCT FROM OLD.cohort THEN
    RAISE EXCEPTION 'an enrollment''s identity cannot change' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

GRANT UPDATE (message_id) ON engage.enrollment_steps TO messign_engage;

CREATE OR REPLACE FUNCTION engage.due_message_work(p_limit integer)
RETURNS TABLE (organization_id uuid, message_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT m.organization_id, m.id FROM engage.messages m
   WHERE m.status = 'queued' AND m.next_attempt_at <= now() ORDER BY m.next_attempt_at LIMIT LEAST(GREATEST(p_limit, 1), 1000)
$$;
REVOKE ALL ON FUNCTION engage.due_message_work(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION engage.due_message_work(integer) TO messign_engage;
