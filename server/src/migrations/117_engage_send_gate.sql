-- WP-11: the full send gate (ADR-004, ADR-008, R-1/R-2 in docs/compliance/tr-messaging-obligations.md).
--   * engage.send_decisions: append-only, one row per gate evaluation (allow / deny / defer, with every reason).
--   * claim_message now needs a fresh ALLOW decision for that message, so the database itself refuses to start a send
--     that the gate did not allow.
--   * engage.send_allowlist: in SEND_MODE=sandbox only these addresses can receive.
--   * engage.rate_cards (append-only versions) and engage.budget_caps: cost estimate per message and a monthly cap.
--   * messages gain expires_at (a message held by a kill switch is not sent days later), rate_card_id and
--     gate_allowed_at (when the gate first allowed it; budget and frequency counting use it). Once set, the cost fields
--     and gate_allowed_at never change.

ALTER TABLE engage.messages ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours';
ALTER TABLE engage.messages ADD COLUMN IF NOT EXISTS rate_card_id uuid;
ALTER TABLE engage.messages ADD COLUMN IF NOT EXISTS gate_allowed_at timestamptz;
CREATE INDEX IF NOT EXISTS messages_spend_idx ON engage.messages (organization_id, channel, gate_allowed_at) WHERE gate_allowed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_frequency_idx ON engage.messages (organization_id, profile_id, channel, gate_allowed_at) WHERE gate_allowed_at IS NOT NULL;

-- Frequency cap (marketing only): at most frequency_cap_max messages per profile and channel in the rolling window.
ALTER TABLE engage.tenant_settings ADD COLUMN IF NOT EXISTS frequency_cap_max integer NOT NULL DEFAULT 3;
ALTER TABLE engage.tenant_settings ADD COLUMN IF NOT EXISTS frequency_cap_window_hours integer NOT NULL DEFAULT 168;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_settings_frequency_ck') THEN
    ALTER TABLE engage.tenant_settings ADD CONSTRAINT tenant_settings_frequency_ck
      CHECK (frequency_cap_max BETWEEN 1 AND 1000 AND frequency_cap_window_hours BETWEEN 1 AND 8760);
  END IF;
  -- Quiet hours are both set or both empty, and a window cannot be empty or the whole day.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_settings_quiet_hours_ck') THEN
    ALTER TABLE engage.tenant_settings ADD CONSTRAINT tenant_settings_quiet_hours_ck
      CHECK ((quiet_hours_start IS NULL) = (quiet_hours_end IS NULL) AND (quiet_hours_start IS NULL OR quiet_hours_start <> quiet_hours_end));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS engage.rate_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  category text NOT NULL CHECK (category IN ('marketing', 'transactional')),
  route text NOT NULL DEFAULT 'default' CHECK (route ~ '^[a-z0-9_]{1,32}$'),
  unit_cost_minor bigint NOT NULL CHECK (unit_cost_minor >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  effective_from timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);
CREATE INDEX IF NOT EXISTS rate_cards_lookup_idx ON engage.rate_cards (organization_id, channel, category, route, effective_from DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_rate_card_fk') THEN
    ALTER TABLE engage.messages ADD CONSTRAINT messages_rate_card_fk
      FOREIGN KEY (organization_id, rate_card_id) REFERENCES engage.rate_cards (organization_id, id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS engage.budget_caps (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  monthly_cap_minor bigint NOT NULL CHECK (monthly_cap_minor >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, channel)
);

CREATE TABLE IF NOT EXISTS engage.send_allowlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  value_normalized text NOT NULL CHECK (char_length(value_normalized) BETWEEN 3 AND 320),
  label text CHECK (label IS NULL OR char_length(label) <= 100),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS send_allowlist_active_uq ON engage.send_allowlist (organization_id, channel, value_normalized) WHERE removed_at IS NULL;

CREATE TABLE IF NOT EXISTS engage.send_decisions (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  message_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('allow', 'deny', 'defer')),
  -- The first failing rule (or 'allowed'). reasons holds every failing rule: codes and numbers only, never an address.
  code text NOT NULL CHECK (code ~ '^[a-z0-9_]{1,64}$'),
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(reasons) = 'array'),
  send_mode text NOT NULL CHECK (send_mode IN ('sandbox', 'live')),
  cost_estimate_minor bigint CHECK (cost_estimate_minor IS NULL OR cost_estimate_minor >= 0),
  currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  rate_card_id uuid,
  retry_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (decision <> 'allow' OR code = 'allowed'),
  CHECK (decision <> 'defer' OR retry_at IS NOT NULL),
  FOREIGN KEY (organization_id, message_id) REFERENCES engage.messages (organization_id, id)
);
CREATE INDEX IF NOT EXISTS send_decisions_message_idx ON engage.send_decisions (organization_id, message_id, id);

