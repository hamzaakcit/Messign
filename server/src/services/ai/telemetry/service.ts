import { pool } from '../../../db/index.js';
import type { OrchestrationResult } from '../orchestrator/types.js';
import type { DoraRequestContext } from '../dora/types.js';

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
