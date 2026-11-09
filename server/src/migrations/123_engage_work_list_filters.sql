-- WP-18: the three scheduler work lists (121, 122) can be narrowed to some tenants. NULL (the default, and what the
-- scheduled tick passes) means every tenant, as before. Tools and tests that drive the tick on their own tenants pass
-- them, so a tick on one tenant's clock can never act on another tenant's work. The lists still return ids only.

DROP FUNCTION IF EXISTS engage.pending_trigger_work(integer);
DROP FUNCTION IF EXISTS engage.due_enrollment_work(integer, timestamptz);
DROP FUNCTION IF EXISTS engage.due_message_work(integer);

CREATE FUNCTION engage.pending_trigger_work(p_limit integer, p_orgs uuid[] DEFAULT NULL)
RETURNS TABLE (organization_id uuid, outbox_id bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT o.organization_id, o.id FROM engage.trigger_outbox o
   WHERE o.status = 'pending' AND (p_orgs IS NULL OR o.organization_id = ANY (p_orgs))
   ORDER BY o.id LIMIT LEAST(GREATEST(p_limit, 1), 1000)
$$;
CREATE FUNCTION engage.due_enrollment_work(p_limit integer, p_now timestamptz, p_orgs uuid[] DEFAULT NULL)
RETURNS TABLE (organization_id uuid, enrollment_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT e.organization_id, e.id FROM engage.enrollments e
   WHERE e.status = 'active' AND e.next_run_at <= p_now AND (p_orgs IS NULL OR e.organization_id = ANY (p_orgs))
   ORDER BY e.next_run_at LIMIT LEAST(GREATEST(p_limit, 1), 1000)
$$;
CREATE FUNCTION engage.due_message_work(p_limit integer, p_orgs uuid[] DEFAULT NULL)
RETURNS TABLE (organization_id uuid, message_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT m.organization_id, m.id FROM engage.messages m
   WHERE m.status = 'queued' AND m.next_attempt_at <= now() AND (p_orgs IS NULL OR m.organization_id = ANY (p_orgs))
   ORDER BY m.next_attempt_at LIMIT LEAST(GREATEST(p_limit, 1), 1000)
$$;

REVOKE ALL ON FUNCTION engage.pending_trigger_work(integer, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION engage.due_enrollment_work(integer, timestamptz, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION engage.due_message_work(integer, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION engage.pending_trigger_work(integer, uuid[]) TO messign_engage;
GRANT EXECUTE ON FUNCTION engage.due_enrollment_work(integer, timestamptz, uuid[]) TO messign_engage;
GRANT EXECUTE ON FUNCTION engage.due_message_work(integer, uuid[]) TO messign_engage;
