-- Ensure reimbursement_requests has columns required by finance seed (idempotent)
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS category_slug VARCHAR(100);
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS ai_confidence_score NUMERIC(3,2);
