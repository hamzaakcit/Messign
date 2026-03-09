-- Add columns required by finance seed that may be missing from earlier migrations
ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS gl_code VARCHAR(20);
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS ai_confidence_score NUMERIC(3,2);
