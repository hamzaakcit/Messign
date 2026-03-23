-- Unlayer Document builder (displayMode: document) — reports, proposals, contracts, etc.
CREATE TABLE IF NOT EXISTS marketing_documents (
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

CREATE INDEX IF NOT EXISTS idx_mkt_documents_org ON marketing_documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_mkt_documents_status ON marketing_documents(status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mkt_documents_org_slug
  ON marketing_documents(organization_id, slug)
  WHERE slug IS NOT NULL AND btrim(slug) <> '';
