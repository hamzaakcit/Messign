-- Ensures category_slug exists on reimbursement_requests (fixes "column does not exist" error)
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS category_slug VARCHAR(100);
