-- Unlayer round-trip design JSON for calendar/strategy email content (mirrors email_campaigns.body_design).
ALTER TABLE marketing_content
  ADD COLUMN IF NOT EXISTS body_design JSONB DEFAULT NULL;

COMMENT ON COLUMN marketing_content.body_design IS 'Unlayer design JSON for email content_type; pairs with body_html';
