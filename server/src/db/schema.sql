-- 0. TEMİZLİK
DROP TABLE IF EXISTS performance_audit_log, performance_metrics, performance_targets, performance_team_members, performance_teams CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS project_showcase CASCADE;
DROP TABLE IF EXISTS sprint_helpers CASCADE;
DROP TABLE IF EXISTS sprint_requests CASCADE;
DROP TABLE IF EXISTS bounties CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS kb_documents CASCADE;
DROP TABLE IF EXISTS activities, user_badges, badges CASCADE;
DROP TABLE IF EXISTS messages, channel_members, channels CASCADE;
DROP TABLE IF EXISTS reimbursement_settings, reimbursement_activity_log, reimbursement_comments, mileage_claims, approval_steps, reimbursement_documents, reimbursement_requests, expense_categories CASCADE;
DROP TABLE IF EXISTS auth_sessions, auth_audit_log, employee_auth, reimbursement_users, organizations CASCADE;
DROP TABLE IF EXISTS app_settings, roles CASCADE;

-- 1. Organizations
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    base_currency CHAR(3) NOT NULL DEFAULT 'USD',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Users
CREATE TABLE IF NOT EXISTS reimbursement_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    auth_user_id VARCHAR(100), 
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'employee',
    manager_id UUID REFERENCES reimbursement_users(id) ON DELETE SET NULL,
    xp INT NOT NULL DEFAULT 0,
    level INT NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'offline',
    job_title VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, email)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'reimbursement_users' AND column_name = 'updated_at') THEN
    ALTER TABLE reimbursement_users ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- 3. Performance Module (Tüm KPI Sütunları Eklendi)
CREATE TABLE IF NOT EXISTS performance_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_code VARCHAR(50) UNIQUE NOT NULL,
    team_name VARCHAR(100) NOT NULL,
    description TEXT,
    team_type VARCHAR(50) NOT NULL DEFAULT 'sales',
    team_lead_id VARCHAR(100),
    metrics_config JSONB NOT NULL DEFAULT '{"revenue": true, "sms": true}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS performance_team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES performance_teams(id) ON DELETE CASCADE,
    employee_id VARCHAR(100) NOT NULL,
    role_in_team VARCHAR(30) NOT NULL DEFAULT 'member',
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, employee_id)
);

-- Seed dosyasının istediği TÜM detaylı metrikler:
CREATE TABLE IF NOT EXISTS performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(30) NOT NULL,
    entity_id VARCHAR(255) NOT NULL,
    metric_date DATE NOT NULL,
    revenue DECIMAL(15,2),
    sms_attempts BIGINT,
    sms_delivered BIGINT,           -- EKLENDİ
    sms_delivery_rate DECIMAL(5,2), -- EKLENDİ (Hatayı veren sütun)
    email_attempts BIGINT,
    email_delivered BIGINT,         -- EKLENDİ
    email_delivery_rate DECIMAL(5,2),-- EKLENDİ
    conversion_rate DECIMAL(5,2),   -- EKLENDİ
    cost_per_sms DECIMAL(8,6),      -- EKLENDİ
    custom_metrics JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(entity_type, entity_id, metric_date)
);

CREATE TABLE IF NOT EXISTS performance_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(30) NOT NULL,
    entity_id VARCHAR(255),
    period_type VARCHAR(30) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    revenue_target DECIMAL(15,2),
    sms_target BIGINT,
    email_target BIGINT,
    custom_targets JSONB,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3b. Performance Audit Log
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

-- 4. Gamification, Reimbursement & Settings (Aynen devam)
CREATE TABLE IF NOT EXISTS badges (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    icon VARCHAR(50) NOT NULL DEFAULT 'award',
    type VARCHAR(30) NOT NULL DEFAULT 'achievement',
    description TEXT NOT NULL DEFAULT '',
    rarity VARCHAR(30) NOT NULL DEFAULT 'common',
    criteria TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(100) NOT NULL,
    badge_id VARCHAR(100) NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    earned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, badge_id)
);

CREATE TABLE IF NOT EXISTS expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(50),
    spending_limit DECIMAL(12,2),
    requires_justification_above DECIMAL(12,2),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, name)
);

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

CREATE TABLE IF NOT EXISTS reimbursement_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID UNIQUE NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    mileage_rate_per_km DECIMAL(8,4) NOT NULL DEFAULT 0.67,
    mileage_currency CHAR(3) NOT NULL DEFAULT 'USD',
    meal_limit DECIMAL(12,2),
    daily_limit DECIMAL(12,2),
    monthly_limit DECIMAL(12,2),
    require_signed_invoice_above DECIMAL(12,2),
    auto_approve_below DECIMAL(12,2),
    enable_ocr BOOLEAN NOT NULL DEFAULT TRUE,
    enable_mileage BOOLEAN NOT NULL DEFAULT TRUE,
    enable_currency_conversion BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

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

-- Chat System
CREATE TABLE IF NOT EXISTS channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    type VARCHAR(20) NOT NULL DEFAULT 'public',
    unread_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'channels' AND column_name = 'description') THEN
    ALTER TABLE channels ADD COLUMN description TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'channels' AND column_name = 'unread_count') THEN
    ALTER TABLE channels ADD COLUMN unread_count INT NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'channels' AND column_name = 'updated_at') THEN
    ALTER TABLE channels ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    attachments JSONB NOT NULL DEFAULT '[]',
    mentions JSONB NOT NULL DEFAULT '[]',
    xp_gained INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

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

