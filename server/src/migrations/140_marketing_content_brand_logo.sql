-- Logo file the shop attaches. Generated stills place this file on the photo.
-- The image model is not asked to paint the brand name.
ALTER TABLE marketing_content ADD COLUMN IF NOT EXISTS brand_logo_url text;

COMMENT ON COLUMN marketing_content.brand_logo_url IS
  'Public URL of the shop logo placed on generated stills. The image model does not paint it.';
