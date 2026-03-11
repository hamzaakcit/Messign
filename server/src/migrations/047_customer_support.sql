-- ════════════════════════════════════════
-- Customer Support Module — Database Schema
-- ════════════════════════════════════════

-- SLA policies: define response and resolution targets per priority
CREATE TABLE IF NOT EXISTS support_sla_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  priority VARCHAR(20) NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  first_response_hours DECIMAL(10,2) NOT NULL,
  resolution_hours DECIMAL(10,2) NOT NULL,
  escalation_after_hours DECIMAL(10,2),
  escalate_to_role VARCHAR(50) DEFAULT 'manager',
  business_hours_only BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, priority)
);

CREATE INDEX IF NOT EXISTS idx_support_sla_policies_org ON support_sla_policies(organization_id);
CREATE INDEX IF NOT EXISTS idx_support_sla_policies_active ON support_sla_policies(organization_id, is_active);

-- Support categories: hierarchical ticket categorization
CREATE TABLE IF NOT EXISTS support_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  parent_id UUID REFERENCES support_categories(id) ON DELETE SET NULL,
  description TEXT,
  auto_assign_to UUID REFERENCES reimbursement_users(id) ON DELETE SET NULL,
  default_priority VARCHAR(20) DEFAULT 'medium' CHECK (default_priority IN ('critical', 'high', 'medium', 'low')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_support_categories_org ON support_categories(organization_id);
CREATE INDEX IF NOT EXISTS idx_support_categories_parent ON support_categories(parent_id);

-- Tickets: the core support entity
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ticket_number BIGSERIAL NOT NULL,
  subject VARCHAR(500) NOT NULL,
  description TEXT,
  status VARCHAR(30) DEFAULT 'open' CHECK (status IN ('open', 'awaiting_agent', 'awaiting_customer', 'in_progress', 'on_hold', 'resolved', 'closed')),
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  category_id UUID REFERENCES support_categories(id) ON DELETE SET NULL,
  assignee_id UUID REFERENCES reimbursement_users(id) ON DELETE SET NULL,
  reporter_email VARCHAR(255) NOT NULL,
  reporter_name VARCHAR(255),
  crm_contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  crm_company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  sla_policy_id UUID REFERENCES support_sla_policies(id) ON DELETE SET NULL,
  sla_first_response_due TIMESTAMPTZ,
  sla_resolution_due TIMESTAMPTZ,
  sla_first_response_at TIMESTAMPTZ,
  sla_first_response_breached BOOLEAN DEFAULT false,
  sla_resolution_breached BOOLEAN DEFAULT false,
  first_response_time_hours DECIMAL(10,2),
  resolution_time_hours DECIMAL(10,2),
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  source VARCHAR(50) DEFAULT 'web' CHECK (source IN ('web', 'email', 'chat', 'phone', 'api')),
  dora_category_suggestion VARCHAR(255),
  dora_priority_suggestion VARCHAR(20) CHECK (dora_priority_suggestion IN ('critical', 'high', 'medium', 'low')),
  dora_sentiment VARCHAR(20) CHECK (dora_sentiment IN ('positive', 'neutral', 'negative', 'urgent')),
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_tickets_number ON support_tickets(ticket_number);
CREATE INDEX IF NOT EXISTS idx_support_tickets_org ON support_tickets(organization_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_category ON support_tickets(category_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assignee ON support_tickets(assignee_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_company ON support_tickets(crm_company_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_contact ON support_tickets(crm_contact_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_sla_first_response ON support_tickets(sla_first_response_due);
CREATE INDEX IF NOT EXISTS idx_support_tickets_sla_res ON support_tickets(sla_resolution_due);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created ON support_tickets(created_at);

-- Ticket messages: the conversation thread
CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id UUID REFERENCES reimbursement_users(id) ON DELETE SET NULL,
  author_email VARCHAR(255),
  author_name VARCHAR(255),
  body TEXT NOT NULL,
  body_html TEXT,
  is_internal_note BOOLEAN DEFAULT false,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_created ON support_messages(created_at);

-- CSAT ratings: customer satisfaction after ticket resolution
CREATE TABLE IF NOT EXISTS support_csat_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ticket_id)
);

CREATE INDEX IF NOT EXISTS idx_support_csat_ticket ON support_csat_ratings(ticket_id);

-- Ticket tags: searchable tag catalog
CREATE TABLE IF NOT EXISTS support_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(7) DEFAULT '#6B7280',
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_support_tags_org ON support_tags(organization_id);

-- Customer health scores: aggregated per CRM company
CREATE TABLE IF NOT EXISTS support_customer_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_company_id UUID NOT NULL REFERENCES crm_companies(id) ON DELETE CASCADE,
  health_score INTEGER DEFAULT 100 CHECK (health_score >= 0 AND health_score <= 100),
  open_ticket_count INTEGER DEFAULT 0,
  avg_resolution_hours DECIMAL(10,2),
  avg_csat DECIMAL(3,2),
  repeat_issue_count INTEGER DEFAULT 0,
  last_ticket_at TIMESTAMPTZ,
  trend VARCHAR(20) DEFAULT 'stable' CHECK (trend IN ('improving', 'stable', 'declining', 'critical')),
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(crm_company_id)
);

CREATE INDEX IF NOT EXISTS idx_support_health_score ON support_customer_health(health_score);

-- Ticket status history: track every field change
CREATE TABLE IF NOT EXISTS support_ticket_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  field_name VARCHAR(50) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by UUID REFERENCES reimbursement_users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_history_ticket ON support_ticket_history(ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_history_changed_at ON support_ticket_history(changed_at);

-- ════════════════════════════════════════
-- Seed default SLA policies
-- ════════════════════════════════════════
INSERT INTO support_sla_policies (
  organization_id,
  name,
  priority,
  first_response_hours,
  resolution_hours,
  escalation_after_hours
)
SELECT
  o.id,
  seed.name,
  seed.priority,
  seed.first_response_hours,
  seed.resolution_hours,
  seed.escalation_after_hours
FROM organizations o
CROSS JOIN (
  VALUES
    ('Critical SLA', 'critical', 1::DECIMAL(10,2), 4::DECIMAL(10,2), 2::DECIMAL(10,2)),
    ('High SLA', 'high', 4::DECIMAL(10,2), 24::DECIMAL(10,2), 8::DECIMAL(10,2)),
    ('Medium SLA', 'medium', 8::DECIMAL(10,2), 48::DECIMAL(10,2), 24::DECIMAL(10,2)),
    ('Low SLA', 'low', 24::DECIMAL(10,2), 120::DECIMAL(10,2), 48::DECIMAL(10,2))
) AS seed(name, priority, first_response_hours, resolution_hours, escalation_after_hours)
ON CONFLICT (organization_id, priority) DO NOTHING;

-- ════════════════════════════════════════
-- Seed default categories
-- ════════════════════════════════════════
INSERT INTO support_categories (
  organization_id,
  name,
  description,
  default_priority
)
SELECT
  o.id,
  seed.name,
  seed.description,
  seed.default_priority
FROM organizations o
CROSS JOIN (
  VALUES
    ('Bug Report', 'Software bugs and errors', 'high'),
    ('Feature Request', 'New feature suggestions', 'low'),
    ('Account & Billing', 'Account access and billing questions', 'medium'),
    ('Technical Support', 'Help with using the product', 'medium'),
    ('Integration', 'Third-party integration issues', 'medium'),
    ('Security', 'Security concerns and vulnerabilities', 'critical')
) AS seed(name, description, default_priority)
ON CONFLICT (organization_id, name) DO NOTHING;
