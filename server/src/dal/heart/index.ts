import type { PoolClient } from 'pg';
import { withTenantQuery } from '../../middleware/tenantContext.js';
import type { CallerContext } from '../types.js';

async function runInTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTenantQuery(tenantId, fn);
}

/** K-anonymity: do not expose team/department health for groups < 5 members */
const K_ANON_THRESHOLD = 5;

export interface WellnessInsights {
  sentimentTrend: 'improving' | 'stable' | 'declining';
  burnoutRisk: 'none' | 'low' | 'medium' | 'high';
  hoursThisWeek: number;
  daysSincePTO: number;
  suggestions: string[];
}

export interface SentimentDataPoint {
  date: string;
  score: number;
  source: string;
}

export interface BurnoutAssessment {
  id: string;
  riskLevel: string;
  overallScore: number;
  assessedAt: string;
  previousRiskLevel: string | null;
}

export interface TeamHealth {
  scopeType: string;
  scopeId: string | null;
  scopeName: string | null;
  healthScore: number;
  engagementScore: number;
  sentimentScore: number;
  memberCount: number;
  atRiskCount: number;
  healthTrend: string;
  periodStart: string;
  periodEnd: string;
}

export interface PulseSurvey {
  id: string;
  title: string | null;
  questions: unknown[];
  status: string;
  responseCount: number;
  closesAt: string | null;
}

export interface PulseSurveyResults {
  surveyId: string;
  questionCount: number;
  responseCount: number;
  aggregates: Record<string, { avg: number; min: number; max: number }>;
}

