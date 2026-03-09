-- ============================================================
-- Messign AI Brain — Analytics Tables
-- Migration: add_ai_brain_analytics.sql
--
-- Creates tables for logging AI queries and tool executions.
-- Used by queryLogger.ts and the admin analytics dashboard.
-- ============================================================

-- AI Query Logs: Every question asked to the AI
CREATE TABLE IF NOT EXISTS knowledge_ai_query_logs (
    id              SERIAL PRIMARY KEY,
    user_id         VARCHAR(100) NOT NULL,
    query           TEXT NOT NULL,
    tools_used      JSONB DEFAULT '[]',
    data_points_returned INTEGER DEFAULT 0,
    response_time_ms INTEGER DEFAULT 0,
    success         BOOLEAN DEFAULT true,
    error_message   TEXT,
    used_fallback   BOOLEAN DEFAULT false,
    tool_call_count INTEGER DEFAULT 0,
    concise_mode    BOOLEAN DEFAULT false,
    synthesis_provider VARCHAR(50),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_ai_query_logs_user ON knowledge_ai_query_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_query_logs_created ON knowledge_ai_query_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_query_logs_success ON knowledge_ai_query_logs(success);

-- AI Tool Execution Logs: Per-tool timing and success rates
CREATE TABLE IF NOT EXISTS knowledge_ai_tool_logs (
    id              SERIAL PRIMARY KEY,
    query_log_id    INTEGER REFERENCES knowledge_ai_query_logs(id) ON DELETE SET NULL,
    tool_name       VARCHAR(100) NOT NULL,
    execution_time_ms INTEGER DEFAULT 0,
    success         BOOLEAN DEFAULT true,
    record_count    INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_tool_logs_tool ON knowledge_ai_tool_logs(tool_name);
CREATE INDEX IF NOT EXISTS idx_ai_tool_logs_created ON knowledge_ai_tool_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_tool_logs_query ON knowledge_ai_tool_logs(query_log_id);
