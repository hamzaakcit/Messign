-- Unlayer design JSON for round-trip editing (HTML alone is not reloadable in the builder).
ALTER TABLE marketing_email_campaigns
ADD COLUMN IF NOT EXISTS body_design JSONB DEFAULT NULL;
