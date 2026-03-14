import { pool } from '../../../db/index.js';
import type { OrchestrationResult } from '../orchestrator/types.js';
import type { DoraRequestContext } from '../dora/types.js';

export type AiRequestPath = 'orchestrator' | 'agenticLoop' | 'intentRouter' | 'web_search' | 'error';

/**
 * Fire-and-forget insert into ai_request_telemetry for observability dashboard.
 * Tracks path, specialist, duration, fallback rate. Never blocks the response.
 */
export function insertRequestTelemetry(params: {
  tenantId: string | null;
  userId: string;
  query: string;
  path: AiRequestPath;
  specialist?: string | null;
  toolCallsUsed: number;
  modelTier?: string | null;
  durationMs: number;
  success: boolean;
  errorMessage?: string | null;
  tokensInput?: number | null;
  tokensOutput?: number | null;
  cacheHit?: boolean;
  estimatedCostSavingsUsd?: number;
}): void {
  const {
    tenantId,
    userId,
    query,
    path,
    specialist,
    toolCallsUsed,
    modelTier,
    durationMs,
    success,
    errorMessage,
    tokensInput,
    tokensOutput,
    cacheHit,
    estimatedCostSavingsUsd,
  } = params;

  pool
    .query(
      `INSERT INTO ai_request_telemetry (
        tenant_id, user_id, query, path, specialist, tool_calls_used, model_tier,
        duration_ms, success, error_message, tokens_input, tokens_output,
        cache_hit, estimated_cost_savings_usd
      ) VALUES (
        COALESCE($1::uuid, (SELECT id FROM organizations WHERE slug = 'messign' LIMIT 1)),
        $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
      )`,
      [
        tenantId,
        userId,
        query.substring(0, 500),
        path,
        specialist ?? null,
        toolCallsUsed,
        modelTier ?? null,
        durationMs,
        success,
        errorMessage ?? null,
        tokensInput ?? null,
        tokensOutput ?? null,
        cacheHit ?? false,
        estimatedCostSavingsUsd ?? 0,
      ],
    )
    .catch((err) => console.error('[telemetry] ai_request_telemetry insert failed', err instanceof Error ? err.message : String(err)));
}

/**
 * Logs a complete AI interaction to the ai_query_telemetry table.
 * Fire-and-forget: telemetry failures never break the user's experience.
 */
export async function logTelemetry(
  result: OrchestrationResult,
  ctx: DoraRequestContext,
  queryText: string,
  sessionId: string,
): Promise<string | null> {
  try {
    // ai_query_telemetry.user_id expects UUID; ctx.user.userId may be auth_user_id (e.g. "user-1")
    const userIdForTelemetry = ctx.user.userUuid ?? ctx.user.userId;
    const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userIdForTelemetry);
    if (!isValidUuid) {
      console.warn(`[Telemetry] Skipping log: user_id "${userIdForTelemetry}" is not a valid UUID (resolve auth_user_id to reimbursement_users.id)`);
      return null;
    }

    let llmDuration = 0;
    let toolDuration = 0;

    for (const step of result.steps) {
      const stepToolTime = step.observations.reduce((s, o) => s + o.executionTimeMs, 0);
      toolDuration += stepToolTime;
      llmDuration += step.durationMs - stepToolTime;
    }

    const res = await pool.query<{ id: string }>(
      `INSERT INTO ai_query_telemetry (
        session_id, user_id, user_name, user_role,
        query, query_length, current_page, concise_mode,
        step_count, tools_used, tool_call_count, termination_reason, success,
        total_duration_ms, llm_duration_ms, tool_duration_ms,
        prompt_tokens, completion_tokens, total_tokens,
        thought_trace, error_message
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10, $11, $12, $13,
        $14, $15, $16,
        $17, $18, $19,
        $20, $21
      ) RETURNING id`,
      [
        sessionId,
        userIdForTelemetry,
        ctx.user.userName,
        ctx.user.userRole,
        queryText.slice(0, 2000),
        queryText.length,
        ctx.page.currentPath,
        ctx.conciseMode,
        result.stepCount,
        result.toolsUsed,
        result.steps.reduce((s, step) => s + step.toolCalls.length, 0),
        result.terminationReason,
        result.success,
        result.totalDurationMs,
        Math.max(0, llmDuration),
        toolDuration,
        result.totalTokens.promptTokens,
        result.totalTokens.completionTokens,
        result.totalTokens.totalTokens,
        result.steps
          .filter((s) => s.thought)
          .map((s) => `[Step ${s.index + 1}] ${s.thought}`),
        result.error || null,
      ],
    );

    return res.rows[0]?.id || null;
  } catch (error) {
    console.error('[Telemetry] Failed to log query:', error);
    return null;
  }
}

