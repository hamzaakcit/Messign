-- Marketing truth + brand layers for Content Strategist (Dora)
-- Org-scoped; seed copies defaults to every existing organization.

CREATE TABLE IF NOT EXISTS marketing_truth_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(32) NOT NULL CHECK (status IN ('shipped', 'internal_only', 'beta', 'coming_soon', 'deprecated')),
  announced BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, key)
);

CREATE INDEX IF NOT EXISTS idx_mkt_truth_features_org ON marketing_truth_features(organization_id);
CREATE INDEX IF NOT EXISTS idx_mkt_truth_features_status ON marketing_truth_features(organization_id, status);

CREATE TABLE IF NOT EXISTS marketing_truth_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  claim_text TEXT NOT NULL,
  category VARCHAR(100),
  proof_reference TEXT,
  approved BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_truth_claims_org ON marketing_truth_claims(organization_id);

CREATE TABLE IF NOT EXISTS marketing_truth_blocked (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pattern_or_text TEXT NOT NULL,
  reason TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_truth_blocked_org ON marketing_truth_blocked(organization_id);

CREATE TABLE IF NOT EXISTS marketing_competitor_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  competitor_name VARCHAR(255) NOT NULL,
  point_text TEXT NOT NULL,
  approved BOOLEAN DEFAULT false,
  favors VARCHAR(16) CHECK (favors IS NULL OR favors IN ('messign', 'competitor', 'neutral')),
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_comp_points_org ON marketing_competitor_points(organization_id);

CREATE TABLE IF NOT EXISTS marketing_glossary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  term VARCHAR(255) NOT NULL,
  definition TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, term)
);

CREATE INDEX IF NOT EXISTS idx_mkt_glossary_org ON marketing_glossary(organization_id);

