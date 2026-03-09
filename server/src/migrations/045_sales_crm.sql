-- ════════════════════════════════════════
-- Sales CRM Module — Database Schema
-- ════════════════════════════════════════

-- Guard: ensure performance_teams exists (created in schema.sql but not in migrations)
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

-- Pipelines: configurable sales processes per team
CREATE TABLE IF NOT EXISTS crm_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  team_id UUID REFERENCES performance_teams(id),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Deal stages: ordered steps within a pipeline
CREATE TABLE IF NOT EXISTS crm_deal_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES crm_pipelines(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  probability_default INTEGER DEFAULT 0 CHECK (probability_default >= 0 AND probability_default <= 100),
  is_won BOOLEAN DEFAULT false,
  is_lost BOOLEAN DEFAULT false,
  color VARCHAR(7) DEFAULT '#3B82F6',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Companies: organizations you sell to
CREATE TABLE IF NOT EXISTS crm_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255),
  industry VARCHAR(255),
  size VARCHAR(50),
  annual_revenue DECIMAL(15,2),
  address TEXT,
  city VARCHAR(255),
  country VARCHAR(100),
  notes TEXT,
  vendor_id UUID REFERENCES finance_vendors(id),
  created_by UUID REFERENCES reimbursement_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_companies_name ON crm_companies(name);
CREATE INDEX IF NOT EXISTS idx_crm_companies_domain ON crm_companies(domain);

-- Contacts: people at companies
CREATE TABLE IF NOT EXISTS crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  owner_id UUID REFERENCES reimbursement_users(id),
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  job_title VARCHAR(255),
  source VARCHAR(100),
  tags JSONB DEFAULT '[]',
  notes TEXT,
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_email ON crm_contacts(email);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_company ON crm_contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_owner ON crm_contacts(owner_id);

-- Deals: the core sales entity
CREATE TABLE IF NOT EXISTS crm_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  pipeline_id UUID NOT NULL REFERENCES crm_pipelines(id),
  stage_id UUID NOT NULL REFERENCES crm_deal_stages(id),
  company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  owner_id UUID NOT NULL REFERENCES reimbursement_users(id),
  title VARCHAR(255) NOT NULL,
  amount DECIMAL(15,2) DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'EUR',
  amount_eur DECIMAL(15,2) DEFAULT 0,
  probability INTEGER DEFAULT 0 CHECK (probability >= 0 AND probability <= 100),
  expected_close_date DATE,
  actual_close_date DATE,
  lost_reason TEXT,
  competitor VARCHAR(255),
  description TEXT,
  tags JSONB DEFAULT '[]',
  dora_score INTEGER,
  dora_next_action TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_deals_pipeline ON crm_deals(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_stage ON crm_deals(stage_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_owner ON crm_deals(owner_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_company ON crm_deals(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_close_date ON crm_deals(expected_close_date);

-- Activities: calls, emails, meetings, notes on deals and contacts
CREATE TABLE IF NOT EXISTS crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  deal_id UUID REFERENCES crm_deals(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES reimbursement_users(id),
  type VARCHAR(50) NOT NULL CHECK (type IN ('call', 'email', 'meeting', 'note', 'task')),
  subject VARCHAR(255),
  description TEXT,
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  outcome VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_activities_deal ON crm_activities(deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_contact ON crm_activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_user ON crm_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_type ON crm_activities(type);

-- Deal stage history: track every stage transition
CREATE TABLE IF NOT EXISTS crm_deal_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES crm_deals(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES crm_deal_stages(id),
  to_stage_id UUID NOT NULL REFERENCES crm_deal_stages(id),
  moved_by UUID REFERENCES reimbursement_users(id),
  moved_at TIMESTAMPTZ DEFAULT NOW(),
  time_in_previous_stage_hours DECIMAL(10,1)
);

CREATE INDEX IF NOT EXISTS idx_crm_stage_history_deal ON crm_deal_stage_history(deal_id);

-- ════════════════════════════════════════
-- Seed default pipeline with stages
-- ════════════════════════════════════════
INSERT INTO crm_pipelines (organization_id, name, description, is_default)
SELECT o.id, 'Default Sales Pipeline', 'Standard sales process', true
FROM organizations o WHERE o.slug = 'messign' LIMIT 1
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  pipeline_uuid UUID;
BEGIN
  SELECT id INTO pipeline_uuid FROM crm_pipelines WHERE is_default = true LIMIT 1;
  IF pipeline_uuid IS NOT NULL THEN
    INSERT INTO crm_deal_stages (pipeline_id, name, position, probability_default, color, is_won, is_lost) VALUES
      (pipeline_uuid, 'Lead', 0, 10, '#60A5FA', false, false),
      (pipeline_uuid, 'Qualified', 1, 25, '#34D399', false, false),
      (pipeline_uuid, 'Proposal', 2, 50, '#FBBF24', false, false),
      (pipeline_uuid, 'Negotiation', 3, 75, '#F97316', false, false),
      (pipeline_uuid, 'Closed Won', 4, 100, '#10B981', true, false),
      (pipeline_uuid, 'Closed Lost', 5, 0, '#EF4444', false, true)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
