-- User-uploaded base photo URL for AI additive edits (FLUX Kontext / similar).
-- Final composite remains in image_url.

ALTER TABLE marketing_content
  ADD COLUMN IF NOT EXISTS reference_image_url TEXT NULL;

COMMENT ON COLUMN marketing_content.reference_image_url IS
  'Public HTTPS URL of user-uploaded real-world photo used as input for AI edits; output stored in image_url';
