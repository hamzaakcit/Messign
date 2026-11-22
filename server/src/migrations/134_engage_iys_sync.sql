-- WP-26: İYS sync (ADR-022): pull recipients' consent changes from İYS, push the tenant's opt-outs to İYS.
--   * A tenant's İYS credentials are a channel account of channel 'iys' (username and password as secrets, iys_code and
--     brand_code as config), so they get the same per-tenant encryption, rotation and key re-wrapping as every other
--     credential. One active İYS account per tenant. Messages can never use one (messages.channel stays email/sms/whatsapp).
--   * engage.iys_outbox is the push queue, one row per opt-out. It is filled by a trigger on the consent ledger, in the
--     same transaction as the opt-out, so no code path (unsubscribe link, STOP keyword, API, import) can record an opt-out
--     and forget to report it. The row is the audit of the report: status, outcome, attempts, İYS's transaction id.
--     The recipient address is kept only until the row is final, then emptied.
--   * engage.iys_changes records every pulled movement once (by İYS's transaction id) and what was done with it. It holds
--     no address: the recipient is matched to a profile and then forgotten.
--   * engage.iys_sync_state keeps the pull marker (İYS's `after`) and when the last pull succeeded, for the SLA monitor.
--   * engage.iys_sync_work lists tenants with an İYS account across tenants (ids only), like the lists of 121-133.

ALTER TABLE engage.channel_accounts DROP CONSTRAINT IF EXISTS channel_accounts_channel_check;
ALTER TABLE engage.channel_accounts ADD CONSTRAINT channel_accounts_channel_check CHECK (channel IN ('email', 'sms', 'whatsapp', 'iys'));
CREATE UNIQUE INDEX IF NOT EXISTS channel_accounts_one_active_iys ON engage.channel_accounts (organization_id) WHERE channel = 'iys' AND status = 'active';

CREATE TABLE IF NOT EXISTS engage.iys_sync_state (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  -- İYS's marker of the last movement applied: <epoch seconds>_<transaction id>.
  changes_after text CHECK (changes_after IS NULL OR changes_after ~ '^[0-9]{1,12}_[0-9a-f]{1,128}$'),
  last_pull_at timestamptz,
  last_pull_attempt_at timestamptz,
  last_pull_outcome text CHECK (last_pull_outcome IS NULL OR last_pull_outcome IN ('ok', 'error', 'rate_limited', 'auth_error', 'config_error')),
  last_pull_error_code text CHECK (last_pull_error_code IS NULL OR last_pull_error_code ~ '^[A-Za-z0-9_.:-]{1,64}$'),
  last_pull_applied integer NOT NULL DEFAULT 0 CHECK (last_pull_applied >= 0),
  last_push_attempt_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS engage.iys_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  consent_id uuid NOT NULL REFERENCES engage.consents(id),
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'call')),
  consent_source text NOT NULL CHECK (consent_source IN ('web', 'import', 'api', 'unsubscribe_link', 'stop_keyword')),
  -- The address the opt-out was recorded for. Emptied once the row is final.
  recipient text,
  -- When the recipient opted out (the ledger's recorded_at); İYS's three-business-day limit counts from here.
  consent_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'skipped', 'failed')),
  -- sent: registered | already_current. skipped: not_in_iys | superseded | historical | recipient_unavailable.
  -- failed: deadline_missed | rejected | gave_up.
  outcome text CHECK (outcome IS NULL OR outcome ~ '^[a-z0-9_]{1,64}$'),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  last_error_code text CHECK (last_error_code IS NULL OR last_error_code ~ '^[A-Za-z0-9_.:-]{1,64}$'),
  transaction_id text CHECK (transaction_id IS NULL OR char_length(transaction_id) BETWEEN 1 AND 128),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, consent_id),
  FOREIGN KEY (organization_id, profile_id) REFERENCES engage.profiles (organization_id, id),
  CHECK (status = 'pending' OR outcome IS NOT NULL),
  CHECK (status <> 'sent' OR sent_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS iys_outbox_profile_idx ON engage.iys_outbox (organization_id, profile_id);
CREATE INDEX IF NOT EXISTS iys_outbox_due_idx ON engage.iys_outbox (organization_id, next_attempt_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS engage.iys_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  transaction_id text NOT NULL CHECK (char_length(transaction_id) BETWEEN 1 AND 128),
  iys_type text NOT NULL CHECK (iys_type IN ('ARAMA', 'MESAJ', 'EPOSTA')),
  iys_status text NOT NULL CHECK (iys_status IN ('ONAY', 'RET')),
  iys_source text NOT NULL CHECK (iys_source ~ '^[A-Z0-9_]{1,40}$'),
  consent_at timestamptz,
  iys_created_at timestamptz,
  profile_id uuid,
  -- applied: written to the consent ledger. unmatched: nobody in this tenant has that address. ignored: not for us to apply.
  outcome text NOT NULL CHECK (outcome IN ('applied', 'unmatched', 'ignored')),
  pulled_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, transaction_id),
  FOREIGN KEY (organization_id, profile_id) REFERENCES engage.profiles (organization_id, id)
);
CREATE INDEX IF NOT EXISTS iys_changes_profile_idx ON engage.iys_changes (organization_id, profile_id);

