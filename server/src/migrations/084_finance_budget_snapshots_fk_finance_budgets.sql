-- finance_budget_snapshots.budget_id must reference finance_budgets (see 033_consolidate_budgets.sql).
-- Some DBs still have the pre-consolidation FK to legacy `budgets`; real seed data lives in finance_budgets.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'finance_budget_snapshots'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'finance_budgets'
  ) THEN
    ALTER TABLE finance_budget_snapshots DROP CONSTRAINT IF EXISTS finance_budget_snapshots_budget_id_fkey;
    ALTER TABLE finance_budget_snapshots
      ADD CONSTRAINT finance_budget_snapshots_budget_id_fkey
      FOREIGN KEY (budget_id) REFERENCES finance_budgets(id) ON DELETE CASCADE;
  END IF;
END $$;
