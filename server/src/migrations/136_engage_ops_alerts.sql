-- WP-29: operations monitoring (ADR-024).
--   * engage.ops_alerts holds what the ops check found wrong for one tenant: one row per (rule, subject) while the condition lasts.
--     A row is opened when the condition appears, refreshed while it holds, and resolved when it has been gone for a while. It
--     carries codes and numbers only (rates, counts, error codes, account ids): never an address, a name or message text.
--     It is a normal tenant table: the tenant's own admin sees their own alerts on the Settings screen, nobody sees another's.
--   * engage.ops_work lists the tenants the check has to look at. Like the other work lists it runs as its owner and returns tenant
--     ids and nothing else; every measurement is then taken in the tenant's own transaction, under row-level security.
--   * The windows the check reads need indexes of their own: recent events, recent decisions, and messages waiting for a report.

CREATE TABLE IF NOT EXISTS engage.ops_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rule text NOT NULL CHECK (rule ~ '^[a-z][a-z0-9_]{1,47}$'),
  -- What the rule is about: a channel account id, a gate denial code, or '' when it concerns the whole tenant.
  subject text NOT NULL DEFAULT '' CHECK (char_length(subject) <= 100),
  severity text NOT NULL CHECK (severity IN ('warning', 'critical')),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'resolved')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data) = 'object'),
  -- When the operators were last told, at which severity, and whether they were told it resolved.
  last_notified_at timestamptz,
  notified_severity text CHECK (notified_severity IS NULL OR notified_severity IN ('warning', 'critical')),
  resolved_notified_at timestamptz,
  CHECK ((state = 'resolved') = (resolved_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS ops_alerts_open_uq ON engage.ops_alerts (organization_id, rule, subject) WHERE state = 'open';
CREATE INDEX IF NOT EXISTS ops_alerts_recent_idx ON engage.ops_alerts (organization_id, opened_at DESC);

ALTER TABLE engage.ops_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE engage.ops_alerts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON engage.ops_alerts;
CREATE POLICY tenant_isolation ON engage.ops_alerts FOR ALL
  USING (organization_id = engage.current_org_id())
  WITH CHECK (organization_id = engage.current_org_id());

-- History is kept; only the lifecycle columns change.
REVOKE UPDATE, DELETE ON engage.ops_alerts FROM messign_engage;
GRANT SELECT, INSERT ON engage.ops_alerts TO messign_engage;
GRANT UPDATE (severity, state, last_seen_at, resolved_at, data, last_notified_at, notified_severity, resolved_notified_at) ON engage.ops_alerts TO messign_engage;

-- The tenants the ops check looks at: those with an active channel account (they can be sending), and those with an alert that
-- is open or whose resolution has not been announced yet (so it can be closed and announced even when the account is gone).
CREATE OR REPLACE FUNCTION engage.ops_work(p_limit integer, p_orgs uuid[] DEFAULT NULL)
RETURNS TABLE (organization_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT w.organization_id FROM (
    SELECT a.organization_id FROM engage.channel_accounts a WHERE a.status = 'active'
    UNION
    SELECT l.organization_id FROM engage.ops_alerts l
     WHERE l.state = 'open' OR (l.resolved_notified_at IS NULL AND l.last_notified_at IS NOT NULL AND l.resolved_at > now() - interval '1 day')
  ) w
  WHERE p_orgs IS NULL OR w.organization_id = ANY (p_orgs)
  ORDER BY w.organization_id
  LIMIT LEAST(GREATEST(p_limit, 1), 5000)
$$;

REVOKE ALL ON FUNCTION engage.ops_work(integer, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION engage.ops_work(integer, uuid[]) TO messign_engage;

-- Windows over recent history, per tenant.
CREATE INDEX IF NOT EXISTS message_events_recent_idx ON engage.message_events (organization_id, received_at DESC);
CREATE INDEX IF NOT EXISTS send_decisions_recent_idx ON engage.send_decisions (organization_id, created_at DESC) WHERE decision = 'deny';
CREATE INDEX IF NOT EXISTS messages_sent_waiting_idx ON engage.messages (organization_id, status_changed_at) WHERE status = 'sent';
