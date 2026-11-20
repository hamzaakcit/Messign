-- WP-39: the email domain authentication check.
--   * A check looks up, in DNS (read-only), the SPF record, the DKIM selectors the admin names and the DMARC record
--     of the domain in the active email account's From address. One row records what was found: the domain, the
--     selectors and a small result per mechanism (found or not, and a code), never the record text itself.
--   * The readiness item `email_domain_authenticated` is set from a passing check and removed by a failing one; the
--     application refuses to record it by hand. The row below is the evidence behind that item.
--   * Rows are append-only: nothing can be updated or deleted, so the history of checks stays.

CREATE TABLE IF NOT EXISTS engage.email_domain_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_account_id uuid NOT NULL REFERENCES engage.channel_accounts(id),
  domain text NOT NULL CHECK (
    char_length(domain) BETWEEN 4 AND 253 AND domain = lower(domain)
    AND domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
  dkim_selectors text[] NOT NULL DEFAULT '{}' CHECK (cardinality(dkim_selectors) <= 5),
  -- {ok: boolean, code: text}; dkim is [{selector, ok, code}]; dmarc adds {policy} when a policy was found.
  spf jsonb NOT NULL CHECK (jsonb_typeof(spf) = 'object'),
  dkim jsonb NOT NULL CHECK (jsonb_typeof(dkim) = 'array'),
  dmarc jsonb NOT NULL CHECK (jsonb_typeof(dmarc) = 'object'),
  passed boolean NOT NULL,
  checked_by uuid,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_domain_checks_org_idx ON engage.email_domain_checks (organization_id, checked_at DESC);

ALTER TABLE engage.email_domain_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE engage.email_domain_checks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON engage.email_domain_checks;
CREATE POLICY tenant_isolation ON engage.email_domain_checks FOR ALL
  USING (organization_id = engage.current_org_id())
  WITH CHECK (organization_id = engage.current_org_id());

-- Default privileges from migration 111 granted everything; this is evidence, so it can only be read and added to.
REVOKE UPDATE, DELETE ON engage.email_domain_checks FROM messign_engage;
GRANT SELECT, INSERT ON engage.email_domain_checks TO messign_engage;
