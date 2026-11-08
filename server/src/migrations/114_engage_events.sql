-- WP-08: persisted events (ADR-007) with dedup, monthly partitions, and a transactional trigger outbox.
--   * events are immutable (the engage role can insert and read, never update or delete)
--   * dedup is (organization_id, client_event_id) in a small non-partitioned table; a unique index on the partitioned
--     table itself would have to include occurred_at and so could not catch a replay with a different timestamp
--   * the outbox row is written in the same transaction as the event, so a trigger cannot be lost; the executor
--     (WP-16) drains it through pg-boss

CREATE TABLE IF NOT EXISTS engage.event_keys (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_event_id text NOT NULL CHECK (char_length(client_event_id) BETWEEN 1 AND 200),
  event_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, client_event_id)
);

CREATE TABLE IF NOT EXISTS engage.events (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  client_event_id text NOT NULL CHECK (char_length(client_event_id) BETWEEN 1 AND 200),
  name text NOT NULL CHECK (name ~ '^[a-z][a-z0-9_]{0,63}$'),
  properties jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(properties) = 'object'),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id, occurred_at),
  FOREIGN KEY (organization_id, profile_id) REFERENCES engage.profiles (organization_id, id)
) PARTITION BY RANGE (occurred_at);

CREATE INDEX IF NOT EXISTS events_profile_idx ON engage.events (organization_id, profile_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS events_name_idx ON engage.events (organization_id, name, occurred_at DESC);

CREATE TABLE IF NOT EXISTS engage.trigger_outbox (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (organization_id, event_id)
);
CREATE INDEX IF NOT EXISTS trigger_outbox_pending_idx ON engage.trigger_outbox (id) WHERE status = 'pending';

-- Creates the monthly partition that holds a timestamp. This is the only DDL the application can cause, and it can
-- only create partitions of engage.events: the function runs as the migration owner, takes a fixed shape, and
-- refuses timestamps outside the retention window (so a bad client cannot make it create thousands of tables).
CREATE OR REPLACE FUNCTION engage.ensure_event_partition(ts timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, engage AS $$
DECLARE
  month_start timestamptz := date_trunc('month', ts AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  month_end timestamptz := month_start + interval '1 month';
  part text := format('events_%s', to_char(month_start AT TIME ZONE 'UTC', 'YYYYMM'));
BEGIN
  IF ts < now() - interval '400 days' OR ts > now() + interval '2 days' THEN
    RAISE EXCEPTION 'event timestamp outside the accepted window' USING ERRCODE = '22008';
  END IF;
  IF to_regclass(format('engage.%I', part)) IS NOT NULL THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(7040802);
  -- Re-check with a plain catalog query: to_regclass does not see a partition another transaction committed while we
  -- waited for the lock, a normal statement does (a test starts two transactions on the same new month).
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'engage' AND c.relname = part) THEN RETURN; END IF;
  EXECUTE format('CREATE TABLE engage.%I PARTITION OF engage.events FOR VALUES FROM (%L) TO (%L)', part, month_start, month_end);
  -- Rows are reached through the parent only. Policies on the partition are defence in depth for direct access.
  EXECUTE format('ALTER TABLE engage.%I ENABLE ROW LEVEL SECURITY', part);
  EXECUTE format('ALTER TABLE engage.%I FORCE ROW LEVEL SECURITY', part);
  EXECUTE format('CREATE POLICY tenant_isolation ON engage.%I FOR ALL
    USING (organization_id = engage.current_org_id()) WITH CHECK (organization_id = engage.current_org_id())', part);
  EXECUTE format('REVOKE ALL ON engage.%I FROM PUBLIC, messign_engage', part);
END $$;
REVOKE ALL ON FUNCTION engage.ensure_event_partition(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION engage.ensure_event_partition(timestamptz) TO messign_engage;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['event_keys', 'events', 'trigger_outbox'] LOOP
    EXECUTE format('ALTER TABLE engage.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE engage.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON engage.%I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON engage.%I FOR ALL
      USING (organization_id = engage.current_org_id())
      WITH CHECK (organization_id = engage.current_org_id())', t);
  END LOOP;
END $$;

-- Narrow the default grants. Events and their dedup keys are immutable; the outbox may only be marked processed.
REVOKE UPDATE, DELETE ON engage.event_keys, engage.events FROM messign_engage;
REVOKE UPDATE, DELETE ON engage.trigger_outbox FROM messign_engage;
GRANT UPDATE (status, processed_at) ON engage.trigger_outbox TO messign_engage;

-- The current month's partition exists from the start; later ones are created on first use.
SELECT engage.ensure_event_partition(now());
SELECT engage.ensure_event_partition(now() + interval '1 day');
