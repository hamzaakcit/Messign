-- Marketing context compiler tables (workspace-scoped).
-- workspace_id references organizations(id) — Messign uses organization as the workspace tenant.

-- Product truth: feature registry (v2-style names; complements legacy marketing_truth_features)
CREATE TABLE IF NOT EXISTS marketing_product_truth (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  feature_name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(32) NOT NULL CHECK (status IN ('shipped', 'beta', 'internal_only', 'coming_soon', 'deprecated')),
  announced BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_product_truth_ws ON marketing_product_truth(workspace_id);
CREATE INDEX IF NOT EXISTS idx_mkt_product_truth_status ON marketing_product_truth(workspace_id, status);

CREATE TABLE IF NOT EXISTS marketing_approved_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  claim TEXT NOT NULL,
  proof_point TEXT,
  context_tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_approved_claims_ws ON marketing_approved_claims(workspace_id);

CREATE TABLE IF NOT EXISTS marketing_blocked_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  blocked_claim TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_blocked_claims_ws ON marketing_blocked_claims(workspace_id);

-- Competitor map (structured row per competitor)
CREATE TABLE IF NOT EXISTS marketing_competitor_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  competitor_name VARCHAR(255) NOT NULL,
  approved_comparison_points JSONB DEFAULT '[]'::jsonb,
  strengths TEXT,
  weaknesses TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_comp_map_ws ON marketing_competitor_map(workspace_id);

-- Brand profile (relational; legacy marketing_brand_profile JSONB may still exist — compiler merges)
CREATE TABLE IF NOT EXISTS marketing_brand_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tone_description TEXT,
  personality_traits TEXT[] DEFAULT '{}',
  taboos TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_mkt_brand_profiles_ws ON marketing_brand_profiles(workspace_id);

-- Extend existing brand examples (069) for format + optional content column
ALTER TABLE marketing_brand_examples
  ADD COLUMN IF NOT EXISTS format VARCHAR(32) CHECK (format IS NULL OR format IN ('blog', 'email', 'social', 'other'));

ALTER TABLE marketing_brand_examples
  ADD COLUMN IF NOT EXISTS content TEXT;

COMMENT ON TABLE marketing_product_truth IS 'Feature registry for marketing context compiler (workspace_id = organization)';
COMMENT ON COLUMN marketing_brand_examples.content IS 'Optional body override; if null, use body column';
