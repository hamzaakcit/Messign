-- Marketing images: public Storage bucket (see server imageService.ts uploadToStorage).
-- Applied via: supabase link --project-ref <ref> && supabase db push
-- Or run the same SQL in Dashboard → SQL Editor (duplicate of server/db/supabase-marketing-images-bucket.sql).

INSERT INTO storage.buckets (id, name, public)
VALUES ('marketing-images', 'marketing-images', true)
ON CONFLICT (id) DO UPDATE
SET public = true;