-- A finished queue row stays as it is; only its address may still be emptied.
CREATE OR REPLACE FUNCTION engage.iys_outbox_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'pending' AND (
       NEW.status IS DISTINCT FROM OLD.status OR NEW.outcome IS DISTINCT FROM OLD.outcome OR NEW.attempts IS DISTINCT FROM OLD.attempts
       OR NEW.next_attempt_at IS DISTINCT FROM OLD.next_attempt_at OR NEW.claimed_at IS DISTINCT FROM OLD.claimed_at
       OR NEW.last_error_code IS DISTINCT FROM OLD.last_error_code OR NEW.transaction_id IS DISTINCT FROM OLD.transaction_id
       OR NEW.sent_at IS DISTINCT FROM OLD.sent_at OR (NEW.recipient IS NOT NULL AND NEW.recipient IS DISTINCT FROM OLD.recipient)) THEN
    RAISE EXCEPTION 'a finished İYS report cannot change' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS iys_outbox_guard ON engage.iys_outbox;
CREATE TRIGGER iys_outbox_guard BEFORE UPDATE ON engage.iys_outbox FOR EACH ROW EXECUTE FUNCTION engage.iys_outbox_guard();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['iys_sync_state', 'iys_outbox', 'iys_changes'] LOOP
    EXECUTE format('ALTER TABLE engage.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE engage.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON engage.%I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON engage.%I FOR ALL
      USING (organization_id = engage.current_org_id())
      WITH CHECK (organization_id = engage.current_org_id())', t);
  END LOOP;
END $$;

REVOKE DELETE ON engage.iys_sync_state FROM messign_engage;
REVOKE UPDATE, DELETE ON engage.iys_outbox, engage.iys_changes FROM messign_engage;
GRANT UPDATE (status, outcome, attempts, next_attempt_at, claimed_at, last_error_code, transaction_id, sent_at, recipient) ON engage.iys_outbox TO messign_engage;

-- Every opt-out the tenant records is queued for İYS, in the transaction that records it. Only an opt-out that has
-- something to revoke is queued: the profile must have been granted before (İYS refuses a first record that is a RET), the
-- tenant must have an active İYS account, and the profile must have an address for the channel. What came from İYS is
-- never reported back. This runs as the invoking role, so row-level security still applies.
CREATE OR REPLACE FUNCTION engage.enqueue_iys_opt_out() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_addr text;
BEGIN
  IF NEW.status <> 'revoked' OR NEW.source = 'iys' OR NEW.channel NOT IN ('email', 'sms', 'call') THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM engage.channel_accounts a WHERE a.organization_id = NEW.organization_id AND a.channel = 'iys' AND a.status = 'active') THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM engage.consents c WHERE c.organization_id = NEW.organization_id AND c.profile_id = NEW.profile_id AND c.channel = NEW.channel AND c.status = 'granted' AND c.id <> NEW.id) THEN RETURN NEW; END IF;
  SELECT i.value_normalized INTO v_addr FROM engage.identifiers i
   WHERE i.organization_id = NEW.organization_id AND i.profile_id = NEW.profile_id AND i.is_active AND i.type = CASE WHEN NEW.channel = 'email' THEN 'email' ELSE 'phone' END;
  IF v_addr IS NULL THEN RETURN NEW; END IF;
  INSERT INTO engage.iys_outbox (organization_id, profile_id, consent_id, channel, consent_source, recipient, consent_at)
  VALUES (NEW.organization_id, NEW.profile_id, NEW.id, NEW.channel, NEW.source, v_addr, NEW.recorded_at)
  ON CONFLICT (organization_id, consent_id) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS consents_enqueue_iys ON engage.consents;
CREATE TRIGGER consents_enqueue_iys AFTER INSERT ON engage.consents FOR EACH ROW EXECUTE FUNCTION engage.enqueue_iys_opt_out();

CREATE OR REPLACE FUNCTION engage.iys_sync_work(p_orgs uuid[] DEFAULT NULL)
RETURNS TABLE (organization_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT DISTINCT a.organization_id FROM engage.channel_accounts a
   WHERE a.channel = 'iys' AND a.status = 'active' AND (p_orgs IS NULL OR a.organization_id = ANY (p_orgs))
   ORDER BY a.organization_id LIMIT 1000
$$;
REVOKE ALL ON FUNCTION engage.iys_sync_work(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION engage.iys_sync_work(uuid[]) TO messign_engage;
