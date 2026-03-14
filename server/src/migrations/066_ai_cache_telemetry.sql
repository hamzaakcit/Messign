-- AI Cache Telemetry — Track LiteLLM cache hits and cost savings
-- Enables 30%+ cache hit rate target on fast tier.

ALTER TABLE ai_request_telemetry
  ADD COLUMN IF NOT EXISTS cache_hit BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS estimated_cost_savings_usd DECIMAL(10,6) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_telemetry_cache_hit ON ai_request_telemetry (tenant_id, cache_hit) WHERE cache_hit = true;

COMMENT ON COLUMN ai_request_telemetry.cache_hit IS 'True when LiteLLM returned cached response (no inference cost)';
COMMENT ON COLUMN ai_request_telemetry.estimated_cost_savings_usd IS 'Estimated $ saved when cache_hit=true (based on tier input/output cost)';
