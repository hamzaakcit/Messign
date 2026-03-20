-- ============================================================================
-- Migration 081: Instagram channel support + AI image generation columns
-- ============================================================================

BEGIN;

ALTER TABLE marketing_content
  ADD COLUMN IF NOT EXISTS image_prompt TEXT;

COMMENT ON COLUMN marketing_content.image_prompt IS
  'Structured prompt sent to the image generation model. Extracted from [IMAGE_PROMPT] block in agent output.';

ALTER TABLE marketing_content
  ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN marketing_content.image_url IS
  'Public URL of the generated or uploaded hero image (storage).';

ALTER TABLE marketing_content
  ADD COLUMN IF NOT EXISTS visual_description TEXT;

COMMENT ON COLUMN marketing_content.visual_description IS
  'Plain-English visual brief for the image. Used for alt-text and designer handoff.';

ALTER TABLE marketing_content
  ADD COLUMN IF NOT EXISTS image_generation_metadata JSONB DEFAULT NULL;

COMMENT ON COLUMN marketing_content.image_generation_metadata IS
  'Generation metadata: { model, resolution, seed, retries, generated_at, duration_ms }';

CREATE INDEX IF NOT EXISTS idx_marketing_content_pending_image
  ON marketing_content (organization_id, channel)
  WHERE channel = 'instagram' AND image_url IS NULL AND status != 'archived';

COMMIT;
