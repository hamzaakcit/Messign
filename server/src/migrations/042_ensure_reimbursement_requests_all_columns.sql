-- Ensure all reimbursement_requests columns exist (for DBs where 034/037/039 were skipped or out of sync)
-- Re-runnable: ADD COLUMN IF NOT EXISTS is safe to apply multiple times.
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS category_slug VARCHAR(100);
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS ai_confidence_score NUMERIC(3,2);
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(12,2);
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,4);
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS tip_amount DECIMAL(12,2);
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS team_id UUID;
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS current_approver_id UUID;
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS approval_chain JSONB DEFAULT '[]';
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS ai_category_suggestion VARCHAR(100);
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS ai_risk_score DECIMAL(3,2) DEFAULT 0;
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS ai_risk_flags JSONB DEFAULT '[]';
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS ai_review_notes TEXT;
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS ai_duplicate_refs JSONB DEFAULT '[]';
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS ai_policy_result JSONB;
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS ai_auto_approved BOOLEAN DEFAULT FALSE;
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS receipt_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS receipt_hash VARCHAR(64);
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS budget_id UUID;
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS vendor_id UUID;
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}';
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS updated_by UUID;
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Also ensure approval_steps columns exist
ALTER TABLE approval_steps ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50);
ALTER TABLE approval_steps ADD COLUMN IF NOT EXISTS entity_id UUID;
ALTER TABLE approval_steps ADD COLUMN IF NOT EXISTS step_name VARCHAR(100);

-- Also ensure expense_categories columns exist
ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS slug VARCHAR(100);
ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS gl_code VARCHAR(20);
