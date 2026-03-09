-- ============================================
-- FIX ALL MISSING TABLES AND COLUMNS
-- Run this migration to fix database issues without dropping data.
-- Matches existing code: reimbursement_requests, approval_steps, channels.updated_at, messages.attachments
-- ============================================

-- ============================================
-- 1. ADD MISSING COLUMNS TO EXISTING TABLES
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'channels' AND column_name = 'updated_at') THEN
    ALTER TABLE channels ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'attachments') THEN
    ALTER TABLE messages ADD COLUMN attachments JSONB NOT NULL DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'mentions') THEN
    ALTER TABLE messages ADD COLUMN mentions JSONB NOT NULL DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'xp_gained') THEN
    ALTER TABLE messages ADD COLUMN xp_gained INT NOT NULL DEFAULT 0;
  END IF;
END $$;

-- expense_categories: columns required by GET /api/categories
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'expense_categories' AND column_name = 'spending_limit') THEN
    ALTER TABLE expense_categories ADD COLUMN spending_limit DECIMAL(12,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'expense_categories' AND column_name = 'requires_justification_above') THEN
    ALTER TABLE expense_categories ADD COLUMN requires_justification_above DECIMAL(12,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'expense_categories' AND column_name = 'created_at') THEN
    ALTER TABLE expense_categories ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- reimbursement_settings: columns required by GET /api/settings/reimbursement
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'reimbursement_settings' AND column_name = 'meal_limit') THEN
    ALTER TABLE reimbursement_settings ADD COLUMN meal_limit DECIMAL(12,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'reimbursement_settings' AND column_name = 'daily_limit') THEN
    ALTER TABLE reimbursement_settings ADD COLUMN daily_limit DECIMAL(12,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'reimbursement_settings' AND column_name = 'monthly_limit') THEN
    ALTER TABLE reimbursement_settings ADD COLUMN monthly_limit DECIMAL(12,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'reimbursement_settings' AND column_name = 'require_signed_invoice_above') THEN
    ALTER TABLE reimbursement_settings ADD COLUMN require_signed_invoice_above DECIMAL(12,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'reimbursement_settings' AND column_name = 'auto_approve_below') THEN
    ALTER TABLE reimbursement_settings ADD COLUMN auto_approve_below DECIMAL(12,2);
  END IF;
END $$;

-- channel_members: per-user last read for unread count
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'channel_members' AND column_name = 'last_read_at') THEN
    ALTER TABLE channel_members ADD COLUMN last_read_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- ============================================
-- 2. CREATE REIMBURSEMENT REQUESTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS reimbursement_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    submitted_by UUID NOT NULL REFERENCES reimbursement_users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category_id UUID NOT NULL REFERENCES expense_categories(id),
    original_amount DECIMAL(12,2) NOT NULL,
    original_currency CHAR(3) NOT NULL,
    exchange_rate DECIMAL(18,8),
    converted_amount DECIMAL(12,2),
    status VARCHAR(30) NOT NULL DEFAULT 'draft',
    expense_date DATE NOT NULL,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reimbursement_requests_org ON reimbursement_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_reimbursement_requests_submitted_by ON reimbursement_requests(submitted_by);
CREATE INDEX IF NOT EXISTS idx_reimbursement_requests_status ON reimbursement_requests(status);
CREATE INDEX IF NOT EXISTS idx_reimbursement_requests_expense_date ON reimbursement_requests(expense_date DESC);

-- ============================================
-- 3. CREATE REIMBURSEMENT DOCUMENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS reimbursement_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reimbursement_id UUID NOT NULL REFERENCES reimbursement_requests(id) ON DELETE CASCADE,
    document_type VARCHAR(30) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_size_bytes BIGINT,
    mime_type VARCHAR(100),
    ocr_processed BOOLEAN NOT NULL DEFAULT FALSE,
    ocr_vendor_name VARCHAR(255),
    ocr_amount DECIMAL(12,2),
    ocr_currency CHAR(3),
    ocr_date DATE,
    ocr_confidence_score DECIMAL(5,4),
    ocr_raw_response JSONB,
    signature_status VARCHAR(30),
    verified_by UUID REFERENCES reimbursement_users(id),
    verified_at TIMESTAMPTZ,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reimbursement_documents_reimbursement ON reimbursement_documents(reimbursement_id);
CREATE INDEX IF NOT EXISTS idx_reimbursement_documents_type ON reimbursement_documents(document_type);

-- ============================================
-- 4. CREATE REIMBURSEMENT ACTIVITY LOG TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS reimbursement_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reimbursement_id UUID NOT NULL REFERENCES reimbursement_requests(id) ON DELETE CASCADE,
    user_id UUID REFERENCES reimbursement_users(id),
    action VARCHAR(50) NOT NULL,
    action_details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reimbursement_activity_reimbursement ON reimbursement_activity_log(reimbursement_id);
CREATE INDEX IF NOT EXISTS idx_reimbursement_activity_created ON reimbursement_activity_log(created_at DESC);

-- ============================================
-- 5. CREATE REIMBURSEMENT COMMENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS reimbursement_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reimbursement_id UUID NOT NULL REFERENCES reimbursement_requests(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES reimbursement_users(id),
    comment_text TEXT NOT NULL,
    is_internal BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reimbursement_comments_reimbursement ON reimbursement_comments(reimbursement_id);

-- ============================================
-- 6. CREATE APPROVAL STEPS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS approval_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reimbursement_id UUID NOT NULL REFERENCES reimbursement_requests(id) ON DELETE CASCADE,
    step_order SMALLINT NOT NULL,
    step_type VARCHAR(30) NOT NULL,
    assigned_to UUID REFERENCES reimbursement_users(id),
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    decision_at TIMESTAMPTZ,
    decision_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_steps_reimbursement ON approval_steps(reimbursement_id);
CREATE INDEX IF NOT EXISTS idx_approval_steps_assignee ON approval_steps(assigned_to, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_steps_unique_step ON approval_steps(reimbursement_id, step_order);