-- channel_members: links users (auth_user_id e.g. 'user-1') to channels
CREATE TABLE IF NOT EXISTS channel_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id VARCHAR(100) NOT NULL,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    last_read_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(channel_id, user_id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'channel_members' AND column_name = 'last_read_at') THEN
    ALTER TABLE channel_members ADD COLUMN last_read_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB,
    xp_gained INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'activities' AND column_name = 'metadata') THEN
    ALTER TABLE activities ADD COLUMN metadata JSONB;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'badges' AND column_name = 'updated_at') THEN
    ALTER TABLE badges ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    type VARCHAR(50) NOT NULL DEFAULT 'product',
    progress INT NOT NULL DEFAULT 0,
    team JSONB NOT NULL DEFAULT '[]',
    capacity JSONB NOT NULL DEFAULT '{"current":0,"max":5}',
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    due_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS tasks (
    id VARCHAR(100) PRIMARY KEY,
    project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status VARCHAR(30) NOT NULL DEFAULT 'todo',
    assignees JSONB NOT NULL DEFAULT '[]',
    tags JSONB NOT NULL DEFAULT '[]',
    due_date TIMESTAMPTZ,
    xp_reward INT NOT NULL DEFAULT 50,
    priority VARCHAR(20) NOT NULL DEFAULT 'medium',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS kb_documents (
    id VARCHAR(100) PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    tags JSONB NOT NULL DEFAULT '[]',
    author_id VARCHAR(100) NOT NULL,
    type VARCHAR(30) NOT NULL DEFAULT 'wiki',
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    views INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roles (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '[]',
    role_key VARCHAR(50),
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_settings (
    key VARCHAR(100) PRIMARY KEY DEFAULT 'default',
    value JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_auth (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
    password_changed_at TIMESTAMPTZ,
    password_history JSONB NOT NULL DEFAULT '[]',
    temporary_password VARCHAR(255),
    account_status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'inactive', 'locked', 'pending')),
    failed_login_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    lock_reason VARCHAR(255),
    last_login_at TIMESTAMPTZ,
    last_login_ip VARCHAR(45),
    last_login_device VARCHAR(255),
    total_logins INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(100) NOT NULL DEFAULT 'system',
    updated_by VARCHAR(100) NOT NULL DEFAULT 'system'
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id VARCHAR(100) NOT NULL,
    refresh_token_hash VARCHAR(255) NOT NULL,
    device_name VARCHAR(255),
    device_type VARCHAR(50),
    browser VARCHAR(255),
    ip_address VARCHAR(45),
    location VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id VARCHAR(100),
    target_auth_user_id VARCHAR(100),
    action VARCHAR(100) NOT NULL,
    details JSONB NOT NULL DEFAULT '{}',
    ip_address VARCHAR(45),
    user_agent TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failure')),
    failure_reason TEXT,
    performed_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- BOUNTIES
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
CREATE INDEX IF NOT EXISTS idx_bounties_claimed_by ON bounties(claimed_by);
CREATE INDEX IF NOT EXISTS idx_bounties_category ON bounties(category);

-- ============================================
-- SPRINT SUPPORT
-- ============================================
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
CREATE INDEX IF NOT EXISTS idx_sprint_requests_project ON sprint_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_sprint_requests_status ON sprint_requests(status);

CREATE TABLE IF NOT EXISTS sprint_helpers (
    id VARCHAR(100) PRIMARY KEY DEFAULT (gen_random_uuid()::text),
    sprint_id VARCHAR(100) NOT NULL REFERENCES sprint_requests(id) ON DELETE CASCADE,
    user_id VARCHAR(100) NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    contribution TEXT,
    xp_earned INT NOT NULL DEFAULT 0,
    UNIQUE(sprint_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_sprint_helpers_sprint ON sprint_helpers(sprint_id);

-- ============================================
-- PROJECT SHOWCASE (HALL OF FAME)
-- ============================================
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
CREATE INDEX IF NOT EXISTS idx_project_showcase_featured ON project_showcase(is_featured);

-- ============================================
-- ADMIN AUDIT LOG (used by all admin CRUD operations)
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
-- MILEAGE CLAIMS
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
-- DORA DASH MINI-GAME LEADERBOARD
-- ============================================
CREATE TABLE IF NOT EXISTS game_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES reimbursement_users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  played_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_game_scores_top ON game_scores (score DESC);
CREATE INDEX IF NOT EXISTS idx_game_scores_user ON game_scores (user_id);

-- ============================================
-- DORA CONVERSATION HISTORY
-- ============================================
CREATE TABLE IF NOT EXISTS dora_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES reimbursement_users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL DEFAULT 'New conversation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dora_sessions_user ON dora_sessions (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS dora_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES dora_sessions(id) ON DELETE CASCADE,
  role VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL DEFAULT '',
  metadata JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dora_messages_session ON dora_messages (session_id, created_at);
