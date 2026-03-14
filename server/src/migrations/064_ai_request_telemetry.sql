-- AI Request Telemetry — Observability for Dora agentic system
-- Tracks path taken (orchestrator/agenticLoop/intentRouter), specialist, duration, fallback rate.
-- Run via: npm run db:migrate-runner

CREATE TABLE IF NOT EXISTS ai_request_telemetry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id TEXT NOT NULL,
  query TEXT NOT NULL,
  path TEXT NOT NULL,              -- 'orchestrator' | 'agenticLoop' | 'intentRouter' | 'web_search' | 'error'
  specialist TEXT,                 -- 'crm' | 'support' | 'finance' | null
  tool_calls_used INTEGER DEFAULT 0,
  model_tier TEXT,                 -- 'fast' | 'balanced' | 'complex'
  duration_ms INTEGER NOT NULL,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  tokens_input INTEGER,
  tokens_output INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_tenant_date ON ai_request_telemetry (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_path ON ai_request_telemetry (path, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_created ON ai_request_telemetry (created_at DESC);

COMMENT ON TABLE ai_request_telemetry IS 'Lightweight observability for AI request routing. Target: orchestrator >90%, P50 <5s, P95 <15s.';
