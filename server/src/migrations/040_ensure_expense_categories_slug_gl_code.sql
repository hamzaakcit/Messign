-- Ensure expense_categories has slug and gl_code (idempotent; fixes DBs where 035/039 were skipped or out of sync)
ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS slug VARCHAR(100);
ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS gl_code VARCHAR(20);
