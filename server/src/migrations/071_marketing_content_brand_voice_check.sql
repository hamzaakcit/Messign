-- Persist Brand Voice Checker output when submitting for review (after product truth PASS)

ALTER TABLE marketing_content
  ADD COLUMN IF NOT EXISTS brand_voice_check JSONB,
  ADD COLUMN IF NOT EXISTS brand_voice_checked_at TIMESTAMPTZ;

COMMENT ON COLUMN marketing_content.brand_voice_check IS 'Last brand voice checker JSON (score, dimensions, strengths, improvements)';
COMMENT ON COLUMN marketing_content.brand_voice_checked_at IS 'When brand_voice_check was produced';
