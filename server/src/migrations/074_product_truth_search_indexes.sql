-- Speed up marketing:product_truth_lookup (ILIKE + pg_trgm similarity).
-- Run after 072_marketing_context_compiler_tables.sql

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- marketing_product_truth: search feature_name + description
CREATE INDEX IF NOT EXISTS idx_mkt_product_truth_feat_trgm
  ON marketing_product_truth USING gin (feature_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_mkt_product_truth_desc_trgm
  ON marketing_product_truth USING gin ((COALESCE(description, '')) gin_trgm_ops);

-- marketing_approved_claims
CREATE INDEX IF NOT EXISTS idx_mkt_approved_claims_claim_trgm
  ON marketing_approved_claims USING gin (claim gin_trgm_ops);

-- marketing_blocked_claims
CREATE INDEX IF NOT EXISTS idx_mkt_blocked_claim_trgm
  ON marketing_blocked_claims USING gin (blocked_claim gin_trgm_ops);

-- marketing_competitor_map
CREATE INDEX IF NOT EXISTS idx_mkt_competitor_name_trgm
  ON marketing_competitor_map USING gin (competitor_name gin_trgm_ops);

COMMENT ON INDEX idx_mkt_product_truth_feat_trgm IS 'Trgm index for product_truth_lookup tool (feature_name)';
COMMENT ON INDEX idx_mkt_approved_claims_claim_trgm IS 'Trgm index for product_truth_lookup tool (claim)';
