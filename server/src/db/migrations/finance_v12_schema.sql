-- Finance v1.2 Schema Migration
-- Extends existing tables and creates new finance_* tables
-- All statements are idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)

-- ============================================================
-- PART 1: Extend existing tables
-- ============================================================

-- 1.1 reimbursement_requests — new expense lifecycle fields
ALTER TABLE reimbursement_requests
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES performance_teams(id),
  ADD COLUMN IF NOT EXISTS category_slug VARCHAR(100),
  ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,4),
  ADD COLUMN IF NOT EXISTS tip_amount DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_approver_id UUID REFERENCES reimbursement_users(id),
  ADD COLUMN IF NOT EXISTS approval_chain JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS ai_category_suggestion VARCHAR(100),
  ADD COLUMN IF NOT EXISTS ai_risk_score DECIMAL(3,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_risk_flags JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS ai_review_notes TEXT,
  ADD COLUMN IF NOT EXISTS ai_duplicate_refs JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS ai_policy_result JSONB,
  ADD COLUMN IF NOT EXISTS ai_auto_approved BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS receipt_url TEXT,
  ADD COLUMN IF NOT EXISTS receipt_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS receipt_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS budget_id UUID,
  ADD COLUMN IF NOT EXISTS vendor_id UUID,
  ADD COLUMN IF NOT EXISTS project_id UUID,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Drop old status constraint if it exists and recreate with v1.2 statuses
DO $$
BEGIN
  ALTER TABLE reimbursement_requests DROP CONSTRAINT IF EXISTS reimbursement_requests_status_check;
  ALTER TABLE reimbursement_requests ADD CONSTRAINT reimbursement_requests_status_check
    CHECK (status IN (
      'draft', 'submitted', 'ai_reviewing', 'ai_approved', 'ai_flagged',
      'manager_review', 'manager_approved', 'manager_rejected',
      'finance_review', 'finance_approved', 'finance_rejected',
      'payment_processing', 'paid', 'reimbursed', 'voided',
      'approved', 'rejected'
    ));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_reimb_receipt_hash ON reimbursement_requests(receipt_hash);
CREATE INDEX IF NOT EXISTS idx_reimb_ai_risk ON reimbursement_requests(ai_risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_reimb_budget ON reimbursement_requests(budget_id);
CREATE INDEX IF NOT EXISTS idx_reimb_team ON reimbursement_requests(team_id);
CREATE INDEX IF NOT EXISTS idx_reimb_vendor ON reimbursement_requests(vendor_id);
CREATE INDEX IF NOT EXISTS idx_reimb_deleted ON reimbursement_requests(is_deleted) WHERE is_deleted = FALSE;

-- 1.2 reimbursement_documents — extended OCR fields
ALTER TABLE reimbursement_documents
  ADD COLUMN IF NOT EXISTS file_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS extracted_vendor VARCHAR(255),
  ADD COLUMN IF NOT EXISTS extracted_amount DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS extracted_date DATE,
  ADD COLUMN IF NOT EXISTS extracted_tax DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS extracted_currency VARCHAR(3),
  ADD COLUMN IF NOT EXISTS extracted_items JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS verified_method VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_reimb_docs_hash ON reimbursement_documents(file_hash);

-- 1.3 invoices — v1.2 invoice model extension
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS organization_id UUID,
  ADD COLUMN IF NOT EXISTS invoice_type VARCHAR(20) DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS reference_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS from_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS from_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS from_address TEXT,
  ADD COLUMN IF NOT EXISTS from_tax_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS to_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS to_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS to_address TEXT,
  ADD COLUMN IF NOT EXISTS to_tax_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS client_id UUID,
  ADD COLUMN IF NOT EXISTS vendor_id UUID,
  ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_pct DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS recurring_config JSONB,
  ADD COLUMN IF NOT EXISTS parent_recurring_id UUID,
  ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(100),
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
  ADD COLUMN IF NOT EXISTS payment_instructions TEXT,
  ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_confidence DECIMAL(3,2),
  ADD COLUMN IF NOT EXISTS ai_payment_prediction JSONB,
  ADD COLUMN IF NOT EXISTS ai_risk_assessment JSONB,
  ADD COLUMN IF NOT EXISTS ai_follow_up_date DATE,
  ADD COLUMN IF NOT EXISTS ai_notes TEXT,
  ADD COLUMN IF NOT EXISTS template_id VARCHAR(50) DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS brand_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS brand_color VARCHAR(7),
  ADD COLUMN IF NOT EXISTS brand_footer TEXT,
  ADD COLUMN IF NOT EXISTS internal_notes TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_vendor ON invoices(vendor_id);

-- 1.4 budgets — v1.2 budget model extension
ALTER TABLE budgets
  ADD COLUMN IF NOT EXISTS name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS budget_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES performance_teams(id),
  ADD COLUMN IF NOT EXISTS project_id UUID,
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES reimbursement_users(id),
  ADD COLUMN IF NOT EXISTS spent_amount DECIMAL(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS warning_threshold DECIMAL(5,2) DEFAULT 80.00,
  ADD COLUMN IF NOT EXISTS critical_threshold DECIMAL(5,2) DEFAULT 95.00,
  ADD COLUMN IF NOT EXISTS hard_limit BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_forecast_amount DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS ai_forecast_date DATE,
  ADD COLUMN IF NOT EXISTS ai_health_score DECIMAL(3,2),
  ADD COLUMN IF NOT EXISTS ai_recommendations JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS ai_anomaly_flags JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS allow_rollover BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rollover_amount DECIMAL(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS approval_threshold DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS period_type VARCHAR(20) DEFAULT 'monthly';

CREATE INDEX IF NOT EXISTS idx_budgets_team ON budgets(team_id);
CREATE INDEX IF NOT EXISTS idx_budgets_status ON budgets(status);
CREATE INDEX IF NOT EXISTS idx_budgets_owner ON budgets(owner_id);

-- 1.5 expense_categories — GL codes and hierarchy
ALTER TABLE expense_categories
  ADD COLUMN IF NOT EXISTS slug VARCHAR(100),
  ADD COLUMN IF NOT EXISTS gl_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES expense_categories(id),
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- 1.6 approval_steps — generic entity support + AI fields
ALTER TABLE approval_steps
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS entity_id UUID,
  ADD COLUMN IF NOT EXISTS step_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS approver_role VARCHAR(50),
  ADD COLUMN IF NOT EXISTS delegated_to_id UUID REFERENCES reimbursement_users(id),
  ADD COLUMN IF NOT EXISTS ai_recommendation VARCHAR(20),
  ADD COLUMN IF NOT EXISTS ai_confidence DECIMAL(3,2),
  ADD COLUMN IF NOT EXISTS ai_reason TEXT,
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_approval_entity ON approval_steps(entity_type, entity_id);

-- ============================================================
-- PART 2: New finance_* tables
-- ============================================================

-- 2.1 Vendors
CREATE TABLE IF NOT EXISTS finance_vendors (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  name                VARCHAR(255) NOT NULL,
  legal_name          VARCHAR(255),
  tax_id              VARCHAR(50),
  vendor_code         VARCHAR(20),
  email               VARCHAR(255),
  phone               VARCHAR(50),
  website             VARCHAR(500),
  address             TEXT,
  country             VARCHAR(3),
  default_currency    VARCHAR(3) DEFAULT 'USD',
  payment_terms       VARCHAR(50),
  default_gl_code     VARCHAR(20),
  ai_risk_score       DECIMAL(3,2),
  ai_category         VARCHAR(100),
  ai_notes            TEXT,
  is_active           BOOLEAN DEFAULT TRUE,
  is_verified         BOOLEAN DEFAULT FALSE,
  total_invoiced      DECIMAL(14,2) DEFAULT 0,
  total_paid          DECIMAL(14,2) DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_vendors_org ON finance_vendors(organization_id);
CREATE INDEX IF NOT EXISTS idx_fin_vendors_name ON finance_vendors(organization_id, name);

-- 2.2 Payments
CREATE TABLE IF NOT EXISTS finance_payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  payment_number      VARCHAR(50) NOT NULL,
  payment_type        VARCHAR(30) NOT NULL
    CHECK (payment_type IN ('expense_reimbursement', 'invoice_payment', 'vendor_payment', 'refund', 'adjustment')),
  expense_id          UUID REFERENCES reimbursement_requests(id),
  invoice_id          UUID REFERENCES invoices(id),
  vendor_id           UUID REFERENCES finance_vendors(id),
  amount              DECIMAL(12,2) NOT NULL,
  currency            VARCHAR(3) NOT NULL DEFAULT 'USD',
  recipient_id        UUID REFERENCES reimbursement_users(id),
  recipient_name      VARCHAR(255),
  status              VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled')),
  payment_method      VARCHAR(50),
  payment_reference   VARCHAR(255),
  scheduled_date      DATE,
  processed_at        TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  batch_id            UUID,
  ai_scheduled        BOOLEAN DEFAULT FALSE,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          UUID NOT NULL REFERENCES reimbursement_users(id),
  CONSTRAINT fin_payments_unique_num UNIQUE(organization_id, payment_number)
);

CREATE INDEX IF NOT EXISTS idx_fin_payments_org ON finance_payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_fin_payments_status ON finance_payments(status);
CREATE INDEX IF NOT EXISTS idx_fin_payments_expense ON finance_payments(expense_id);
CREATE INDEX IF NOT EXISTS idx_fin_payments_invoice ON finance_payments(invoice_id);

-- 2.3 Expense Policies (Rule Engine)
CREATE TABLE IF NOT EXISTS finance_expense_policies (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  name                VARCHAR(255) NOT NULL,
  description         TEXT,
  applies_to_teams    UUID[] DEFAULT '{}',
  applies_to_roles    TEXT[] DEFAULT '{}',
  rules               JSONB NOT NULL,
  violation_action    VARCHAR(20) DEFAULT 'flag'
    CHECK (violation_action IN ('flag', 'block', 'warn', 'auto_reject')),
  violation_message   TEXT,
  priority            INTEGER DEFAULT 0,
  is_active           BOOLEAN DEFAULT TRUE,
  effective_from      DATE,
  effective_until     DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          UUID NOT NULL REFERENCES reimbursement_users(id)
);

CREATE INDEX IF NOT EXISTS idx_fin_expense_policies_org ON finance_expense_policies(organization_id);

-- 2.4 Approval Policies
CREATE TABLE IF NOT EXISTS finance_approval_policies (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  name                VARCHAR(255) NOT NULL,
  description         TEXT,
  applies_to          VARCHAR(50) NOT NULL,
  team_id             UUID REFERENCES performance_teams(id),
  rules               JSONB NOT NULL DEFAULT '[]',
  ai_auto_approve_enabled  BOOLEAN DEFAULT TRUE,
  ai_auto_approve_max      DECIMAL(12,2) DEFAULT 100.00,
  ai_min_confidence        DECIMAL(3,2) DEFAULT 0.95,
  ai_max_risk              DECIMAL(3,2) DEFAULT 0.20,
  is_active           BOOLEAN DEFAULT TRUE,
  priority            INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_approval_policies_org ON finance_approval_policies(organization_id);

-- 2.5 Budget Allocations
CREATE TABLE IF NOT EXISTS finance_budget_allocations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id           UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  category_slug       VARCHAR(100) NOT NULL,
  allocated_amount    DECIMAL(14,2) NOT NULL,
  spent_amount        DECIMAL(14,2) DEFAULT 0,
  ai_suggested_amount DECIMAL(14,2),
  ai_suggestion_reason TEXT,
  UNIQUE(budget_id, category_slug)
);

-- 2.6 Budget Snapshots
CREATE TABLE IF NOT EXISTS finance_budget_snapshots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id           UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  snapshot_date       DATE NOT NULL,
  total_amount        DECIMAL(14,2),
  spent_amount        DECIMAL(14,2),
  allocated_amount    DECIMAL(14,2),
  forecast_amount     DECIMAL(14,2),
  health_score        DECIMAL(3,2),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_budget_snap_budget ON finance_budget_snapshots(budget_id);
CREATE INDEX IF NOT EXISTS idx_fin_budget_snap_date ON finance_budget_snapshots(snapshot_date);

-- 2.7 Immutable Audit Log
CREATE TABLE IF NOT EXISTS finance_audit_log (
  id                  BIGSERIAL PRIMARY KEY,
  organization_id     UUID NOT NULL,
  event_type          VARCHAR(100) NOT NULL,
  event_category      VARCHAR(50) NOT NULL,
  actor_type          VARCHAR(20) NOT NULL,
  actor_id            VARCHAR(50),
  actor_name          VARCHAR(255),
  entity_type         VARCHAR(50) NOT NULL,
  entity_id           UUID NOT NULL,
  changes             JSONB,
  metadata            JSONB,
  ai_involved         BOOLEAN DEFAULT FALSE,
  ai_confidence       DECIMAL(3,2),
  ai_reasoning        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_hash          VARCHAR(64),
  previous_hash       VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_fin_audit_org ON finance_audit_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_fin_audit_entity ON finance_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_fin_audit_time ON finance_audit_log(created_at DESC);

DO $$
BEGIN
  CREATE RULE prevent_finance_audit_update AS ON UPDATE TO finance_audit_log DO INSTEAD NOTHING;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE RULE prevent_finance_audit_delete AS ON DELETE TO finance_audit_log DO INSTEAD NOTHING;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2.8 Dora Decisions Log
CREATE TABLE IF NOT EXISTS finance_dora_decisions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL,
  decision_type       VARCHAR(100) NOT NULL,
  entity_type         VARCHAR(50),
  entity_id           UUID,
  action_taken        VARCHAR(100) NOT NULL,
  confidence_score    DECIMAL(3,2) NOT NULL,
  reasoning           TEXT NOT NULL,
  input_data          JSONB,
  output_data         JSONB,
  was_overridden      BOOLEAN DEFAULT FALSE,
  overridden_by       UUID REFERENCES reimbursement_users(id),
  override_reason     TEXT,
  feedback_rating     INTEGER CHECK (feedback_rating BETWEEN 1 AND 5),
  feedback_comment    TEXT,
  processing_time_ms  INTEGER,
  tokens_used         INTEGER,
  model_used          VARCHAR(50),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_dora_decisions_org ON finance_dora_decisions(organization_id);
CREATE INDEX IF NOT EXISTS idx_fin_dora_decisions_entity ON finance_dora_decisions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_fin_dora_decisions_type ON finance_dora_decisions(decision_type);

-- 2.9 Financial Notifications
CREATE TABLE IF NOT EXISTS finance_notifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL,
  recipient_id        UUID NOT NULL REFERENCES reimbursement_users(id),
  type                VARCHAR(100) NOT NULL,
  title               VARCHAR(255) NOT NULL,
  message             TEXT NOT NULL,
  entity_type         VARCHAR(50),
  entity_id           UUID,
  action_url          TEXT,
  priority            VARCHAR(20) DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  is_read             BOOLEAN DEFAULT FALSE,
  read_at             TIMESTAMPTZ,
  ai_generated        BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_notif_recipient ON finance_notifications(recipient_id, is_read);
CREATE INDEX IF NOT EXISTS idx_fin_notif_org ON finance_notifications(organization_id);

-- 2.10 GL Accounts (Chart of Accounts)
CREATE TABLE IF NOT EXISTS finance_gl_accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  code                VARCHAR(20) NOT NULL,
  name                VARCHAR(255) NOT NULL,
  type                VARCHAR(20) CHECK (type IN ('asset', 'liability', 'expense', 'revenue', 'equity')),
  parent_id           UUID REFERENCES finance_gl_accounts(id),
  is_active           BOOLEAN DEFAULT TRUE,
  description         TEXT,
  UNIQUE(organization_id, code)
);

-- 2.11 Invoice Templates
CREATE TABLE IF NOT EXISTS finance_invoice_templates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  name                VARCHAR(100) NOT NULL,
  slug                VARCHAR(50) NOT NULL,
  template_html       TEXT NOT NULL,
  default_brand       JSONB DEFAULT '{}',
  is_default          BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, slug)
);

-- 2.12 Expense Line Items
CREATE TABLE IF NOT EXISTS finance_expense_line_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id          UUID NOT NULL REFERENCES reimbursement_requests(id) ON DELETE CASCADE,
  description         VARCHAR(500) NOT NULL,
  quantity            DECIMAL(10,2) DEFAULT 1,
  unit_price          DECIMAL(12,2) NOT NULL,
  total_price         DECIMAL(12,2) NOT NULL,
  category_slug       VARCHAR(100),
  tax_amount          DECIMAL(12,2) DEFAULT 0,
  gl_code             VARCHAR(20),
  cost_center         VARCHAR(50),
  sort_order          INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_line_items_expense ON finance_expense_line_items(expense_id);
