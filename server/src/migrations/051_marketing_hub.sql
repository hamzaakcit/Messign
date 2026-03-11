-- ════════════════════════════════════════
-- Marketing Hub — Database Schema
-- ════════════════════════════════════════

CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  channel VARCHAR(50) NOT NULL CHECK (channel IN ('email', 'social', 'paid_search', 'paid_social', 'content', 'event', 'webinar', 'referral', 'other')),
  status VARCHAR(30) DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled')),
  budget DECIMAL(12,2) DEFAULT 0,
  actual_spend DECIMAL(12,2) DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'EUR',
  budget_eur DECIMAL(12,2) DEFAULT 0,
  actual_spend_eur DECIMAL(12,2) DEFAULT 0,
  start_date DATE,
  end_date DATE,
  target_audience TEXT,
  goals TEXT,
  owner_id UUID REFERENCES reimbursement_users(id) ON DELETE SET NULL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  leads_generated INTEGER DEFAULT 0,
  cost_per_lead DECIMAL(10,2),
  roi DECIMAL(8,2),
  tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_campaigns_status ON marketing_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_mkt_campaigns_channel ON marketing_campaigns(channel);
CREATE INDEX IF NOT EXISTS idx_mkt_campaigns_owner ON marketing_campaigns(owner_id);
CREATE INDEX IF NOT EXISTS idx_mkt_campaigns_dates ON marketing_campaigns(start_date, end_date);

CREATE TABLE IF NOT EXISTS marketing_campaign_spend (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'EUR',
  amount_eur DECIMAL(12,2),
  category VARCHAR(100),
  description TEXT,
  date DATE NOT NULL,
  vendor VARCHAR(255),
  finance_expense_id UUID,
  receipt_url TEXT,
  created_by UUID REFERENCES reimbursement_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_spend_campaign ON marketing_campaign_spend(campaign_id);

CREATE TABLE IF NOT EXISTS marketing_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  title VARCHAR(500) NOT NULL,
  content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('blog', 'social', 'email', 'video', 'webinar', 'case_study', 'whitepaper', 'infographic', 'podcast', 'other')),
  channel VARCHAR(50),
  status VARCHAR(30) DEFAULT 'idea' CHECK (status IN ('idea', 'draft', 'in_review', 'approved', 'scheduled', 'published', 'archived')),
  body TEXT,
  body_html TEXT,
  scheduled_date DATE,
  scheduled_time TIME,
  published_at TIMESTAMPTZ,
  author_id UUID REFERENCES reimbursement_users(id) ON DELETE SET NULL,
  reviewer_id UUID REFERENCES reimbursement_users(id) ON DELETE SET NULL,
  tags JSONB DEFAULT '[]'::jsonb,
  views INTEGER DEFAULT 0,
  engagement INTEGER DEFAULT 0,
  click_throughs INTEGER DEFAULT 0,
  leads_attributed INTEGER DEFAULT 0,
  knowledge_doc_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_content_status ON marketing_content(status);
CREATE INDEX IF NOT EXISTS idx_mkt_content_date ON marketing_content(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_mkt_content_campaign ON marketing_content(campaign_id);
CREATE INDEX IF NOT EXISTS idx_mkt_content_type ON marketing_content(content_type);

CREATE TABLE IF NOT EXISTS marketing_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  company_name VARCHAR(255),
  job_title VARCHAR(255),
  phone VARCHAR(50),
  source VARCHAR(100) NOT NULL,
  campaign_id UUID REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  content_id UUID REFERENCES marketing_content(id) ON DELETE SET NULL,
  score INTEGER DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  score_factors JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(30) DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'nurturing', 'qualified', 'converted', 'disqualified', 'unresponsive')),
  crm_contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  crm_deal_id UUID REFERENCES crm_deals(id) ON DELETE SET NULL,
  converted_at TIMESTAMPTZ,
  converted_by UUID REFERENCES reimbursement_users(id) ON DELETE SET NULL,
  utm_source VARCHAR(255),
  utm_medium VARCHAR(255),
  utm_campaign VARCHAR(255),
  landing_page_url TEXT,
  ip_country VARCHAR(100),
  tags JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  last_activity_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_leads_email ON marketing_leads(email);
