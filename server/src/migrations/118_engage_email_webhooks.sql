-- WP-12: provider webhooks.
--   * message_events gains 'complained'. It never changes a message's status (a complaint arrives after delivery);
--     the apply trigger already ignores types without a rank. The suppression it causes is the effect that matters.
--   * a provider webhook has no tenant yet: it names the account in the URL. Like the API-key lookup (migration 111),
--     a request may read exactly the one channel_accounts row whose id it sets transaction-locally; writes still need
--     the tenant policy.

ALTER TABLE engage.message_events DROP CONSTRAINT IF EXISTS message_events_type_check;
ALTER TABLE engage.message_events ADD CONSTRAINT message_events_type_check
  CHECK (type IN ('sending', 'retry_scheduled', 'sent', 'delivered', 'failed', 'bounced', 'blocked', 'complained'));

DROP POLICY IF EXISTS account_webhook_lookup ON engage.channel_accounts;
CREATE POLICY account_webhook_lookup ON engage.channel_accounts FOR SELECT
  USING (id::text = NULLIF(current_setting('engage.lookup_account_id', true), ''));
