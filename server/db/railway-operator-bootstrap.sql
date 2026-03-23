-- ============================================================================
-- Railway / hosted Postgres — one-shot operator bootstrap (run as superuser)
-- ============================================================================
-- Use in Railway SQL Editor when you see:
--   - RLS blocking inserts (marketing_content, etc.)
--   - Missing OKR columns (Executive Dashboard / daily briefing)
--   - permission denied for schema public
--   - Missing Instagram / image columns on marketing_content
--
-- Security: BYPASSRLS and mass ownership transfer are powerful. Review before
-- production; prefer proper RLS policies + app role with BYPASSRLS only for
-- automation, not global postgres BYPASSRLS, in locked-down environments.
--
-- Canonical schema also lives in server/src/migrations/*.sql — keep this file
-- aligned when adding migrations.
-- ============================================================================

-- ── 1. BYPASS RLS FOR THE SERVER ROLE ───────────────────────────────────────
-- Stops "new row violates row-level security policy" for sessions using `postgres`
-- (or whichever role your pool uses). Revert: ALTER ROLE postgres WITH NOBYPASSRLS;

ALTER ROLE postgres WITH BYPASSRLS;

-- ── 2. OKR / GOALS COLUMNS (Executive Dashboard + Dora briefing) ────────────
-- App uses `okr_goals` and `okr_key_results` (see 046_okrs.sql, 083 migration).
-- Legacy tables `goals` / `okrs` are patched only if they exist.

BEGIN;

ALTER TABLE okr_goals ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;
ALTER TABLE okr_goals ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES reimbursement_users(id);

ALTER TABLE okr_key_results ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES reimbursement_users(id) ON DELETE SET NULL;
ALTER TABLE okr_key_results ADD COLUMN IF NOT EXISTS last_check_in_at TIMESTAMPTZ;

UPDATE okr_key_results kr
SET owner_id = g.owner_id
FROM okr_goals g
WHERE kr.goal_id = g.id
  AND kr.owner_id IS NULL
  AND g.owner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_okr_key_results_owner ON okr_key_results (owner_id);

DO $$
BEGIN
  IF to_regclass('public.goals') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE goals ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false';
    EXECUTE 'ALTER TABLE goals ADD COLUMN IF NOT EXISTS owner_id UUID';
  END IF;
  IF to_regclass('public.okrs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE okrs ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false';
    EXECUTE 'ALTER TABLE okrs ADD COLUMN IF NOT EXISTS owner_id UUID';
  END IF;
END $$;

COMMIT;

-- ── 3. SCHEMA public — GRANTS (no invalid MATERIALIZED VIEWS GRANT) ─────────
-- PostgreSQL has no `GRANT ... ON ALL MATERIALIZED VIEWS IN SCHEMA`; matviews
-- are granted in the DO block below.

GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO postgres;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, matviewname
    FROM pg_matviews
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'GRANT ALL ON TABLE %I.%I TO postgres',
      r.schemaname,
      r.matviewname
    );
  END LOOP;
END $$;

-- ── 4. INSTAGRAM / IMAGE COLUMNS + target_channel enum ─────────────────────
-- Enum: PG15+ can use ADD VALUE IF NOT EXISTS; older PG uses the DO block.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'target_channel' AND n.nspname = 'public'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'target_channel'
        AND e.enumlabel = 'instagram'
    ) THEN
      ALTER TYPE target_channel ADD VALUE 'instagram';
    END IF;
  END IF;
END $$;

ALTER TABLE marketing_content ADD COLUMN IF NOT EXISTS image_prompt TEXT;
ALTER TABLE marketing_content ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE marketing_content ADD COLUMN IF NOT EXISTS visual_description TEXT;
ALTER TABLE marketing_content ADD COLUMN IF NOT EXISTS image_generation_metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE marketing_content ADD COLUMN IF NOT EXISTS instagram_media_id TEXT;

-- ── 5. MASS OWNERSHIP TRANSFER (public tables → postgres) ───────────────────

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public')
  LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO postgres', r.tablename);
  END LOOP;
END $$;
