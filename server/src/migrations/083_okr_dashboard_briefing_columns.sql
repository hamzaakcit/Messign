-- ============================================================================
-- Migration 083: OKR columns expected by Executive Dashboard + dailyBriefing
-- ============================================================================
-- Code references: dal/executive/dashboard.ts (okr_goals.is_archived),
-- services/dora/dailyBriefing.ts (okr_goals.owner_id, okr_key_results.owner_id,
-- last_check_in_at).
-- Legacy table names `goals` / `okrs` (if present) get the same columns for
-- Railway / hand-migrated DBs.
-- ============================================================================

BEGIN;

-- Canonical OKR schema (046_okrs.sql)
ALTER TABLE okr_goals ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

-- Older DBs may lack owner_id; fresh 046 has NOT NULL — add only if missing
ALTER TABLE okr_goals ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES reimbursement_users(id);

COMMENT ON COLUMN okr_goals.is_archived IS 'When true, excluded from dashboard / briefing aggregates';

-- Key results: dailyBriefing filters by owner + stale check-ins
ALTER TABLE okr_key_results ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES reimbursement_users(id) ON DELETE SET NULL;
ALTER TABLE okr_key_results ADD COLUMN IF NOT EXISTS last_check_in_at TIMESTAMPTZ;

COMMENT ON COLUMN okr_key_results.owner_id IS 'Denormalized from parent goal owner for briefing queries';
COMMENT ON COLUMN okr_key_results.last_check_in_at IS 'Last okr_check_ins timestamp for this KR (maintained by app or triggers)';

UPDATE okr_key_results kr
SET owner_id = g.owner_id
FROM okr_goals g
WHERE kr.goal_id = g.id
  AND kr.owner_id IS NULL
  AND g.owner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_okr_key_results_owner ON okr_key_results (owner_id);

-- Optional legacy names (not in repo migrations; safe no-op if absent)
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
