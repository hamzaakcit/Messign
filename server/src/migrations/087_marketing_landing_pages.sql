-- Landing / web pages authored in Unlayer Page Builder (displayMode: web)
CREATE TABLE IF NOT EXISTS marketing_landing_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255),
  body_html TEXT NOT NULL,
  body_design JSONB,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_by UUID REFERENCES reimbursement_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_landing_pages_org ON marketing_landing_pages(organization_id);
CREATE INDEX IF NOT EXISTS idx_mkt_landing_pages_status ON marketing_landing_pages(status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mkt_landing_pages_org_slug
  ON marketing_landing_pages(organization_id, slug)
  WHERE slug IS NOT NULL AND btrim(slug) <> '';
