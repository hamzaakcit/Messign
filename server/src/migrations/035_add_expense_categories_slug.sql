-- Ensures slug exists on expense_categories (required for category lookup by slug)
ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS slug VARCHAR(100);
