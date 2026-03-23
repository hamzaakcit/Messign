-- ============================================================================
-- Supabase Storage: public bucket for marketing images (imageService.ts)
-- Run in Supabase Dashboard → SQL Editor (same project as Storage).
--
-- Preferred for version control: from repo root, `supabase link` + `supabase db push`
-- applies ../../supabase/migrations/*_marketing_images_storage_bucket.sql (same SQL).
--
-- Alternative: Storage → New bucket → name `marketing-images` → enable Public.
-- Then set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in server/.env (see DEPLOYMENT.md).
--
-- Returned URLs use: /storage/v1/object/public/marketing-images/...
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('marketing-images', 'marketing-images', true)
ON CONFLICT (id) DO UPDATE
SET public = true;