CREATE TABLE IF NOT EXISTS marketing_brand_profile (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketing_brand_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind VARCHAR(16) NOT NULL CHECK (kind IN ('golden', 'anti')),
  title VARCHAR(255),
  body TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_brand_examples_org ON marketing_brand_examples(organization_id);

-- Seed defaults for each existing org (idempotent per org+key / term)
INSERT INTO marketing_truth_features (organization_id, key, name, description, status, announced, sort_order)
SELECT o.id, v.key, v.name, v.description, v.status, v.announced, v.sort_order
FROM organizations o
CROSS JOIN (VALUES
  ('collaboration', 'Collaboration', 'Team chat, channels, and real-time collaboration across the workspace.', 'shipped', false, 10),
  ('work_management', 'Work Management', 'Projects, tasks, sprints, and assignments in one place.', 'shipped', false, 20),
  ('dora', 'AI Assistant (Dora)', 'Context-aware AI across modules with tools and approvals — not a bolt-on widget.', 'shipped', false, 30),
  ('gamification', 'Gamification', 'Badges, bounties, merit points, and leaderboards to drive engagement.', 'shipped', false, 40),
  ('knowledge_hub', 'Knowledge Hub', 'Published docs, policies, and hybrid RAG search.', 'shipped', false, 50),
  ('finance_ops', 'Finance / Ops module', 'Reimbursements, invoices, budgets — internal marketing only until GA.', 'internal_only', false, 100),
  ('marketing_hub', 'Marketing module', 'Campaigns, content calendar, leads — do not claim as customer-facing GA in external copy.', 'internal_only', false, 110)
) AS v(key, name, description, status, announced, sort_order)
ON CONFLICT (organization_id, key) DO NOTHING;

INSERT INTO marketing_truth_claims (organization_id, claim_text, category, proof_reference, approved, sort_order)
SELECT o.id, c.claim, c.cat, c.proof, true, c.ord
FROM organizations o
CROSS JOIN (VALUES
  ('Messign Workspace is an AI-native business operating system that consolidates collaboration, work management, knowledge, and AI (Dora) in one subscription.', 'positioning', 'Internal positioning doc', 10),
  ('Primary ICP: Founder, COO, or Head of Ops at SMB (10–50 employees) suffering tool sprawl.', 'icp', 'GTM brief', 20),
  ('Key differentiator: unified data context for Dora across messages, tasks, docs, and performance.', 'differentiator', 'Product narrative', 30),
  ('Key differentiator: gamified engagement (badges, bounties, merit points).', 'differentiator', 'Product narrative', 40),
  ('Key differentiator: AI-native design — Dora in every module, not only a sidebar copilot.', 'differentiator', 'Product narrative', 50),
  ('Consolidation story: replace 4–6 tools (chat + docs + PM + AI) with one platform.', 'value', 'Messaging pillar', 60)
) AS c(claim, cat, proof, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM marketing_truth_claims x WHERE x.organization_id = o.id AND x.claim_text = c.claim
);

INSERT INTO marketing_truth_blocked (organization_id, pattern_or_text, reason, sort_order)
SELECT o.id, b.pat, b.reason, b.ord
FROM organizations o
CROSS JOIN (VALUES
  ('fastest|best|#1|only|market.leading', 'Superlatives require an approved claim with proof in marketing_truth_claims.', 10),
  ('fabricated metrics|made.up numbers', 'Never invent usage, ROI, or performance stats.', 20)
) AS b(pat, reason, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM marketing_truth_blocked x WHERE x.organization_id = o.id AND x.pattern_or_text = b.pat
);

INSERT INTO marketing_competitor_points (organization_id, competitor_name, point_text, approved, favors, sort_order)
SELECT o.id, p.competitor, p.point, true, p.fav, p.ord
FROM organizations o
CROSS JOIN (VALUES
  ('Slack + Notion + Jira stack', 'Messign unifies chat, docs, and work tracking with shared context for AI; typical stack fragments context across tabs.', 'messign', 10),
  ('Generic AI copilots', 'Dora is wired to live workspace tools and approvals; not a generic chat overlay.', 'messign', 20)
) AS p(competitor, point, fav, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM marketing_competitor_points x
  WHERE x.organization_id = o.id AND x.competitor_name = p.competitor AND x.point_text = p.point
);

INSERT INTO marketing_glossary (organization_id, term, definition, sort_order)
SELECT o.id, g.term, g.def, g.ord
FROM organizations o
CROSS JOIN (VALUES
  ('Dora', 'Messign Workspace AI assistant: routes to modules, uses tools, and respects approval flows.', 10),
  ('Merit Points (MP)', 'Gamification currency earned through participation; shown in workspace UI.', 20),
  ('Knowledge Hub', 'Published internal documentation with search/RAG for employees.', 30)
) AS g(term, def, ord)
ON CONFLICT (organization_id, term) DO NOTHING;

INSERT INTO marketing_brand_profile (organization_id, profile)
SELECT o.id, jsonb_build_object(
  'tone', 'Direct, confident, senior marketer — expert but accessible for B2B SaaS.',
  'personality_traits', jsonb_build_array('clear', 'evidence-based', 'sales-supportive', 'no hype without proof'),
  'taboos', jsonb_build_array(
    'unverified metrics',
    'superlatives without approved claims',
    'disparaging competitors',
    'discussing specific pricing in copy'
  ),
  'emoji_policy', 'Minimal for LinkedIn (0-2, not in hook); punchy for X within brand.',
  'cta_defaults', 'Prefer Book a demo for sales-led pieces unless user specifies otherwise.'
)
FROM organizations o
WHERE NOT EXISTS (SELECT 1 FROM marketing_brand_profile p WHERE p.organization_id = o.id);

INSERT INTO marketing_brand_examples (organization_id, kind, title, body, sort_order)
SELECT o.id, e.kind::varchar, e.title, e.body, e.ord
FROM organizations o
CROSS JOIN (VALUES
  ('golden', 'ICP pain hook', 'Tool sprawl is not a budgeting problem — it is a context problem. When every team lives in a different app, your AI cannot see the whole business. Messign fixes that by design.', 10),
  ('anti', 'Hype without proof', 'We are the #1 AI platform and 10x your revenue overnight!!!', 10)
) AS e(kind, title, body, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM marketing_brand_examples x
  WHERE x.organization_id = o.id AND x.kind = e.kind AND COALESCE(x.title, '') = COALESCE(e.title, '')
);
