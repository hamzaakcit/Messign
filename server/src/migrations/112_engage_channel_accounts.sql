-- WP-06: per-tenant messaging credentials (ADR-006). Secrets are AES-256-GCM ciphertext under a per-row data key,
-- which is itself wrapped by the master key (ENGAGE_MASTER_KEY) named by key_id. The database never sees plaintext.
-- The engage role can read and insert rows but cannot edit a secret afterwards or delete a row: rotation inserts a
-- new row and disables the old one, so the history stays for audit.

CREATE TABLE IF NOT EXISTS engage.channel_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  provider text NOT NULL CHECK (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
  mode text NOT NULL CHECK (mode IN ('test', 'live')),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 100),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_ciphertext bytea NOT NULL,
  wrapped_data_key bytea NOT NULL,
  key_id text NOT NULL,
  secret_fingerprint text NOT NULL,
  secret_hint text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  supersedes_id uuid REFERENCES engage.channel_accounts(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz,
  rewrapped_at timestamptz,
  disabled_at timestamptz
);

-- One active account per tenant, channel and label.
CREATE UNIQUE INDEX IF NOT EXISTS channel_accounts_one_active
  ON engage.channel_accounts (organization_id, channel, label) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS channel_accounts_org_idx ON engage.channel_accounts (organization_id, created_at DESC);

ALTER TABLE engage.channel_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE engage.channel_accounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON engage.channel_accounts;
CREATE POLICY tenant_isolation ON engage.channel_accounts FOR ALL
  USING (organization_id = engage.current_org_id())
  WITH CHECK (organization_id = engage.current_org_id());

-- Default privileges from migration 111 granted everything; narrow it for this table.
REVOKE UPDATE, DELETE ON engage.channel_accounts FROM messign_engage;
GRANT SELECT, INSERT ON engage.channel_accounts TO messign_engage;
GRANT UPDATE (status, disabled_at, rotated_at, wrapped_data_key, key_id, rewrapped_at) ON engage.channel_accounts TO messign_engage;
