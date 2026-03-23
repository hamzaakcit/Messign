-- Email template library — stores templatized DesignManifest JSON for reuse.
CREATE TABLE IF NOT EXISTS marketing_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(60) DEFAULT 'custom',
  description TEXT,
  theme VARCHAR(60) NOT NULL,
  section_types TEXT[] DEFAULT '{}',
  manifest_json JSONB NOT NULL,
  usage_count INT DEFAULT 0,
  created_by UUID REFERENCES reimbursement_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_email_tpl_org ON marketing_email_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_mkt_email_tpl_category ON marketing_email_templates(organization_id, category);
