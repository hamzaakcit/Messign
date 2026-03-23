-- ═══════════════════════════════════════════
-- Migration 099: Brand Compliance + Multi-Tenant
-- Creates brand_profiles (multi-brand-per-org),
-- compliance_scans (audit trail), and adds
-- brand_profile_id FK to content/campaign tables.
-- ═══════════════════════════════════════════

-- ═══════════════════════════════════════════
-- 1. Brand Profiles table
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS brand_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Brand identity
  brand_name TEXT NOT NULL,
  brand_description TEXT,
  logo_url TEXT,

  -- Voice & tone
  tone_keywords TEXT[] NOT NULL DEFAULT '{}',
  forbidden_words TEXT[] NOT NULL DEFAULT '{}',
  required_disclaimers TEXT[] NOT NULL DEFAULT '{}',
  voice_examples TEXT[] NOT NULL DEFAULT '{}',
  style_guide_notes TEXT,

  -- Visual preferences
  color_palette JSONB DEFAULT '{}'::jsonb,
  preferred_themes TEXT[] DEFAULT '{}',

  -- Status
  active BOOLEAN NOT NULL DEFAULT true,

  -- Metadata
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brand_profiles_org
  ON brand_profiles(organization_id, active, brand_name);

-- ═══════════════════════════════════════════
-- 2. RLS on brand_profiles
-- ═══════════════════════════════════════════

ALTER TABLE brand_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brand_profiles_org_isolation ON brand_profiles;
CREATE POLICY brand_profiles_org_isolation ON brand_profiles
  USING (organization_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_tenant', true)::uuid);

-- ═══════════════════════════════════════════
-- 3. Add brand_profile_id to content tables
-- ═══════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'marketing_content' AND column_name = 'brand_profile_id'
  ) THEN
    ALTER TABLE marketing_content
      ADD COLUMN brand_profile_id UUID REFERENCES brand_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_marketing_content_brand
  ON marketing_content(brand_profile_id)
  WHERE brand_profile_id IS NOT NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'marketing_campaigns') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'marketing_campaigns' AND column_name = 'brand_profile_id'
    ) THEN
      ALTER TABLE marketing_campaigns
        ADD COLUMN brand_profile_id UUID REFERENCES brand_profiles(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_brand
  ON marketing_campaigns(brand_profile_id)
  WHERE brand_profile_id IS NOT NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'marketing_email_campaigns') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'marketing_email_campaigns' AND column_name = 'brand_profile_id'
    ) THEN
      ALTER TABLE marketing_email_campaigns
        ADD COLUMN brand_profile_id UUID REFERENCES brand_profiles(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_marketing_email_campaigns_brand
  ON marketing_email_campaigns(brand_profile_id)
  WHERE brand_profile_id IS NOT NULL;

-- ═══════════════════════════════════════════
-- 4. Compliance Scans table
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS compliance_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- What was scanned
  content_id UUID NOT NULL REFERENCES marketing_content(id) ON DELETE CASCADE,
  brand_profile_id UUID REFERENCES brand_profiles(id) ON DELETE SET NULL,

  -- Results
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  passed BOOLEAN GENERATED ALWAYS AS (score >= 80) STORED,

  -- Detailed flags
  flags JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Rule-based vs LLM breakdown
  rule_score INTEGER,
  llm_score INTEGER,
  rule_flags JSONB DEFAULT '[]'::jsonb,
  llm_flags JSONB DEFAULT '[]'::jsonb,

  -- Performance tracking
  scan_duration_ms INTEGER,

  -- Metadata
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  scanned_by TEXT DEFAULT 'auto'
);

CREATE INDEX IF NOT EXISTS idx_compliance_scans_content
  ON compliance_scans(content_id, scanned_at DESC);

CREATE INDEX IF NOT EXISTS idx_compliance_scans_org
  ON compliance_scans(organization_id, scanned_at DESC);

CREATE INDEX IF NOT EXISTS idx_compliance_scans_failed
  ON compliance_scans(organization_id, passed)
  WHERE passed = false;

-- ═══════════════════════════════════════════
-- 5. RLS on compliance_scans
-- ═══════════════════════════════════════════

ALTER TABLE compliance_scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compliance_scans_org_isolation ON compliance_scans;
CREATE POLICY compliance_scans_org_isolation ON compliance_scans
  USING (organization_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_tenant', true)::uuid);
