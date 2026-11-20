-- Scheduled re-check of the email domain (follow-up to WP-39, ADR-020).
-- The scheduler has no tenant, so RLS shows it no rows. Like the journey work lists (121, 123) this function runs as its
-- owner and returns tenant ids and nothing else; each re-check is then done in its own tenant transaction.
--   * Only a tenant whose readiness item `email_domain_authenticated` is set is listed: a tenant without it has nothing
--     to lose and is not sending live.
--   * A tenant is due when its latest check is older than 23 hours (it passed), or older than 1 hour (the last check
--     could not reach DNS, so the item was kept and the lookup is tried again sooner).
--   * A tenant whose item has no check behind it (recorded by hand before WP-39) is not listed: the selectors are not
--     known, and the item's own 30-day expiry in live mode covers it.

CREATE OR REPLACE FUNCTION engage.email_domain_recheck_work(p_limit integer, p_orgs uuid[] DEFAULT NULL)
RETURNS TABLE (organization_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT r.organization_id
    FROM engage.tenant_readiness r
    JOIN LATERAL (
      SELECT c.passed, c.checked_at FROM engage.email_domain_checks c
       WHERE c.organization_id = r.organization_id
       ORDER BY c.checked_at DESC, c.id DESC LIMIT 1
    ) last ON true
   WHERE r.channel = 'email' AND r.item = 'email_domain_authenticated'
     AND (p_orgs IS NULL OR r.organization_id = ANY (p_orgs))
     AND last.checked_at < now() - CASE WHEN last.passed THEN interval '23 hours' ELSE interval '1 hour' END
   ORDER BY last.checked_at
   LIMIT LEAST(GREATEST(p_limit, 1), 1000)
$$;

REVOKE ALL ON FUNCTION engage.email_domain_recheck_work(integer, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION engage.email_domain_recheck_work(integer, uuid[]) TO messign_engage;
