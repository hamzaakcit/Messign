-- Reviewable brand voice / golden-example proposals (HITL) — from Learner or strategists

CREATE TABLE IF NOT EXISTS marketing_brand_voice_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rationale TEXT NOT NULL,
  golden_example_additions JSONB NOT NULL DEFAULT '[]'::jsonb,
  tone_notes TEXT[] DEFAULT '{}',
  status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'superseded')),
  created_by_trace TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_brand_prop_org ON marketing_brand_voice_proposals(organization_id, status);

COMMENT ON TABLE marketing_brand_voice_proposals IS 'Proposed golden examples / tone updates; merge to marketing_brand_examples after human approval';
