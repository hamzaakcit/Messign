# Supabase (hosted project)

This folder was created with `supabase init`. Migrations under `migrations/` apply to your **Supabase-hosted** Postgres (including `storage`).

## Marketing images bucket

The migration `*_marketing_images_storage_bucket.sql` creates the public `marketing-images` bucket used by [`server/src/services/marketing/publishing/imageService.ts`](../server/src/services/marketing/publishing/imageService.ts).

## CLI: link and push

From the **repository root** (`messign-workspace/`):

1. Install the [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started).
2. `supabase login` (once per machine).
3. `supabase link --project-ref <YOUR_PROJECT_REF>` — ref is in **Dashboard → Project Settings → General** (not the anon key).
4. `supabase db push` — runs pending migrations against the linked project.

Alternatively, open the same SQL in **Dashboard → SQL Editor**, or use the copy in [`server/db/supabase-marketing-images-bucket.sql`](../server/db/supabase-marketing-images-bucket.sql).

After the bucket exists, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the API server (see `server/DEPLOYMENT.md`).
