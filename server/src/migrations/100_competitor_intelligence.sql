-- Migration 100: Competitor Intelligence
-- Tables for tracking competitor profiles and their marketing events.

-- ═══════════════════════════════════════════
-- 1. Competitors table (profiles)
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  name TEXT NOT NULL,
  website_url TEXT,
  description TEXT,
  logo_url TEXT,

  monitor_urls TEXT[] NOT NULL DEFAULT '{}',
  monitor_email BOOLEAN DEFAULT false,
  monitor_social BOOLEAN DEFAULT false,

  industry TEXT,
  tier TEXT DEFAULT 'direct'
    CHECK (tier IN ('direct', 'indirect', 'aspirational')),

  active BOOLEAN NOT NULL DEFAULT true,
  last_scraped_at TIMESTAMPTZ,

  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competitors_org
  ON competitors(organization_id, active, name);

-- ═══════════════════════════════════════════
-- 2. RLS on competitors
-- ═══════════════════════════════════════════

ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS competitors_org_isolation ON competitors;
CREATE POLICY competitors_org_isolation ON competitors
  USING (organization_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_tenant', true)::uuid);

-- ═══════════════════════════════════════════
-- 3. Competitor Events table
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS competitor_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  competitor_id UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,

  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'blog_post', 'product_launch', 'pricing_change',
      'email_campaign', 'social_post', 'press_release',
      'feature_update', 'partnership', 'funding', 'other'
    )),

  title TEXT NOT NULL,
  summary TEXT,
  body_text TEXT,
  source_url TEXT,
  image_url TEXT,

  tags TEXT[] DEFAULT '{}',
  sentiment TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral')),
  significance TEXT DEFAULT 'normal'
    CHECK (significance IN ('low', 'normal', 'high', 'critical')),

  ai_analysis TEXT,
  ai_analyzed_at TIMESTAMPTZ,

  content_hash TEXT,

  event_date DATE,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competitor_events_comp
  ON competitor_events(competitor_id, discovered_at DESC);

CREATE INDEX IF NOT EXISTS idx_competitor_events_org
  ON competitor_events(organization_id, discovered_at DESC);

CREATE INDEX IF NOT EXISTS idx_competitor_events_type
  ON competitor_events(organization_id, event_type, discovered_at DESC);

CREATE INDEX IF NOT EXISTS idx_competitor_events_significant
  ON competitor_events(organization_id, significance)
  WHERE significance IN ('high', 'critical');

CREATE INDEX IF NOT EXISTS idx_competitor_events_hash
  ON competitor_events(organization_id, competitor_id, content_hash)
  WHERE content_hash IS NOT NULL;

-- ═══════════════════════════════════════════
-- 4. RLS on competitor_events
-- ═══════════════════════════════════════════

ALTER TABLE competitor_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS competitor_events_org_isolation ON competitor_events;
CREATE POLICY competitor_events_org_isolation ON competitor_events
  USING (organization_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_tenant', true)::uuid);
