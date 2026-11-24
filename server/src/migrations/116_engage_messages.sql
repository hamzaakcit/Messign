-- WP-10: the messages ledger and its event stream (target-state E, ADR-004, ADR-008).
--   * engage.messages has one row per intended message. (organization_id, idempotency_key) is unique, so a retry or a
--     replayed trigger can never create a second message.
--   * engage.message_events is append-only. Every status change is an event, and messages.status is derived from the
--     events by a trigger: the engage role cannot write it. Status only moves forward, so a late, duplicate or
--     out-of-order delivery report can never move a message backwards.
--   * no recipient address is stored here: it is resolved from the profile's active identifier at send time.

-- A message must use an account of its own tenant AND of the same channel.
CREATE UNIQUE INDEX IF NOT EXISTS channel_accounts_org_id_channel_uq ON engage.channel_accounts (organization_id, id, channel);

CREATE TABLE IF NOT EXISTS engage.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  purpose text NOT NULL CHECK (purpose IN ('marketing', 'transactional')),
  channel_account_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 200),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'delivered', 'failed', 'bounced', 'blocked')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  provider_message_id text CHECK (provider_message_id IS NULL OR char_length(provider_message_id) BETWEEN 1 AND 200),
  error_code text CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_.:-]{1,64}$'),
  cost_estimate_minor bigint CHECK (cost_estimate_minor IS NULL OR cost_estimate_minor >= 0),
  currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, profile_id) REFERENCES engage.profiles (organization_id, id),
  FOREIGN KEY (organization_id, channel_account_id, channel) REFERENCES engage.channel_accounts (organization_id, id, channel)
);

CREATE UNIQUE INDEX IF NOT EXISTS messages_provider_id_uq
  ON engage.messages (organization_id, provider, provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_due_idx ON engage.messages (next_attempt_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS messages_profile_idx ON engage.messages (organization_id, profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS engage.message_events (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  message_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('sending', 'retry_scheduled', 'sent', 'delivered', 'failed', 'bounced', 'blocked')),
  -- The provider's own id for this report; a repeat of the same id for the same message is a duplicate.
  provider_event_id text CHECK (provider_event_id IS NULL OR char_length(provider_event_id) BETWEEN 1 AND 200),
  source text NOT NULL CHECK (source IN ('system', 'provider', 'simulator')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz NOT NULL DEFAULT now(),
  error_code text CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_.:-]{1,64}$'),
  -- Codes and counters only. Never an address, a name or message text.
  detail jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(detail) = 'object'),
  -- Set by the trigger: did this event change the message's status?
  applied boolean NOT NULL DEFAULT false,
  FOREIGN KEY (organization_id, message_id) REFERENCES engage.messages (organization_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS message_events_dedup_uq
  ON engage.message_events (organization_id, message_id, provider_event_id) WHERE provider_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS message_events_message_idx ON engage.message_events (organization_id, message_id, id);

-- Status ranks: queued 0, sending 1, sent 2, delivered/failed/blocked 3, bounced 4. A status only moves up, so
-- {sent, delivered} in any order ends as delivered, and a duplicate or late report changes nothing. Two different
-- final reports (delivered vs failed) are decided by arrival: the first one wins. A bounce may follow a delivery
-- (email bounces asynchronously). retry_scheduled is the one sanctioned step back: sending -> queued.
CREATE OR REPLACE FUNCTION engage.message_rank(s text) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE s WHEN 'queued' THEN 0 WHEN 'sending' THEN 1 WHEN 'sent' THEN 2
                WHEN 'delivered' THEN 3 WHEN 'failed' THEN 3 WHEN 'blocked' THEN 3 WHEN 'bounced' THEN 4 END
$$;

CREATE OR REPLACE FUNCTION engage.apply_message_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, engage AS $$
DECLARE
  cur text;
  new_status text;
BEGIN
  IF NEW.organization_id IS DISTINCT FROM engage.current_org_id() THEN
    RAISE EXCEPTION 'message event outside the current tenant' USING ERRCODE = '42501';
  END IF;
  SELECT status INTO cur FROM engage.messages WHERE organization_id = NEW.organization_id AND id = NEW.message_id FOR UPDATE;
  IF cur IS NULL THEN RAISE EXCEPTION 'unknown message' USING ERRCODE = '23503'; END IF;

  new_status := CASE NEW.type
    WHEN 'sending' THEN CASE WHEN cur = 'sending' THEN 'sending' END      -- written by claim_message, which already set it
    WHEN 'retry_scheduled' THEN CASE WHEN cur = 'sending' THEN 'queued' END
    WHEN 'blocked' THEN CASE WHEN cur IN ('queued', 'sending') THEN 'blocked' END
    WHEN 'bounced' THEN CASE WHEN cur <> 'blocked' AND engage.message_rank(cur) < 4 THEN 'bounced' END
    ELSE CASE WHEN engage.message_rank(cur) < engage.message_rank(NEW.type) THEN NEW.type END
  END;

  IF new_status IS NULL THEN
    NEW.applied := false;
    RETURN NEW;
  END IF;
  NEW.applied := true;
  IF new_status <> cur THEN
    UPDATE engage.messages
       SET status = new_status, status_changed_at = now(), updated_at = now(),
           error_code = COALESCE(NEW.error_code, CASE WHEN new_status IN ('sent', 'delivered') THEN NULL ELSE error_code END)
     WHERE organization_id = NEW.organization_id AND id = NEW.message_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION engage.apply_message_event() FROM PUBLIC;

DROP TRIGGER IF EXISTS message_events_apply ON engage.message_events;
CREATE TRIGGER message_events_apply BEFORE INSERT ON engage.message_events
  FOR EACH ROW EXECUTE FUNCTION engage.apply_message_event();

-- Atomic claim: exactly one caller wins a due message. A claim older than the lease (a crashed worker) can be taken
-- over; the provider call carries the same idempotency key, so a repeat is safe. A message that is out of attempts
-- when its lease expires is failed rather than retried forever.
CREATE OR REPLACE FUNCTION engage.claim_message(p_org uuid, p_id uuid, p_lease interval) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, engage AS $$
DECLARE
  claimed integer;
BEGIN
  IF p_org IS DISTINCT FROM engage.current_org_id() THEN
    RAISE EXCEPTION 'claim outside the current tenant' USING ERRCODE = '42501';
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
  INSERT INTO engage.message_events (organization_id, message_id, type, source) VALUES (p_org, p_id, 'sending', 'system');
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION engage.claim_message(uuid, uuid, interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION engage.claim_message(uuid, uuid, interval) TO messign_engage;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['messages', 'message_events'] LOOP
    EXECUTE format('ALTER TABLE engage.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE engage.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON engage.%I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON engage.%I FOR ALL
      USING (organization_id = engage.current_org_id())
      WITH CHECK (organization_id = engage.current_org_id())', t);
  END LOOP;
END $$;

-- Narrow the default grants. The ledger is append-only; the few mutable columns are scheduling and the provider's id.
-- status, attempt_count, claimed_at and the timestamps change only through the trigger and claim_message above.
REVOKE UPDATE, DELETE ON engage.messages, engage.message_events FROM messign_engage;
GRANT UPDATE (next_attempt_at, provider_message_id) ON engage.messages TO messign_engage;
