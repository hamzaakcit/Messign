-- WP-31: a tamper-evident audit log for the engage control plane.
--
-- What it records: who changed what on the settings that decide whether and how a tenant can send, and who approved
-- what: tenant created, sending turned on or off, quiet hours / caps / sender name, channel accounts created, disabled or
-- re-wrapped, API keys created or revoked, readiness items, budget caps, rate cards, allow-list changes, journey versions
-- approved / activated / deactivated, campaigns started, AI copy drafts approved or rejected.
-- What it never records: secrets, ciphertext, addresses, phone numbers, names of customers, message content. Every entry is
-- ids, codes and the changed setting. (The allow-list entry is recorded by id and channel only, never the address.)
--
-- How it works (principle 4: enforced in the schema, not only in code):
--   * Rows are written by AFTER triggers on the control-plane tables, in the same transaction as the change, so a change
--     cannot happen without its entry and no code path can forget to record it.
--   * One chain per organization. Each entry carries the SHA-256 of the previous entry's hash plus its own fields, so an
--     edited, removed or re-ordered entry makes engage.verify_audit_chain() report the first broken position.
--   * Append-only: the engage role has SELECT only (writes go through engage.audit_append), and a trigger refuses UPDATE and
--     DELETE for every role.
-- Limits (documented in docs/quality/security-checklist-wp31.md): whoever holds the database owner role can drop the trigger
-- or truncate the table; the chain then no longer verifies, but a removed tail is only noticed if the head was recorded
-- elsewhere (`npm run engage:audit-verify` prints it). It is evidence of ordinary changes, not a defence against the owner.
--
-- There is deliberately no foreign key to organizations: the log must outlive anything done to the organization row.

