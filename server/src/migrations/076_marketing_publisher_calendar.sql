-- Background publisher: processing lock state, published URL, error audit trail

ALTER TABLE marketing_content_calendar DROP CONSTRAINT IF EXISTS marketing_content_calendar_status_check;

ALTER TABLE marketing_content_calendar
  ADD CONSTRAINT marketing_content_calendar_status_check
  CHECK (status IN ('planned', 'scheduled', 'processing', 'published', 'failed'));

ALTER TABLE marketing_content_calendar
  ADD COLUMN IF NOT EXISTS published_url TEXT,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS external_post_id VARCHAR(512);

CREATE INDEX IF NOT EXISTS idx_mkt_content_cal_due
  ON marketing_content_calendar (status, scheduled_at)
  WHERE status IN ('scheduled', 'processing');

COMMENT ON COLUMN marketing_content_calendar.published_url IS 'Live URL after successful publish (adapter-dependent)';
COMMENT ON COLUMN marketing_content_calendar.last_error IS 'Last adapter/API error message when status = failed';
COMMENT ON COLUMN marketing_content_calendar.external_post_id IS 'Opaque id from LinkedIn/X/email provider';
