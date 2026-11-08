-- WP-07: customer data model (ADR-005): profiles, identifiers, consent ledger + state, suppressions.
-- Rules enforced here, in the database, not only in code:
--   * one ACTIVE owner per email/phone value within a tenant, and one active email / phone per profile
--   * values are stored normalized (email lower-case + trimmed, phone E.164) -- a CHECK rejects anything else
--   * child rows can only point at a profile of the SAME tenant (composite foreign keys)
--   * consent is an append-only ledger; consent_state is derived by trigger and cannot be written directly
--   * suppressions are append-only and address-level; profile rows are never deleted (erasure nulls them)

CREATE TABLE IF NOT EXISTS engage.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  external_id text NOT NULL CHECK (char_length(external_id) BETWEEN 1 AND 200),
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  timezone text,
  locale text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  erased_at timestamptz,
  UNIQUE (organization_id, external_id),
  UNIQUE (organization_id, id)
);

CREATE TABLE IF NOT EXISTS engage.identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('email', 'phone', 'external')),
  value_normalized text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  FOREIGN KEY (organization_id, profile_id) REFERENCES engage.profiles (organization_id, id),
  CHECK (is_active = (deactivated_at IS NULL)),
  CHECK (type <> 'email' OR (value_normalized = lower(btrim(value_normalized))
         AND value_normalized ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND char_length(value_normalized) <= 254)),
  CHECK (type <> 'phone' OR value_normalized ~ '^\+[1-9][0-9]{7,14}$')
);
-- One active owner per value in a tenant.
CREATE UNIQUE INDEX IF NOT EXISTS identifiers_one_active_owner
  ON engage.identifiers (organization_id, type, value_normalized) WHERE is_active;
-- One active email and one active phone per profile.
CREATE UNIQUE INDEX IF NOT EXISTS identifiers_one_active_per_type
  ON engage.identifiers (organization_id, profile_id, type) WHERE is_active AND type <> 'external';
CREATE INDEX IF NOT EXISTS identifiers_profile_idx ON engage.identifiers (organization_id, profile_id);

CREATE TABLE IF NOT EXISTS engage.consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('sms', 'email', 'call', 'whatsapp')),
  purpose text NOT NULL DEFAULT 'marketing' CHECK (purpose = 'marketing'),
  status text NOT NULL CHECK (status IN ('granted', 'revoked')),
  source text NOT NULL CHECK (source IN ('iys', 'web', 'import', 'api', 'unsubscribe_link', 'stop_keyword')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  iys_synced_at timestamptz,
  FOREIGN KEY (organization_id, profile_id) REFERENCES engage.profiles (organization_id, id),
  -- A grant that did not come through IYS must carry evidence (Art. 7: the sender has to prove it).
  CHECK (status = 'revoked' OR source = 'iys' OR evidence <> '{}'::jsonb)
);
CREATE INDEX IF NOT EXISTS consents_profile_idx ON engage.consents (organization_id, profile_id, channel, recorded_at DESC);

CREATE TABLE IF NOT EXISTS engage.consent_state (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('sms', 'email', 'call', 'whatsapp')),
  purpose text NOT NULL CHECK (purpose = 'marketing'),
  status text NOT NULL CHECK (status IN ('granted', 'revoked')),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (organization_id, profile_id, channel, purpose),
  FOREIGN KEY (organization_id, profile_id) REFERENCES engage.profiles (organization_id, id)
);

CREATE TABLE IF NOT EXISTS engage.suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('sms', 'email', 'call', 'whatsapp')),
  value_normalized text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('hard_bounce', 'complaint', 'opt_out', 'manual', 'invalid')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, channel, value_normalized)
);

-- consent_state follows the ledger. Out-of-order rows (older recorded_at) never overwrite a newer state.
-- SECURITY DEFINER because the engage role has no write access to consent_state; RLS still applies (FORCE).
CREATE OR REPLACE FUNCTION engage.apply_consent() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, engage AS $$
BEGIN
  INSERT INTO engage.consent_state AS s (organization_id, profile_id, channel, purpose, status, updated_at)
  VALUES (NEW.organization_id, NEW.profile_id, NEW.channel, NEW.purpose, NEW.status, NEW.recorded_at)
  ON CONFLICT (organization_id, profile_id, channel, purpose) DO UPDATE
    SET status = EXCLUDED.status, updated_at = EXCLUDED.updated_at
    WHERE s.updated_at <= EXCLUDED.updated_at;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION engage.apply_consent() FROM PUBLIC;

DROP TRIGGER IF EXISTS consents_apply ON engage.consents;
CREATE TRIGGER consents_apply AFTER INSERT ON engage.consents
  FOR EACH ROW EXECUTE FUNCTION engage.apply_consent();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles', 'identifiers', 'consents', 'consent_state', 'suppressions'] LOOP
    EXECUTE format('ALTER TABLE engage.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE engage.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON engage.%I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON engage.%I FOR ALL
      USING (organization_id = engage.current_org_id())
      WITH CHECK (organization_id = engage.current_org_id())', t);
  END LOOP;
END $$;

-- Default privileges from migration 111 granted everything; narrow them.
-- Profiles and identifiers: no DELETE (erasure nulls and deactivates; the ledger keeps pointing at the profile).
REVOKE DELETE ON engage.profiles, engage.identifiers FROM messign_engage;
-- Consent ledger and suppressions are append-only. The IYS sync may stamp iys_synced_at, nothing else changes.
REVOKE UPDATE, DELETE ON engage.consents, engage.suppressions FROM messign_engage;
GRANT UPDATE (iys_synced_at) ON engage.consents TO messign_engage;
-- consent_state is written only by the trigger.
REVOKE INSERT, UPDATE, DELETE ON engage.consent_state FROM messign_engage;
