-- Finance v2 Sprint 1 Migration
-- Adds finance_settings table and extends reimbursement_documents

-- Organization finance settings
CREATE TABLE IF NOT EXISTS finance_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) UNIQUE,
  company_name VARCHAR(255),
  company_address TEXT,
  company_phone VARCHAR(50),
  company_email VARCHAR(255),
  company_website VARCHAR(500),
  company_tax_id VARCHAR(50),
  company_logo_url TEXT,
  base_currency VARCHAR(3) DEFAULT 'USD',
  fiscal_year_start INTEGER DEFAULT 1,
  receipt_required_above DECIMAL(12,2) DEFAULT 25.00,
  dora_autonomy_level VARCHAR(20) DEFAULT 'copilot',
  dora_auto_approve_enabled BOOLEAN DEFAULT TRUE,
  dora_auto_approve_max DECIMAL(12,2) DEFAULT 100.00,
  dora_min_confidence DECIMAL(3,2) DEFAULT 0.95,
  dora_max_risk DECIMAL(3,2) DEFAULT 0.20,
  dora_features JSONB DEFAULT '{"ocr":true,"categorization":true,"duplicate_detection":true,"anomaly_detection":true,"budget_forecast":true,"payment_prediction":true,"smart_reminders":true,"close_checklist":true}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add receipt hash column if missing
ALTER TABLE reimbursement_documents
  ADD COLUMN IF NOT EXISTS file_hash VARCHAR(64);

-- Ensure ai_confidence_score column exists on reimbursement_requests
ALTER TABLE reimbursement_requests
  ADD COLUMN IF NOT EXISTS ai_confidence_score DECIMAL(3,2);