/**
 * Attaches user feedback to an existing telemetry record.
 */
export async function attachFeedback(
  telemetryId: string | null,
  feedbackScore: 'up' | 'down',
  feedbackComment: string | null,
  userId: string,
  queryText?: string,
): Promise<boolean> {
  try {
    if (telemetryId) {
      await pool.query(
        `UPDATE ai_query_telemetry
         SET feedback_score = $1, feedback_comment = $2, feedback_at = NOW()
         WHERE id = $3 AND user_id = $4`,
        [feedbackScore, feedbackComment, telemetryId, userId],
      );
    } else if (queryText) {
      await pool.query(
        `UPDATE ai_query_telemetry
         SET feedback_score = $1, feedback_comment = $2, feedback_at = NOW()
         WHERE id = (
           SELECT id FROM ai_query_telemetry
           WHERE user_id = $3 AND query = $4
           ORDER BY created_at DESC LIMIT 1
         )`,
        [feedbackScore, feedbackComment, userId, queryText],
      );
    }
    return true;
  } catch (error) {
    console.error('[Telemetry] Failed to attach feedback:', error);
    return false;
  }
}

/**
 * Gets aggregated stats for a date range.
 * Used by the admin AI analytics dashboard and weekly reports.
 */
export async function getAnalyticsSummary(
  startDate: string,
  endDate: string,
): Promise<{
  totalQueries: number;
  uniqueUsers: number;
  avgDurationMs: number;
  avgSteps: number;
  avgTokens: number;
  successRate: number;
  feedbackRate: number;
  satisfactionRate: number;
  topTools: Array<{ tool: string; count: number }>;
  topFailureReasons: Array<{ reason: string; count: number }>;
  peakHour: number;
}> {
  const main = await pool.query(
    `SELECT
      COUNT(*) AS total_queries,
      COUNT(DISTINCT user_id) AS unique_users,
      AVG(total_duration_ms)::INTEGER AS avg_duration_ms,
      AVG(step_count)::NUMERIC(3,1) AS avg_steps,
      AVG(total_tokens)::INTEGER AS avg_tokens,
      (COUNT(*) FILTER (WHERE success) * 100.0 / NULLIF(COUNT(*), 0))::NUMERIC(4,1) AS success_rate,
      (COUNT(*) FILTER (WHERE feedback_score IS NOT NULL) * 100.0 / NULLIF(COUNT(*), 0))::NUMERIC(4,1) AS feedback_rate,
      (COUNT(*) FILTER (WHERE feedback_score = 'up') * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE feedback_score IS NOT NULL), 0))::NUMERIC(4,1) AS satisfaction_rate,
      MODE() WITHIN GROUP (ORDER BY EXTRACT(HOUR FROM created_at)) AS peak_hour
    FROM ai_query_telemetry
    WHERE created_at >= $1 AND created_at < $2`,
    [startDate, endDate],
  );

  const tools = await pool.query<{ tool: string; count: number }>(
    `SELECT tool, COUNT(*)::int AS count
     FROM ai_query_telemetry, unnest(tools_used) AS tool
     WHERE created_at >= $1 AND created_at < $2
     GROUP BY tool ORDER BY count DESC LIMIT 10`,
    [startDate, endDate],
  );

  const failures = await pool.query<{ reason: string; count: number }>(
    `SELECT termination_reason AS reason, COUNT(*)::int AS count
     FROM ai_query_telemetry
     WHERE created_at >= $1 AND created_at < $2 AND success = false
     GROUP BY termination_reason ORDER BY count DESC`,
    [startDate, endDate],
  );

  const row = main.rows[0] as Record<string, unknown> || {};

  return {
    totalQueries: parseInt(String(row.total_queries)) || 0,
    uniqueUsers: parseInt(String(row.unique_users)) || 0,
    avgDurationMs: parseInt(String(row.avg_duration_ms)) || 0,
    avgSteps: parseFloat(String(row.avg_steps)) || 1,
    avgTokens: parseInt(String(row.avg_tokens)) || 0,
    successRate: parseFloat(String(row.success_rate)) || 0,
    feedbackRate: parseFloat(String(row.feedback_rate)) || 0,
    satisfactionRate: parseFloat(String(row.satisfaction_rate)) || 0,
    topTools: tools.rows,
    topFailureReasons: failures.rows,
    peakHour: parseInt(String(row.peak_hour)) || 10,
  };
}

