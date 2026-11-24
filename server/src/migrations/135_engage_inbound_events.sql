-- WP-27: what customers send us through a channel with a conversation (WhatsApp), kept only as far as the opt-out rules need.
--   * engage.inbound_events records each delivery once (provider + the provider's id), and what was done with it. It holds
--     no message text, no phone number and no name: only whether the message was an opt-out and what that did.
--   * It is the dedupe for provider retries (Meta retries a webhook for up to 7 days), and the evidence that an opt-out
--     request was received and applied.
--   * Append-only: the engage role can read and insert, not update or delete.

CREATE TABLE IF NOT EXISTS engage.inbound_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
  provider_event_id text NOT NULL CHECK (char_length(provider_event_id) BETWEEN 1 AND 300),
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  kind text NOT NULL CHECK (kind IN ('text', 'preference_stop', 'preference_resume')),
  -- opt_out_applied: the consent ledger got a revocation. no_opt_out: an ordinary message. unmatched: an opt-out nobody here
  -- can be matched to (no phone number given, or no such customer). resume_ignored: the customer resumed WhatsApp marketing in
  -- the app, which is not consent evidence we can use (a grant needs the tenant's own proof).
  outcome text NOT NULL CHECK (outcome IN ('opt_out_applied', 'no_opt_out', 'unmatched', 'resume_ignored')),
  profile_id uuid,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider, provider_event_id),
  FOREIGN KEY (organization_id, profile_id) REFERENCES engage.profiles (organization_id, id)
);
CREATE INDEX IF NOT EXISTS inbound_events_profile_idx ON engage.inbound_events (organization_id, profile_id);

ALTER TABLE engage.inbound_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE engage.inbound_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON engage.inbound_events;
CREATE POLICY tenant_isolation ON engage.inbound_events FOR ALL
  USING (organization_id = engage.current_org_id())
  WITH CHECK (organization_id = engage.current_org_id());

REVOKE UPDATE, DELETE ON engage.inbound_events FROM messign_engage;
GRANT SELECT, INSERT ON engage.inbound_events TO messign_engage;