CREATE INDEX IF NOT EXISTS idx_mkt_leads_score ON marketing_leads(score);
CREATE INDEX IF NOT EXISTS idx_mkt_leads_status ON marketing_leads(status);
CREATE INDEX IF NOT EXISTS idx_mkt_leads_campaign ON marketing_leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_mkt_leads_source ON marketing_leads(source);

CREATE TABLE IF NOT EXISTS marketing_email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  from_name VARCHAR(255),
  from_email VARCHAR(255),
  status VARCHAR(30) DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  recipient_count INTEGER DEFAULT 0,
  audience_filter JSONB DEFAULT '{}'::jsonb,
  delivered INTEGER DEFAULT 0,
  opened INTEGER DEFAULT 0,
  clicked INTEGER DEFAULT 0,
  bounced INTEGER DEFAULT 0,
  unsubscribed INTEGER DEFAULT 0,
  open_rate DECIMAL(5,2),
  click_rate DECIMAL(5,2),
  created_by UUID REFERENCES reimbursement_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_emails_status ON marketing_email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_mkt_emails_campaign ON marketing_email_campaigns(campaign_id);

CREATE TABLE IF NOT EXISTS marketing_scoring_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  signal VARCHAR(100) NOT NULL,
  points INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_scoring_signal ON marketing_scoring_rules(signal);

INSERT INTO marketing_scoring_rules (organization_id, name, signal, points)
SELECT NULL, seed.name, seed.signal, seed.points
FROM (
  VALUES
    ('Page View', 'page_view', 2),
    ('Content Download', 'content_download', 15),
    ('Email Open', 'email_open', 3),
    ('Email Click', 'email_click', 8),
    ('Webinar Registration', 'webinar_register', 20),
    ('Webinar Attended', 'webinar_attend', 30),
    ('Form Submission', 'form_submit', 25),
    ('Demo Request', 'demo_request', 50),
    ('Pricing Page Visit', 'pricing_view', 20),
    ('Return Visit (3+)', 'return_visit', 10)
) AS seed(name, signal, points)
WHERE NOT EXISTS (
  SELECT 1
  FROM marketing_scoring_rules msr
  WHERE msr.organization_id IS NULL
    AND msr.signal = seed.signal
);

DROP MATERIALIZED VIEW IF EXISTS mv_marketing_roi;

CREATE MATERIALIZED VIEW mv_marketing_roi AS
SELECT
  c.id AS campaign_id,
  c.name,
  c.channel,
  c.status,
  c.budget_eur AS budget,
  c.actual_spend_eur AS spend,
  c.leads_generated,
  CASE
    WHEN c.leads_generated > 0 AND c.actual_spend_eur > 0
      THEN ROUND((c.actual_spend_eur / c.leads_generated)::numeric, 2)
    ELSE 0
  END AS cost_per_lead,
  COALESCE(deal_stats.deal_count, 0) AS deals_created,
  COALESCE(deal_stats.deal_value, 0) AS deal_value,
  CASE
    WHEN c.actual_spend_eur > 0 AND COALESCE(deal_stats.deal_value, 0) > 0
      THEN ROUND((deal_stats.deal_value / c.actual_spend_eur)::numeric, 2)
    ELSE 0
  END AS roi_multiplier,
  c.start_date,
  c.end_date
FROM marketing_campaigns c
LEFT JOIN (
  SELECT
    l.campaign_id,
    COUNT(DISTINCT l.crm_deal_id) AS deal_count,
    COALESCE(SUM(d.amount_eur), 0) AS deal_value
  FROM marketing_leads l
  JOIN crm_deals d ON d.id = l.crm_deal_id
  GROUP BY l.campaign_id
) deal_stats ON deal_stats.campaign_id = c.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_mkt_roi_id ON mv_marketing_roi(campaign_id);