/**
 * Gets queries with negative feedback for quality review.
 */
export async function getNegativeFeedbackQueries(
  limit: number = 20,
  startDate?: string,
): Promise<Array<{
  id: string;
  query: string;
  toolsUsed: string[];
  stepCount: number;
  thoughtTrace: string[];
  feedbackComment: string | null;
  createdAt: string;
}>> {
  const where = startDate
    ? "WHERE feedback_score = 'down' AND created_at >= $2"
    : "WHERE feedback_score = 'down'";

  const params: unknown[] = startDate ? [limit, startDate] : [limit];

  const result = await pool.query(
    `SELECT id, query, tools_used, step_count, thought_trace, feedback_comment, created_at
     FROM ai_query_telemetry
     ${where}
     ORDER BY created_at DESC LIMIT $1`,
    params,
  );

  return result.rows as Array<{
    id: string;
    query: string;
    toolsUsed: string[];
    stepCount: number;
    thoughtTrace: string[];
    feedbackComment: string | null;
    createdAt: string;
  }>;
}

export interface AiRequestMetrics {
  totalRequests: number;
  requestsByDay: Array<{ date: string; count: number }>;
  requestsByPath: Array<{ path: string; count: number; percent: number }>;
  avgDurationBySpecialist: Array<{ specialist: string | null; avgDurationMs: number; count: number }>;
  topErrors: Array<{ errorMessage: string; count: number }>;
  fallbackRate: number;
  p50DurationMs: number;
  p95DurationMs: number;
  /** Cache hit rate (0–100) — target 30%+ on fast tier */
  cacheHitRate: number;
  /** Estimated USD saved from cache hits */
  estimatedCostSavingsUsd: number;
}

/**
 * Gets AI request observability metrics from ai_request_telemetry.
 * Used by executive:get_ai_metrics tool and GET /api/executive/ai-metrics.
 */
