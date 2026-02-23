-- ============================================
-- COMPREHENSIVE FIX: All missing tables and columns
-- Safe to run multiple times (idempotent)
-- ============================================

-- ============================================
-- 1. performance_teams.updated_at (used by admin/departments PUT/DELETE and admin/performance)
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'performance_teams' AND column_name = 'updated_at') THEN
    ALTER TABLE performance_teams ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- ============================================
-- 2. performance_team_members.end_date (used by admin/performance members CRUD)
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'performance_team_members' AND column_name = 'end_date') THEN
    ALTER TABLE performance_team_members ADD COLUMN end_date DATE;
  END IF;
END $$;

-- ============================================
-- 3. performance_team_members.updated_at (used by admin/performance members CRUD)
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'performance_team_members' AND column_name = 'updated_at') THEN
    ALTER TABLE performance_team_members ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- ============================================
-- 4. performance_targets.updated_at (used by admin/performance targets CRUD)
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'performance_targets' AND column_name = 'updated_at') THEN
    ALTER TABLE performance_targets ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- ============================================
-- 5. performance_audit_log table (dropped in schema.sql but never recreated; used by admin/performance)
-- ============================================
CREATE TABLE IF NOT EXISTS performance_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(255),
    before_value JSONB,
    after_value JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_performance_audit_log_action ON performance_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_performance_audit_log_created ON performance_audit_log(created_at DESC);

-- ============================================
-- 6. admin_audit_log table (used by auditDb.ts for ALL admin actions: employees, departments, roles, badges, settings)
-- ============================================
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id VARCHAR(255),
    description TEXT NOT NULL DEFAULT '',
    changes JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin ON admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON admin_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log(created_at DESC);

-- ============================================
-- 7. mileage_claims table (dropped in schema.sql but may be referenced)
-- ============================================
CREATE TABLE IF NOT EXISTS mileage_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reimbursement_id UUID NOT NULL REFERENCES reimbursement_requests(id) ON DELETE CASCADE,
    origin_address TEXT NOT NULL,
    destination_address TEXT NOT NULL,
    distance_km DECIMAL(10,2) NOT NULL,
    rate_per_km DECIMAL(8,4) NOT NULL DEFAULT 0.67,
    calculated_amount DECIMAL(12,2) NOT NULL,
    route_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mileage_claims_reimbursement ON mileage_claims(reimbursement_id);

-- ============================================
-- 8. Ensure invoices tables exist (from add_invoice_system migration)
-- ============================================
CREATE TABLE IF NOT EXISTS bank_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(100) NOT NULL,
    bank_name VARCHAR(255) NOT NULL,
    iban VARCHAR(34),
    swift VARCHAR(11),
    account_holder VARCHAR(255),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(100) NOT NULL,
    signature_data TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exchange_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base_currency CHAR(3) NOT NULL,
    target_currency CHAR(3) NOT NULL,
    rate DECIMAL(18,8) NOT NULL,
    source VARCHAR(50) NOT NULL DEFAULT 'manual',
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(base_currency, target_currency)
);

CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id VARCHAR(100) NOT NULL,
    invoice_number VARCHAR(50) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    generated_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    status VARCHAR(30) NOT NULL DEFAULT 'draft',
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    currency CHAR(3) NOT NULL DEFAULT 'EUR',
    notes TEXT,
    rejection_note TEXT,
    bank_detail_id UUID REFERENCES bank_details(id),
    signature_id UUID REFERENCES signatures(id),
    signed_at TIMESTAMPTZ,
    signature_snapshot TEXT,
    pdf_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS invoice_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
    unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure invoice signing columns exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'rejection_note') THEN
    ALTER TABLE invoices ADD COLUMN rejection_note TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'signed_at') THEN
    ALTER TABLE invoices ADD COLUMN signed_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'signature_snapshot') THEN
    ALTER TABLE invoices ADD COLUMN signature_snapshot TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'pdf_url') THEN
    ALTER TABLE invoices ADD COLUMN pdf_url TEXT;
  END IF;
END $$;

-- ============================================
-- 9. reimbursement_users: ensure phone, location columns exist (used by employee routes)
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'reimbursement_users' AND column_name = 'phone') THEN
    ALTER TABLE reimbursement_users ADD COLUMN phone VARCHAR(50);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'reimbursement_users' AND column_name = 'location') THEN
    ALTER TABLE reimbursement_users ADD COLUMN location VARCHAR(255);
  END IF;
END $$;

