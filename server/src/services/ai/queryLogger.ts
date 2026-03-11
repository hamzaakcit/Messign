/**
 * Messign AI Brain — Query Logger
 *
 * Logs every AI query to the database for analytics:
 * - What questions are people asking?
 * - Which tools are most used?
 * - What's the average response time?
 * - Which queries fail? (knowledge gaps)
 * - What feedback are users giving?
 *
 * This data powers the admin AI analytics dashboard.
 *
 * Logging is ASYNC and FIRE-AND-FORGET — it never blocks the response.
 */

import { pool } from '../../db/index.js';

const DEFAULT_ORG_SLUG = 'messign';

export interface QueryLogEntry {
  userId: string;
  query: string;
  toolsUsed: string[];
  dataPointsReturned: number;
  responseTimeMs: number;
  success: boolean;
  errorMessage?: string;
  /** Whether the router fell back to knowledge search only */
  usedFallback: boolean;
  /** How many tool calls the router made */
  toolCallCount: number;
  /** Whether the query was in concise mode */
  conciseMode: boolean;
  /** The AI provider that generated the synthesis (groq/gemini/anthropic) */
  synthesisProvider?: string;
  /** Number of PII fields stripped before sending to external AI */
  piiFieldsStripped?: number;
}

/**
 * Log an AI query to the database.
 * This is fire-and-forget — errors are caught and logged, never thrown.
 * Returns the inserted id for optional tool logging, or null on error.
 */
export async function logQuery(entry: QueryLogEntry): Promise<number | null> {
  try {
    if (entry.piiFieldsStripped && entry.piiFieldsStripped > 0) {
      console.log(`[Query Logger] PII stripped: ${entry.piiFieldsStripped} field(s) sanitized before AI call`);
    }
    const res = await pool.query<{ id: number }>(`
      INSERT INTO knowledge_ai_query_logs (
        user_id, query, tools_used, data_points_returned,
        response_time_ms, success, error_message, used_fallback,
        tool_call_count, concise_mode, synthesis_provider, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING id
    `, [
      entry.userId,
      entry.query.slice(0, 2000),
      JSON.stringify(entry.toolsUsed),
      entry.dataPointsReturned,
      entry.responseTimeMs,
      entry.success,
      entry.errorMessage?.slice(0, 500) || null,
      entry.usedFallback,
      entry.toolCallCount,
      entry.conciseMode,
      entry.synthesisProvider || null,
    ]);
    return res.rows[0]?.id ?? null;
  } catch (err: unknown) {
    // NEVER let logging failures affect the user experience
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Query Logger] Failed to log query:', msg);
    return null;
  }
}

/**
 * Log a tool execution for per-tool analytics.
 */
export async function logToolExecution(
  queryLogId: number | null,
  toolName: string,
  executionTimeMs: number,
  success: boolean,
  recordCount: number
): Promise<void> {
  try {
    await pool.query(`
      INSERT INTO knowledge_ai_tool_logs (
        query_log_id, tool_name, execution_time_ms,
        success, record_count, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
    `, [queryLogId, toolName, executionTimeMs, success, recordCount]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Query Logger] Failed to log tool execution:', msg);
  }
}

// ============================================================
// ANALYTICS QUERIES (used by admin dashboard)
// ============================================================

function getAnalyticsDateFilter(period: string): Date {
  const now = new Date();
  switch (period) {
    case 'today': {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'this_week': {
      const d = new Date(now);
      d.setDate(d.getDate() - d.getDay() + 1);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'this_month':
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'this_quarter':
      return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    default:
      return new Date(now.getFullYear(), now.getMonth(), 1);
  }
}

/**
 * Get AI usage analytics for a given time period.
 */
export async function getAIAnalytics(
  period: 'today' | 'this_week' | 'this_month' | 'this_quarter'
): Promise<{
  totals: Record<string, unknown>;
  topTools: Record<string, unknown>[];
  topUsers: Record<string, unknown>[];
  queryTrend: Record<string, unknown>[];
  failedQueries: Record<string, unknown>[];
} | null> {
  const dateFilter = getAnalyticsDateFilter(period);

  try {
    // Total queries
    const totals = await pool.query(`
      SELECT
        COUNT(*)::int as total_queries,
        COUNT(*) FILTER (WHERE success = true)::int as successful_queries,
        COUNT(*) FILTER (WHERE success = false)::int as failed_queries,
        ROUND(AVG(response_time_ms))::int as avg_response_time_ms,
        ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms))::int as p95_response_time_ms,
        COUNT(DISTINCT user_id)::int as unique_users,
        ROUND(AVG(data_points_returned))::int as avg_data_points,
        COUNT(*) FILTER (WHERE used_fallback = true)::int as fallback_queries
      FROM knowledge_ai_query_logs
      WHERE created_at >= $1
    `, [dateFilter]);

    // Most used tools
    const topTools = await pool.query(`
      SELECT tool_name, COUNT(*)::int as usage_count,
             ROUND(AVG(execution_time_ms))::int as avg_time_ms,
             COUNT(*) FILTER (WHERE success = true)::int as success_count
      FROM knowledge_ai_tool_logs
      WHERE created_at >= $1
      GROUP BY tool_name
      ORDER BY usage_count DESC
      LIMIT 20
    `, [dateFilter]);

    // Most active users (join reimbursement_users on auth_user_id)
    const topUsers = await pool.query(`
      SELECT ql.user_id, ru.full_name, COUNT(*)::int as query_count
      FROM knowledge_ai_query_logs ql
      LEFT JOIN reimbursement_users ru ON ru.auth_user_id = ql.user_id
        AND ru.organization_id = (SELECT id FROM organizations WHERE slug = $2 LIMIT 1)
      WHERE ql.created_at >= $1
      GROUP BY ql.user_id, ru.full_name
      ORDER BY query_count DESC
      LIMIT 10
    `, [dateFilter, DEFAULT_ORG_SLUG]);

    // Queries over time (daily buckets)
    const queryTrend = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*)::int as queries
      FROM knowledge_ai_query_logs
      WHERE created_at >= $1
      GROUP BY DATE(created_at)
      ORDER BY date
    `, [dateFilter]);

    // Failed queries (knowledge gaps)
    const failedQueries = await pool.query(`
      SELECT query, COUNT(*)::int as fail_count
      FROM knowledge_ai_query_logs
      WHERE created_at >= $1 AND success = false
      GROUP BY query
      ORDER BY fail_count DESC
      LIMIT 20
    `, [dateFilter]);

    return {
      totals: totals.rows[0] ?? {},
      topTools: topTools.rows,
      topUsers: topUsers.rows,
      queryTrend: queryTrend.rows,
      failedQueries: failedQueries.rows,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[AI Analytics] Query failed:', msg);
    return null;
  }
}