-- Once the gate has allowed a message and reserved its cost, that reservation is fixed.
CREATE OR REPLACE FUNCTION engage.messages_freeze_reservation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, engage AS $$
BEGIN
  IF OLD.gate_allowed_at IS NOT NULL AND (NEW.gate_allowed_at IS DISTINCT FROM OLD.gate_allowed_at
      OR NEW.cost_estimate_minor IS DISTINCT FROM OLD.cost_estimate_minor
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.rate_card_id IS DISTINCT FROM OLD.rate_card_id) THEN
    RAISE EXCEPTION 'a message cost reservation cannot be changed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS messages_freeze_reservation ON engage.messages;
CREATE TRIGGER messages_freeze_reservation BEFORE UPDATE ON engage.messages
  FOR EACH ROW EXECUTE FUNCTION engage.messages_freeze_reservation();

-- Is `at` inside the tenant's quiet hours? Returns the instant the window ends (when the message may go), or NULL.
-- Computed in the tenant's time zone by Postgres, so daylight-saving changes follow the tz database.
CREATE OR REPLACE FUNCTION engage.quiet_hours_end(at timestamptz, tz text, q_start time, q_end time) RETURNS timestamptz
LANGUAGE plpgsql STABLE SET search_path = pg_catalog AS $$
DECLARE
  local_ts timestamp := at AT TIME ZONE tz;
  t time := local_ts::time;
  d date := local_ts::date;
BEGIN
  IF q_start IS NULL OR q_end IS NULL THEN RETURN NULL; END IF;
  IF q_start < q_end THEN
    IF t >= q_start AND t < q_end THEN RETURN (d + q_end) AT TIME ZONE tz; END IF;
    RETURN NULL;
  END IF;
  -- The window crosses midnight, for example 21:00 to 09:00.
  IF t >= q_start THEN RETURN ((d + 1) + q_end) AT TIME ZONE tz; END IF;
  IF t < q_end THEN RETURN (d + q_end) AT TIME ZONE tz; END IF;
  RETURN NULL;
END $$;
GRANT EXECUTE ON FUNCTION engage.quiet_hours_end(timestamptz, text, time, time) TO messign_engage;

-- claim_message (WP-10) now requires the id of an ALLOW decision for this message, made in the last two minutes.
DROP FUNCTION IF EXISTS engage.claim_message(uuid, uuid, interval);
CREATE OR REPLACE FUNCTION engage.claim_message(p_org uuid, p_id uuid, p_lease interval, p_decision bigint) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, engage AS $$
DECLARE
  claimed integer;
BEGIN
  IF p_org IS DISTINCT FROM engage.current_org_id() THEN
    RAISE EXCEPTION 'claim outside the current tenant' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM engage.send_decisions
                  WHERE id = p_decision AND organization_id = p_org AND message_id = p_id
                    AND decision = 'allow' AND created_at > now() - interval '2 minutes') THEN
    RAISE EXCEPTION 'no recent allow decision for this message' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM engage.messages
              WHERE organization_id = p_org AND id = p_id AND status = 'sending'
                AND claimed_at < now() - p_lease AND attempt_count >= max_attempts) THEN
    INSERT INTO engage.message_events (organization_id, message_id, type, source, error_code)
    VALUES (p_org, p_id, 'failed', 'system', 'lease_expired');
    RETURN false;
  END IF;
  UPDATE engage.messages
     SET status = 'sending', attempt_count = attempt_count + 1, claimed_at = now(), status_changed_at = now(), updated_at = now()
   WHERE organization_id = p_org AND id = p_id AND attempt_count < max_attempts
     AND ((status = 'queued' AND next_attempt_at <= now()) OR (status = 'sending' AND claimed_at < now() - p_lease));
  GET DIAGNOSTICS claimed = ROW_COUNT;
  IF claimed = 0 THEN RETURN false; END IF;
  INSERT INTO engage.message_events (organization_id, message_id, type, source, detail)
  VALUES (p_org, p_id, 'sending', 'system', jsonb_build_object('decision_id', p_decision));
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION engage.claim_message(uuid, uuid, interval, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION engage.claim_message(uuid, uuid, interval, bigint) TO messign_engage;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rate_cards', 'budget_caps', 'send_allowlist', 'send_decisions'] LOOP
    EXECUTE format('ALTER TABLE engage.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE engage.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON engage.%I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON engage.%I FOR ALL
      USING (organization_id = engage.current_org_id())
      WITH CHECK (organization_id = engage.current_org_id())', t);
  END LOOP;
END $$;

-- Grants. Decisions and rate cards are append-only (a new rate is a new row); an allow-list entry is removed by
-- stamping removed_at; a budget cap may be changed. The gate reserves a message's cost once (trigger above).
REVOKE UPDATE, DELETE ON engage.send_decisions, engage.rate_cards FROM messign_engage;
REVOKE UPDATE, DELETE ON engage.send_allowlist FROM messign_engage;
GRANT UPDATE (removed_at) ON engage.send_allowlist TO messign_engage;
REVOKE DELETE ON engage.budget_caps FROM messign_engage;
GRANT UPDATE (cost_estimate_minor, currency, rate_card_id, gate_allowed_at) ON engage.messages TO messign_engage;
