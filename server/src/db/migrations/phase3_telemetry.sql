-- Phase 3 Intelligence Layer — Query Analytics & Feedback Schema
-- One row per AI interaction with full orchestration telemetry.
-- Safe to re-run: all statements use IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS ai_query_telemetry (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          TEXT NOT NULL,
  user_id             UUID NOT NULL,
  user_name           TEXT NOT NULL,
  user_role           TEXT NOT NULL,

  query               TEXT NOT NULL,
  query_length        INTEGER NOT NULL,
  current_page        TEXT,
  concise_mode        BOOLEAN DEFAULT false,

  step_count          INTEGER NOT NULL DEFAULT 1,
  tools_used          TEXT[] DEFAULT '{}',
  tool_call_count     INTEGER NOT NULL DEFAULT 0,
  termination_reason  TEXT NOT NULL DEFAULT 'complete',
  success             BOOLEAN NOT NULL DEFAULT true,

  total_duration_ms   INTEGER NOT NULL,
  llm_duration_ms     INTEGER DEFAULT 0,
  tool_duration_ms    INTEGER DEFAULT 0,
  prompt_tokens       INTEGER DEFAULT 0,
  completion_tokens   INTEGER DEFAULT 0,
  total_tokens        INTEGER DEFAULT 0,

  feedback_score      TEXT CHECK (feedback_score IN ('up', 'down')),
  feedback_comment    TEXT,
  feedback_at         TIMESTAMPTZ,

  thought_trace       TEXT[] DEFAULT '{}',
  error_message       TEXT,
  model_used          TEXT DEFAULT 'llama-3.3-70b-versatile',

  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_created
  ON ai_query_telemetry (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_user
  ON ai_query_telemetry (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_tools
  ON ai_query_telemetry USING gin (tools_used);

CREATE INDEX IF NOT EXISTS idx_telemetry_feedback
  ON ai_query_telemetry (feedback_score, created_at DESC)
  WHERE feedback_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_telemetry_duration
  ON ai_query_telemetry (total_duration_ms DESC)
  WHERE total_duration_ms > 5000;

CREATE INDEX IF NOT EXISTS idx_telemetry_failures
  ON ai_query_telemetry (created_at DESC)
  WHERE success = false;

CREATE INDEX IF NOT EXISTS idx_telemetry_session
  ON ai_query_telemetry (session_id, created_at);

-- Daily aggregates materialized view for dashboards.
-- Refresh via cron: REFRESH MATERIALIZED VIEW CONCURRENTLY ai_daily_stats;
CREATE MATERIALIZED VIEW IF NOT EXISTS ai_daily_stats AS
SELECT
  DATE(created_at) AS day,
  COUNT(*) AS total_queries,
  COUNT(DISTINCT user_id) AS unique_users,
  AVG(total_duration_ms)::INTEGER AS avg_duration_ms,
  AVG(step_count)::NUMERIC(3,1) AS avg_steps,
  AVG(total_tokens)::INTEGER AS avg_tokens,
  COUNT(*) FILTER (WHERE success = true) AS successful,
  COUNT(*) FILTER (WHERE success = false) AS failed,
  COUNT(*) FILTER (WHERE feedback_score = 'up') AS thumbs_up,
  COUNT(*) FILTER (WHERE feedback_score = 'down') AS thumbs_down
FROM ai_query_telemetry
GROUP BY DATE(created_at)
ORDER BY day DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_stats_day ON ai_daily_stats (day);

COMMENT ON TABLE ai_query_telemetry IS 'Logs every AI interaction for analytics, debugging, and quality improvement.';
COMMENT ON COLUMN ai_query_telemetry.session_id IS 'Groups messages in the same chat session for multi-turn analysis.';
COMMENT ON COLUMN ai_query_telemetry.tools_used IS 'Unique tool names called across all reasoning steps.';
COMMENT ON COLUMN ai_query_telemetry.tool_call_count IS 'Total calls made (may exceed tools_used length if same tool called with different args).';
COMMENT ON COLUMN ai_query_telemetry.termination_reason IS 'Why the reasoning loop ended: complete, max_steps, token_budget, timeout, error, no_tools, cascade_failure.';
COMMENT ON COLUMN ai_query_telemetry.thought_trace IS 'Array of LLM reasoning thoughts from each step. Invaluable for debugging bad answers.';
COMMENT ON COLUMN ai_query_telemetry.feedback_score IS 'User thumbs up/down. NULL means no feedback given.';