/** Personal data — only returns data for ctx.userId */
export async function getMyWellnessInsights(ctx: CallerContext): Promise<WellnessInsights> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getMyWellnessInsights');

  const userId = ctx.userId;
  const suggestions: string[] = [];

  return runInTenant(tenantId, async (client) => {
    const burnoutRow = await client.query<{ risk_level: string; sentiment_trend: string }>(
      `SELECT risk_level, sentiment_trend FROM heart_burnout_assessments
       WHERE user_id = $1::uuid ORDER BY assessed_at DESC LIMIT 1`,
      [userId]
    );
    const burnout = burnoutRow.rows[0];
    const burnoutRisk = (burnout?.risk_level ?? 'none') as WellnessInsights['burnoutRisk'];
    const sentimentTrend = (burnout?.sentiment_trend ?? 'stable') as WellnessInsights['sentimentTrend'];

    const hoursRow = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(hours), 0)::text AS total FROM time_entries
       WHERE user_id = $1::uuid AND date >= CURRENT_DATE - INTERVAL '7 days' AND status != 'rejected'`,
      [userId]
    );
    const hoursThisWeek = parseFloat(hoursRow.rows[0]?.total ?? '0');

    const daysSincePTO = 30; // Placeholder until PTO table exists

    if (burnoutRisk === 'medium' || burnoutRisk === 'high') {
      suggestions.push('Consider scheduling a 1:1 with your manager to discuss workload.');
    }
    if (sentimentTrend === 'declining') {
      suggestions.push('Your communication tone has shifted. A quick check-in with a colleague might help.');
    }
    if (hoursThisWeek > 45) {
      suggestions.push('You\'ve logged more than 45 hours this week. Rest helps sustained performance.');
    }
    if (daysSincePTO > 21) {
      suggestions.push('You haven\'t taken time off recently. Rest is important.');
    }
    if (suggestions.length === 0) {
      suggestions.push('Keep up the good work. Remember to take breaks.');
    }

    return {
      sentimentTrend,
      burnoutRisk,
      hoursThisWeek,
      daysSincePTO,
      suggestions,
    };
  });
}

export async function getMySentimentHistory(
  ctx: CallerContext,
  days: number = 30
): Promise<SentimentDataPoint[]> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getMySentimentHistory');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query<{ analyzed_at: string; score: string; source: string }>(
      `SELECT analyzed_at::text AS analyzed_at, score::text AS score, source
       FROM heart_sentiment_scores
       WHERE user_id = $1::uuid AND analyzed_at >= NOW() - INTERVAL '1 day' * $2
       ORDER BY analyzed_at ASC`,
      [ctx.userId, days]
    );
    return result.rows.map((r) => ({
      date: r.analyzed_at.split('T')[0] ?? r.analyzed_at,
      score: parseFloat(r.score),
      source: r.source,
    }));
  });
}

export async function getMyBurnoutHistory(ctx: CallerContext): Promise<BurnoutAssessment[]> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getMyBurnoutHistory');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query<{
      id: string;
      risk_level: string;
      overall_score: string;
      assessed_at: string;
      previous_risk_level: string | null;
    }>(
      `SELECT id::text AS id, risk_level, overall_score::text AS overall_score,
              assessed_at::text AS assessed_at, previous_risk_level
       FROM heart_burnout_assessments
       WHERE user_id = $1::uuid ORDER BY assessed_at DESC LIMIT 5`,
      [ctx.userId]
    );
    return result.rows.map((r) => ({
      id: r.id,
      riskLevel: r.risk_level,
      overallScore: parseFloat(r.overall_score),
      assessedAt: r.assessed_at,
      previousRiskLevel: r.previous_risk_level,
    }));
  });
}

/** Team aggregates — RBAC: manager sees team, dept_head/admin see department/org. No individual data. */
export async function getTeamHealth(
  ctx: CallerContext,
  scopeType: 'team' | 'department' | 'organization',
  scopeId?: string
): Promise<TeamHealth | null> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getTeamHealth');

  await enforceTeamHealthAccess(ctx, scopeType, scopeId);

  const effectiveScopeId = scopeType === 'organization' ? tenantId : scopeId;
  return runInTenant(tenantId, async (client) => {
    const result = await client.query<{
    scope_type: string;
    scope_id: string | null;
    scope_name: string | null;
    health_score: number;
    engagement_score: number;
    sentiment_score: number;
    member_count: number;
    at_risk_count: number;
    health_trend: string;
    period_start: string;
    period_end: string;
  }>(
    `SELECT scope_type, scope_id::text AS scope_id, scope_name,
            health_score, engagement_score, sentiment_score,
            member_count, at_risk_count, health_trend,
            period_start::text AS period_start, period_end::text AS period_end
     FROM heart_team_health
     WHERE scope_type = $1 AND scope_id IS NOT DISTINCT FROM $2
     ORDER BY period_start DESC LIMIT 1`,
      [scopeType, effectiveScopeId ?? null]
    );
    const row = result.rows[0];
    if (!row) return null;
    if (scopeType !== 'organization' && row.member_count < K_ANON_THRESHOLD) {
      return null;
    }
    return {
      scopeType: row.scope_type,
      scopeId: row.scope_id,
      scopeName: row.scope_name,
      healthScore: row.health_score,
      engagementScore: row.engagement_score,
      sentimentScore: row.sentiment_score,
      memberCount: row.member_count,
      atRiskCount: row.at_risk_count,
      healthTrend: row.health_trend,
      periodStart: row.period_start,
      periodEnd: row.period_end,
    };
  });
}

export async function getTeamHealthHistory(
  ctx: CallerContext,
  scopeType: 'team' | 'department' | 'organization',
  scopeId?: string,
  periods: number = 12
): Promise<TeamHealth[]> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getTeamHealthHistory');

  await enforceTeamHealthAccess(ctx, scopeType, scopeId);

  const effectiveScopeId = scopeType === 'organization' ? tenantId : scopeId;
  return runInTenant(tenantId, async (client) => {
    const result = await client.query<{
    scope_type: string;
    scope_id: string | null;
    scope_name: string | null;
    health_score: number;
    engagement_score: number;
    sentiment_score: number;
    member_count: number;
    at_risk_count: number;
    health_trend: string;
    period_start: string;
    period_end: string;
  }>(
    `SELECT scope_type, scope_id::text AS scope_id, scope_name,
            health_score, engagement_score, sentiment_score,
            member_count, at_risk_count, health_trend,
            period_start::text AS period_start, period_end::text AS period_end
     FROM heart_team_health
     WHERE scope_type = $1 AND scope_id IS NOT DISTINCT FROM $2
     ORDER BY period_start DESC LIMIT $3`,
      [scopeType, effectiveScopeId ?? null, periods]
    );
    return result.rows
      .filter((r) => scopeType === 'organization' || r.member_count >= K_ANON_THRESHOLD)
      .map((r) => ({
        scopeType: r.scope_type,
        scopeId: r.scope_id,
        scopeName: r.scope_name,
        healthScore: r.health_score,
        engagementScore: r.engagement_score,
        sentimentScore: r.sentiment_score,
        memberCount: r.member_count,
        atRiskCount: r.at_risk_count,
        healthTrend: r.health_trend,
        periodStart: r.period_start,
        periodEnd: r.period_end,
      }));
  });
}

/** All departments comparison — dept_head+ only */
export async function getDepartmentComparison(ctx: CallerContext): Promise<TeamHealth[]> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getDepartmentComparison');

  if (!canAccessTeamHealth(ctx)) {
    throw new Error('Insufficient role for department comparison');
  }
  return runInTenant(tenantId, async (client) => {
    const result = await client.query<{
      scope_type: string;
      scope_id: string | null;
      scope_name: string | null;
      health_score: number;
      engagement_score: number;
      sentiment_score: number;
      member_count: number;
      at_risk_count: number;
      health_trend: string;
      period_start: string;
      period_end: string;
    }>(
      `SELECT scope_type, scope_id::text AS scope_id, scope_name,
              health_score, engagement_score, sentiment_score,
              member_count, at_risk_count, health_trend,
              period_start::text AS period_start, period_end::text AS period_end
       FROM heart_team_health
       WHERE scope_type = 'department'
       ORDER BY health_score DESC`,
    );
    return result.rows
      .filter((r) => r.member_count >= K_ANON_THRESHOLD)
      .map((r) => ({
        scopeType: r.scope_type,
        scopeId: r.scope_id,
        scopeName: r.scope_name,
        healthScore: r.health_score,
        engagementScore: r.engagement_score,
        sentimentScore: r.sentiment_score,
        memberCount: r.member_count,
        atRiskCount: r.at_risk_count,
        healthTrend: r.health_trend,
        periodStart: r.period_start,
        periodEnd: r.period_end,
      }));
  });
}

function canAccessTeamHealth(ctx: CallerContext): boolean {
  const r = ctx.role as string;
  return ['admin', 'manager', 'dept_head', 'system_admin', 'finance_admin'].includes(r);
}

async function enforceTeamHealthAccess(
  ctx: CallerContext,
  scopeType: string,
  scopeId?: string
): Promise<void> {
  const r = ctx.role as string;
  if (r === 'admin' || r === 'system_admin') return; // Full access
  if (!canAccessTeamHealth(ctx)) throw new Error('Insufficient role for team health');
  if (scopeType === 'team' && ctx.teamId && scopeId === ctx.teamId) return;
  if (scopeType === 'department' && (scopeId === ctx.departmentId || scopeId === ctx.teamId)) return;
  if (scopeType === 'organization' && ctx.organizationId) return;
  throw new Error('Insufficient scope access for team health');
}

// ── Pulse surveys ──

export async function createPulseSurvey(
  ctx: CallerContext,
  data: { title?: string; questions: unknown[]; targetScope?: string; targetScopeId?: string }
): Promise<PulseSurvey> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for createPulseSurvey');

  if (!canAccessTeamHealth(ctx)) {
    throw new Error('Insufficient role to create pulse survey');
  }
  return runInTenant(tenantId, async (client) => {
    const result = await client.query<{
    id: string;
    title: string | null;
    questions: unknown;
    status: string;
    response_count: number;
    closes_at: string | null;
  }>(
    `INSERT INTO heart_pulse_surveys (organization_id, title, questions, target_scope, target_scope_id, created_by)
     VALUES ($1::uuid, $2, $3, $4, $5, $6::uuid)
     RETURNING id::text AS id, title, questions, status, response_count AS response_count, closes_at::text AS closes_at`,
      [
        tenantId,
        data.title ?? null,
        JSON.stringify(data.questions),
        data.targetScope ?? 'organization',
        data.targetScopeId ?? null,
        ctx.userId,
      ]
    );
    const r = result.rows[0]!;
    return {
      id: r.id,
      title: r.title,
      questions: r.questions as unknown[],
      status: r.status,
      responseCount: r.response_count,
      closesAt: r.closes_at,
    };
  });
}

export async function getActiveSurvey(ctx: CallerContext): Promise<PulseSurvey | null> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getActiveSurvey');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query<{
      id: string;
      title: string | null;
      questions: unknown;
      status: string;
      response_count: number;
      closes_at: string | null;
    }>(
      `SELECT s.id::text AS id, s.title, s.questions, s.status, s.response_count AS response_count, s.closes_at::text AS closes_at
       FROM heart_pulse_surveys s
       WHERE s.status = 'active'
         AND (s.closes_at IS NULL OR s.closes_at > NOW())
       ORDER BY s.sent_at DESC NULLS LAST LIMIT 1`,
    );
    const r = result.rows[0];
    if (!r) return null;
    return {
      id: r.id,
      title: r.title,
      questions: r.questions as unknown[],
      status: r.status,
      responseCount: r.response_count,
      closesAt: r.closes_at,
    };
  });
}

/** Anonymous — no user_id stored */
export async function submitPulseResponse(
  ctx: CallerContext,
  surveyId: string,
  answers: Record<string, number>,
  department?: string
): Promise<void> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for submitPulseResponse');

  await runInTenant(tenantId, async (client) => {
    await client.query(
      `INSERT INTO heart_pulse_responses (survey_id, department, answers)
       VALUES ($1::uuid, $2, $3)`,
      [surveyId, department ?? null, JSON.stringify(answers)]
    );
    await client.query(
      `UPDATE heart_pulse_surveys SET response_count = response_count + 1 WHERE id = $1::uuid`,
      [surveyId]
    );
  });
}

export async function getSurveyResults(ctx: CallerContext, surveyId: string): Promise<PulseSurveyResults | null> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getSurveyResults');

  if (!canAccessTeamHealth(ctx)) {
    throw new Error('Insufficient role for survey results');
  }
  return runInTenant(tenantId, async (client) => {
    const surveyRow = await client.query<{ id: string; questions: unknown; response_count: number }>(
      `SELECT id::text AS id, questions, response_count FROM heart_pulse_surveys
       WHERE id = $1::uuid`,
      [surveyId]
    );
    const survey = surveyRow.rows[0];
    if (!survey) return null;

    const questions = (survey.questions as Array<{ id: string }>) ?? [];
    const aggregates: Record<string, { avg: number; min: number; max: number }> = {};

    for (const q of questions) {
      const qId = (typeof q === 'object' && q && 'id' in q) ? (q as { id: string }).id : String(q);
      const aggRow = await client.query<{ avg: string; min: string; max: string }>(
        `SELECT AVG((answers->>$1)::numeric)::text AS avg,
                MIN((answers->>$1)::numeric)::text AS min,
                MAX((answers->>$1)::numeric)::text AS max
         FROM heart_pulse_responses WHERE survey_id = $2::uuid`,
        [qId, surveyId]
      );
      const a = aggRow.rows[0];
      aggregates[qId] = {
        avg: parseFloat(a?.avg ?? '0'),
        min: parseFloat(a?.min ?? '0'),
        max: parseFloat(a?.max ?? '0'),
      };
    }

    return {
      surveyId,
      questionCount: questions.length,
      responseCount: survey.response_count,
      aggregates,
    };
  });
}