-- ============================================
-- 10. activities.metadata (used by activities route)
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'activities' AND column_name = 'metadata') THEN
    ALTER TABLE activities ADD COLUMN metadata JSONB;
  END IF;
END $$;

-- ============================================
-- 11. projects: ensure all opportunity hub columns exist
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'recruitment_status') THEN
    ALTER TABLE projects ADD COLUMN recruitment_status VARCHAR(50) DEFAULT 'closed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'recruitment_config') THEN
    ALTER TABLE projects ADD COLUMN recruitment_config JSONB DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'xp_reward') THEN
    ALTER TABLE projects ADD COLUMN xp_reward INT DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'is_featured') THEN
    ALTER TABLE projects ADD COLUMN is_featured BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'rejection_reason') THEN
    ALTER TABLE projects ADD COLUMN rejection_reason TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'needs_help') THEN
    ALTER TABLE projects ADD COLUMN needs_help BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'impact_summary') THEN
    ALTER TABLE projects ADD COLUMN impact_summary TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'final_xp_awarded') THEN
    ALTER TABLE projects ADD COLUMN final_xp_awarded INT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'tags') THEN
    ALTER TABLE projects ADD COLUMN tags TEXT[] NOT NULL DEFAULT '{}';
  END IF;
END $$;

-- ============================================
-- 12. project_applications table + review_note
-- ============================================
CREATE TABLE IF NOT EXISTS project_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id VARCHAR(100) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'project_applications' AND column_name = 'review_note') THEN
    ALTER TABLE project_applications ADD COLUMN review_note TEXT;
  END IF;
END $$;

-- ============================================
-- 13. bounties, sprint_requests, sprint_helpers, project_showcase
-- ============================================
CREATE TABLE IF NOT EXISTS bounties (
    id VARCHAR(100) PRIMARY KEY DEFAULT (gen_random_uuid()::text),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    creator_id VARCHAR(100) NOT NULL,
    category VARCHAR(30) NOT NULL CHECK (category IN ('DESIGN', 'CONTENT', 'DEVELOPMENT', 'DATA', 'RESEARCH', 'ADMIN', 'OTHER')),
    department VARCHAR(100),
    xp_reward INT NOT NULL DEFAULT 50,
    estimated_minutes INT NOT NULL DEFAULT 60,
    urgency VARCHAR(20) NOT NULL DEFAULT 'NORMAL' CHECK (urgency IN ('LOW', 'NORMAL', 'HIGH', 'CRITICAL')),
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLAIMED', 'SUBMITTED', 'COMPLETED', 'EXPIRED', 'CANCELLED')),
    claimed_by VARCHAR(100),
    claimed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    reviewed_at TIMESTAMPTZ,
    review_note TEXT,
    rating INT CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
    expires_at TIMESTAMPTZ,
    attachments JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bounties_status ON bounties(status);
CREATE INDEX IF NOT EXISTS idx_bounties_creator ON bounties(creator_id);

CREATE TABLE IF NOT EXISTS sprint_requests (
    id VARCHAR(100) PRIMARY KEY DEFAULT (gen_random_uuid()::text),
    project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    skills_needed JSONB NOT NULL DEFAULT '[]',
    requester_id VARCHAR(100) NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMPTZ NOT NULL,
    xp_reward INT NOT NULL DEFAULT 100,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'IN_PROGRESS', 'RESOLVED', 'EXPIRED', 'CANCELLED')),
    max_helpers INT NOT NULL DEFAULT 3,
    resolved_at TIMESTAMPTZ,
    resolution_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sprint_helpers (
    id VARCHAR(100) PRIMARY KEY DEFAULT (gen_random_uuid()::text),
    sprint_id VARCHAR(100) NOT NULL REFERENCES sprint_requests(id) ON DELETE CASCADE,
    user_id VARCHAR(100) NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    contribution TEXT,
    xp_earned INT NOT NULL DEFAULT 0,
    UNIQUE(sprint_id, user_id)
);

CREATE TABLE IF NOT EXISTS project_showcase (
    id VARCHAR(100) PRIMARY KEY DEFAULT (gen_random_uuid()::text),
    project_id VARCHAR(100) NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    impact_summary TEXT NOT NULL,
    impact_metrics JSONB DEFAULT '[]',
    testimonial TEXT,
    cover_image VARCHAR(500),
    screenshots JSONB DEFAULT '[]',
    is_featured BOOLEAN NOT NULL DEFAULT false,
    featured_at TIMESTAMPTZ,
    views INT NOT NULL DEFAULT 0,
    likes INT NOT NULL DEFAULT 0,
    liked_by JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