CREATE TABLE IF NOT EXISTS engage.audit_log (
  organization_id uuid NOT NULL,
  seq bigint NOT NULL CHECK (seq >= 1),
  occurred_at timestamptz NOT NULL,
  actor text NOT NULL CHECK (actor ~ '^[a-z_]+:[A-Za-z0-9._-]{1,80}$' OR actor = 'system'),
  action text NOT NULL CHECK (action ~ '^[a-z_]+\.[a-z_]+$'),
  subject_type text NOT NULL CHECK (subject_type ~ '^[a-z_]+$'),
  subject_id text CHECK (subject_id IS NULL OR char_length(subject_id) <= 100),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object' AND octet_length(details::text) <= 4096),
  prev_hash text NOT NULL CHECK (prev_hash ~ '^[0-9a-f]{64}$'),
  entry_hash text NOT NULL CHECK (entry_hash ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (organization_id, seq)
);

ALTER TABLE engage.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE engage.audit_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON engage.audit_log;
CREATE POLICY tenant_isolation ON engage.audit_log FOR ALL
  USING (organization_id = engage.current_org_id())
  WITH CHECK (organization_id = engage.current_org_id());

REVOKE ALL ON engage.audit_log FROM messign_engage;
GRANT SELECT ON engage.audit_log TO messign_engage;

CREATE OR REPLACE FUNCTION engage.audit_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'the audit log is append-only' USING ERRCODE = '42501';
END $$;
DROP TRIGGER IF EXISTS audit_log_immutable ON engage.audit_log;
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON engage.audit_log
  FOR EACH ROW EXECUTE FUNCTION engage.audit_log_immutable();
DROP TRIGGER IF EXISTS audit_log_no_truncate ON engage.audit_log;
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON engage.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION engage.audit_log_immutable();

-- The text that is hashed. One definition, used to write and to verify, so the two cannot drift apart.
CREATE OR REPLACE FUNCTION engage.audit_entry_hash(
  p_org uuid, p_seq bigint, p_prev text, p_at timestamptz, p_actor text, p_action text,
  p_subject_type text, p_subject_id text, p_details jsonb
) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT encode(sha256(convert_to(
    concat_ws('|', 'engage-audit-v1', p_org::text, p_seq::text, p_prev,
      to_char(p_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
      p_actor, p_action, p_subject_type, coalesce(p_subject_id, ''), p_details::text),
    'UTF8')), 'hex')
$$;

-- Who is acting: the user column of the changed row when it has one, else the actor the request set for this transaction
-- (engage.actor, set by withEngageTenant from the authenticated request or the operator script), else 'system'.
CREATE OR REPLACE FUNCTION engage.audit_actor(p_user uuid) RETURNS text LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT CASE
    WHEN p_user IS NOT NULL THEN 'user:' || p_user::text
    WHEN coalesce(current_setting('engage.actor', true), '') ~ '^[a-z_]+:[A-Za-z0-9._-]{1,80}$' THEN current_setting('engage.actor', true)
    ELSE 'system'
  END
$$;

-- The only writer. Serialises per organization (so the chain has no gaps or forks), then chains the new entry.
CREATE OR REPLACE FUNCTION engage.audit_append(
  p_org uuid, p_actor text, p_action text, p_subject_type text, p_subject_id text, p_details jsonb DEFAULT '{}'::jsonb
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, engage AS $$
DECLARE
  cur uuid := engage.current_org_id();
  last_seq bigint;
  last_hash text;
  new_seq bigint;
  now_ts timestamptz := clock_timestamp();
  h text;
BEGIN
  IF cur IS NOT NULL AND cur <> p_org THEN
    RAISE EXCEPTION 'audit entry outside the current tenant' USING ERRCODE = '42501';
  END IF;
  IF cur IS NULL THEN
    -- No tenant in the session: only an operator connection (superuser or BYPASSRLS, which is what provisioning uses).
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = session_user AND (rolsuper OR rolbypassrls)) THEN
      RAISE EXCEPTION 'audit entry without a tenant' USING ERRCODE = '42501';
    END IF;
    PERFORM set_config('app.current_tenant', p_org::text, true);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('engage.audit:' || p_org::text, 0));
  SELECT seq, entry_hash INTO last_seq, last_hash
    FROM engage.audit_log WHERE organization_id = p_org ORDER BY seq DESC LIMIT 1;
  new_seq := coalesce(last_seq, 0) + 1;
  last_hash := coalesce(last_hash, repeat('0', 64));
  h := engage.audit_entry_hash(p_org, new_seq, last_hash, now_ts, p_actor, p_action, p_subject_type, p_subject_id, coalesce(p_details, '{}'::jsonb));
  INSERT INTO engage.audit_log (organization_id, seq, occurred_at, actor, action, subject_type, subject_id, details, prev_hash, entry_hash)
  VALUES (p_org, new_seq, now_ts, p_actor, p_action, p_subject_type, p_subject_id, coalesce(p_details, '{}'::jsonb), last_hash, h);
  RETURN new_seq;
END $$;
REVOKE ALL ON FUNCTION engage.audit_append(uuid, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION engage.audit_append(uuid, text, text, text, text, jsonb) TO messign_engage;

-- Recomputes the chain of one organization. Runs with the caller's rights, so under RLS a tenant can only check its own.
-- ok = false when a position is missing or repeated, a link does not match the entry before it, or an entry's hash does
-- not match its fields. first_bad_seq is the first position at which that was seen.
CREATE OR REPLACE FUNCTION engage.verify_audit_chain(p_org uuid)
RETURNS TABLE (ok boolean, entries bigint, first_bad_seq bigint, head_seq bigint, head_hash text)
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, engage AS $$
DECLARE
  r record;
  expected_seq bigint := 1;
  expected_prev text := repeat('0', 64);
  bad bigint := NULL;
  n bigint := 0;
BEGIN
  FOR r IN SELECT * FROM engage.audit_log WHERE organization_id = p_org ORDER BY seq LOOP
    n := n + 1;
    IF bad IS NULL AND (
         r.seq <> expected_seq
         OR r.prev_hash <> expected_prev
         OR r.entry_hash <> engage.audit_entry_hash(r.organization_id, r.seq, r.prev_hash, r.occurred_at, r.actor, r.action, r.subject_type, r.subject_id, r.details)
       ) THEN
      bad := r.seq;
    END IF;
    expected_seq := r.seq + 1;
    expected_prev := r.entry_hash;
    head_seq := r.seq;
    head_hash := r.entry_hash;
  END LOOP;
  ok := bad IS NULL;
  entries := n;
  first_bad_seq := bad;
  RETURN NEXT;
END $$;
GRANT EXECUTE ON FUNCTION engage.verify_audit_chain(uuid) TO messign_engage;

-- The columns of a row that changed, restricted to the ones listed (an allow-list: a column added later is never
-- recorded by accident). Returns {"col": {"from": .., "to": ..}}.
CREATE OR REPLACE FUNCTION engage.audit_changes(p_old jsonb, p_new jsonb, p_include text[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT coalesce(jsonb_object_agg(k, jsonb_build_object('from', p_old -> k, 'to', p_new -> k)), '{}'::jsonb)
    FROM unnest(p_include) AS k
   WHERE (p_old -> k) IS DISTINCT FROM (p_new -> k)
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Triggers on the control-plane tables. Each one names exactly what it records.
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION engage.audit_tenant_settings() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, engage AS $$
DECLARE
  changes jsonb;
  actor text := engage.audit_actor(NULL);
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM engage.audit_append(NEW.organization_id, actor, 'tenant.created', 'tenant', NEW.organization_id::text, '{}'::jsonb);
    RETURN NEW;
  END IF;
  IF NEW.send_enabled IS DISTINCT FROM OLD.send_enabled THEN
    PERFORM engage.audit_append(NEW.organization_id, actor,
      CASE WHEN NEW.send_enabled THEN 'sending.turned_on' ELSE 'sending.turned_off' END,
      'tenant', NEW.organization_id::text, '{}'::jsonb);
  END IF;
  changes := engage.audit_changes(to_jsonb(OLD), to_jsonb(NEW), ARRAY[
    'timezone', 'quiet_hours_start', 'quiet_hours_end', 'frequency_cap_max', 'frequency_cap_window_hours',
    'sender_name', 'event_retention_days']);
  IF changes <> '{}'::jsonb THEN
    PERFORM engage.audit_append(NEW.organization_id, actor, 'settings.changed', 'tenant', NEW.organization_id::text, changes);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_tenant_settings ON engage.tenant_settings;
CREATE TRIGGER audit_tenant_settings AFTER INSERT OR UPDATE ON engage.tenant_settings
  FOR EACH ROW EXECUTE FUNCTION engage.audit_tenant_settings();

CREATE OR REPLACE FUNCTION engage.audit_channel_accounts() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, engage AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM engage.audit_append(NEW.organization_id, engage.audit_actor(NEW.created_by), 'channel_account.created', 'channel_account', NEW.id::text,
      jsonb_strip_nulls(jsonb_build_object('channel', NEW.channel, 'provider', NEW.provider, 'mode', NEW.mode, 'label', NEW.label,
        'supersedes_id', NEW.supersedes_id, 'key_id', NEW.key_id)));
    RETURN NEW;
  END IF;
  IF NEW.status = 'disabled' AND OLD.status <> 'disabled' THEN
    PERFORM engage.audit_append(NEW.organization_id, engage.audit_actor(NULL), 'channel_account.disabled', 'channel_account', NEW.id::text,
      jsonb_build_object('channel', NEW.channel, 'provider', NEW.provider, 'label', NEW.label));
  END IF;
  IF NEW.key_id IS DISTINCT FROM OLD.key_id THEN
    PERFORM engage.audit_append(NEW.organization_id, engage.audit_actor(NULL), 'channel_account.rewrapped', 'channel_account', NEW.id::text,
      jsonb_build_object('from_key_id', OLD.key_id, 'to_key_id', NEW.key_id));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_channel_accounts ON engage.channel_accounts;
CREATE TRIGGER audit_channel_accounts AFTER INSERT OR UPDATE ON engage.channel_accounts
  FOR EACH ROW EXECUTE FUNCTION engage.audit_channel_accounts();

CREATE OR REPLACE FUNCTION engage.audit_api_keys() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, engage AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM engage.audit_append(NEW.organization_id, engage.audit_actor(NEW.created_by), 'api_key.created', 'api_key', NEW.id::text,
      jsonb_build_object('name', NEW.name, 'scopes', to_jsonb(NEW.scopes), 'key_prefix', NEW.key_prefix));
    RETURN NEW;
  END IF;
  IF NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
    PERFORM engage.audit_append(NEW.organization_id, engage.audit_actor(NULL), 'api_key.revoked', 'api_key', NEW.id::text,
      jsonb_build_object('name', NEW.name, 'key_prefix', NEW.key_prefix));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_api_keys ON engage.api_keys;
CREATE TRIGGER audit_api_keys AFTER INSERT OR UPDATE ON engage.api_keys
  FOR EACH ROW EXECUTE FUNCTION engage.audit_api_keys();

CREATE OR REPLACE FUNCTION engage.audit_readiness() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, engage AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.value IS NOT DISTINCT FROM OLD.value AND NEW.evidence_url IS NOT DISTINCT FROM OLD.evidence_url THEN
    RETURN NEW;
  END IF;
  PERFORM engage.audit_append(NEW.organization_id, engage.audit_actor(NEW.recorded_by), 'readiness.recorded', 'readiness_item',
    NEW.channel || '.' || NEW.item,
    jsonb_strip_nulls(jsonb_build_object('channel', NEW.channel, 'item', NEW.item, 'value', left(NEW.value, 200), 'evidence_url', left(NEW.evidence_url, 500))));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_readiness ON engage.tenant_readiness;
CREATE TRIGGER audit_readiness AFTER INSERT OR UPDATE ON engage.tenant_readiness
  FOR EACH ROW EXECUTE FUNCTION engage.audit_readiness();

CREATE OR REPLACE FUNCTION engage.audit_budget_caps() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, engage AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.monthly_cap_minor = OLD.monthly_cap_minor AND NEW.currency = OLD.currency THEN RETURN NEW; END IF;
  PERFORM engage.audit_append(NEW.organization_id, engage.audit_actor(NEW.updated_by), 'budget_cap.set', 'budget_cap', NEW.channel,
    jsonb_build_object('channel', NEW.channel, 'monthly_cap_minor', NEW.monthly_cap_minor, 'currency', NEW.currency));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_budget_caps ON engage.budget_caps;
CREATE TRIGGER audit_budget_caps AFTER INSERT OR UPDATE ON engage.budget_caps
  FOR EACH ROW EXECUTE FUNCTION engage.audit_budget_caps();

CREATE OR REPLACE FUNCTION engage.audit_rate_cards() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, engage AS $$
BEGIN
  PERFORM engage.audit_append(NEW.organization_id, engage.audit_actor(NEW.created_by), 'rate_card.added', 'rate_card', NEW.id::text,
    jsonb_build_object('channel', NEW.channel, 'category', NEW.category, 'route', NEW.route, 'unit_cost_minor', NEW.unit_cost_minor,
      'currency', NEW.currency, 'effective_from', NEW.effective_from));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_rate_cards ON engage.rate_cards;
CREATE TRIGGER audit_rate_cards AFTER INSERT ON engage.rate_cards
  FOR EACH ROW EXECUTE FUNCTION engage.audit_rate_cards();

-- The allow-list holds addresses and numbers, so an entry is recorded by id and channel only.
CREATE OR REPLACE FUNCTION engage.audit_send_allowlist() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, engage AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM engage.audit_append(NEW.organization_id, engage.audit_actor(NEW.created_by), 'allowlist.added', 'allowlist_entry', NEW.id::text,
      jsonb_build_object('channel', NEW.channel));
  ELSIF NEW.removed_at IS NOT NULL AND OLD.removed_at IS NULL THEN
    PERFORM engage.audit_append(NEW.organization_id, engage.audit_actor(NULL), 'allowlist.removed', 'allowlist_entry', NEW.id::text,
      jsonb_build_object('channel', NEW.channel));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_send_allowlist ON engage.send_allowlist;
CREATE TRIGGER audit_send_allowlist AFTER INSERT OR UPDATE ON engage.send_allowlist
  FOR EACH ROW EXECUTE FUNCTION engage.audit_send_allowlist();

CREATE OR REPLACE FUNCTION engage.audit_journey_versions() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, engage AS $$
DECLARE
  d jsonb := jsonb_build_object('journey_id', NEW.journey_id, 'version', NEW.version);
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM engage.audit_append(NEW.organization_id, engage.audit_actor(NEW.created_by), 'journey.version_created', 'journey_version', NEW.id::text, d);
    RETURN NEW;
  END IF;
  IF NEW.approved_at IS NOT NULL AND OLD.approved_at IS NULL THEN
    PERFORM engage.audit_append(NEW.organization_id, engage.audit_actor(NEW.approved_by), 'journey.version_approved', 'journey_version', NEW.id::text, d);
  END IF;
  IF NEW.activated_at IS NOT NULL AND OLD.activated_at IS NULL THEN
    PERFORM engage.audit_append(NEW.organization_id, engage.audit_actor(NEW.activated_by), 'journey.version_activated', 'journey_version', NEW.id::text, d);
  END IF;
  IF NEW.deactivated_at IS NOT NULL AND OLD.deactivated_at IS NULL THEN
    PERFORM engage.audit_append(NEW.organization_id, engage.audit_actor(NEW.deactivated_by), 'journey.version_deactivated', 'journey_version', NEW.id::text, d);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_journey_versions ON engage.journey_versions;
CREATE TRIGGER audit_journey_versions AFTER INSERT OR UPDATE ON engage.journey_versions
  FOR EACH ROW EXECUTE FUNCTION engage.audit_journey_versions();

CREATE OR REPLACE FUNCTION engage.audit_campaigns() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, engage AS $$
BEGIN
  PERFORM engage.audit_append(NEW.organization_id, engage.audit_actor(NEW.created_by), 'campaign.started', 'campaign', NEW.id::text,
    jsonb_build_object('template_key', NEW.template_key, 'template_version', NEW.template_version, 'segment_key', NEW.segment_key,
      'segment_version', NEW.segment_version, 'holdout_percent', NEW.holdout_percent));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_campaigns ON engage.campaigns;
CREATE TRIGGER audit_campaigns AFTER INSERT ON engage.campaigns
  FOR EACH ROW EXECUTE FUNCTION engage.audit_campaigns();

CREATE OR REPLACE FUNCTION engage.audit_copy_drafts() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, engage AS $$
BEGIN
  IF NEW.status <> OLD.status AND NEW.status IN ('approved', 'rejected') THEN
    PERFORM engage.audit_append(NEW.organization_id, engage.audit_actor(NEW.decided_by),
      CASE WHEN NEW.status = 'approved' THEN 'copy_draft.approved' ELSE 'copy_draft.rejected' END, 'copy_draft', NEW.id::text,
      jsonb_strip_nulls(jsonb_build_object('template_version', NEW.template_version)));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_copy_drafts ON engage.copy_drafts;
CREATE TRIGGER audit_copy_drafts AFTER UPDATE ON engage.copy_drafts
  FOR EACH ROW EXECUTE FUNCTION engage.audit_copy_drafts();