export async function getAiRequestMetrics(
  tenantId: string,
  rangeDays: number = 7,
): Promise<AiRequestMetrics> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - rangeDays);
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  const [total, byDay, byPath, bySpecialist, topErrors, percentiles, cacheStats] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ai_request_telemetry
       WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3::date + interval '1 day'`,
      [tenantId, startStr, endStr],
    ),
    pool.query<{ date: string; count: string }>(
      `SELECT date_trunc('day', created_at)::date::text AS date, COUNT(*)::text AS count
       FROM ai_request_telemetry
       WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3::date + interval '1 day'
       GROUP BY date_trunc('day', created_at) ORDER BY date`,
      [tenantId, startStr, endStr],
    ),
    pool.query<{ path: string; count: string }>(
      `SELECT path, COUNT(*)::text AS count
       FROM ai_request_telemetry
       WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3::date + interval '1 day'
       GROUP BY path ORDER BY count DESC`,
      [tenantId, startStr, endStr],
    ),
    pool.query<{ specialist: string | null; avg_duration_ms: string; count: string }>(
      `SELECT specialist, AVG(duration_ms)::int::text AS avg_duration_ms, COUNT(*)::text AS count
       FROM ai_request_telemetry
       WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3::date + interval '1 day' AND success = true
       GROUP BY specialist ORDER BY count DESC`,
      [tenantId, startStr, endStr],
    ),
    pool.query<{ error_message: string; count: string }>(
      `SELECT COALESCE(error_message, 'unknown') AS error_message, COUNT(*)::text AS count
       FROM ai_request_telemetry
       WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3::date + interval '1 day' AND success = false
       GROUP BY error_message ORDER BY count DESC LIMIT 10`,
      [tenantId, startStr, endStr],
    ),
    pool.query<{ p50: string; p95: string }>(
      `SELECT
         PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms)::int::text AS p50,
         PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)::int::text AS p95
       FROM ai_request_telemetry
       WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3::date + interval '1 day'`,
      [tenantId, startStr, endStr],
    ),
    pool.query<{ cache_hits: string; total_cached: string; cost_savings: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE cache_hit = true)::text AS cache_hits,
         COUNT(*)::text AS total_cached,
         COALESCE(SUM(estimated_cost_savings_usd), 0)::text AS cost_savings
       FROM ai_request_telemetry
       WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3::date + interval '1 day'`,
      [tenantId, startStr, endStr],
    ),
  ]);

  const totalCount = parseInt(total.rows[0]?.count ?? '0', 10);
  const orchestratorCount = byPath.rows.find((r) => r.path === 'orchestrator')?.count ?? '0';
  const fallbackRate = totalCount > 0
    ? ((totalCount - parseInt(orchestratorCount, 10)) / totalCount) * 100
    : 0;

  const pathTotal = byPath.rows.reduce((s, r) => s + parseInt(r.count, 10), 0);

  const cacheHits = parseInt(cacheStats.rows[0]?.cache_hits ?? '0', 10);
  const totalForCache = parseInt(cacheStats.rows[0]?.total_cached ?? '0', 10);
  const costSavings = parseFloat(cacheStats.rows[0]?.cost_savings ?? '0');

  return {
    totalRequests: totalCount,
    requestsByDay: byDay.rows.map((r) => ({
      date: r.date,
      count: parseInt(r.count, 10),
    })),
    requestsByPath: byPath.rows.map((r) => ({
      path: r.path,
      count: parseInt(r.count, 10),
      percent: pathTotal > 0 ? (parseInt(r.count, 10) / pathTotal) * 100 : 0,
    })),
    avgDurationBySpecialist: bySpecialist.rows.map((r) => ({
      specialist: r.specialist ?? 'none',
      avgDurationMs: parseInt(r.avg_duration_ms, 10) || 0,
      count: parseInt(r.count, 10),
    })),
    topErrors: topErrors.rows.map((r) => ({
      errorMessage: r.error_message,
      count: parseInt(r.count, 10),
    })),
    fallbackRate: Math.round(fallbackRate * 10) / 10,
    p50DurationMs: parseInt(percentiles.rows[0]?.p50 ?? '0', 10),
    p95DurationMs: parseInt(percentiles.rows[0]?.p95 ?? '0', 10),
    cacheHitRate: totalForCache > 0 ? Math.round((cacheHits / totalForCache) * 1000) / 10 : 0,
    estimatedCostSavingsUsd: Math.round(costSavings * 1_000_000) / 1_000_000,
  };
}

/**
 * User-level AI stats for "Powered by Dora" section (queries this week, specialists used).
 */
export async function getUserAiStats(
  userId: string,
  rangeDays: number = 7,
): Promise<{ queryCount: number; specialistsUsed: { specialist: string; count: number }[] }> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - rangeDays);
  const startStr = startDate.toISOString().split('T')[0];
  const endDate = new Date();
  const endStr = endDate.toISOString().split('T')[0];

  const [countRes, specialistsRes] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ai_request_telemetry
       WHERE user_id = $1 AND created_at >= $2 AND created_at < $3::date + interval '1 day'`,
      [userId, startStr, endStr],
    ),
    pool.query<{ specialist: string | null; count: string }>(
      `SELECT COALESCE(specialist, 'general') AS specialist, COUNT(*)::text AS count
       FROM ai_request_telemetry
       WHERE user_id = $1 AND created_at >= $2 AND created_at < $3::date + interval '1 day' AND success = true
       GROUP BY specialist ORDER BY count DESC LIMIT 10`,
      [userId, startStr, endStr],
    ),
  ]);

  const queryCount = parseInt(countRes.rows[0]?.count ?? '0', 10);
  const specialistsUsed = specialistsRes.rows.map((r) => ({
    specialist: r.specialist === 'general' ? 'General' : r.specialist ?? 'General',
    count: parseInt(r.count, 10),
  }));

  return { queryCount, specialistsUsed };
}
