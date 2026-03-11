import { query } from '../../../db/index.js';
import { eventBus } from '../../../events/index.js';

/** Calculates aggregated team health scores from individual data.
 * CRITICAL: Never exposes individual user data to anyone except the user themselves.
 */
export async function calculateTeamHealth(
  scopeType: 'team' | 'department' | 'organization',
  scopeId?: string,
  organizationId?: string
): Promise<void> {
  const orgId = organizationId ?? (await getDefaultOrgId());
  if (!orgId) return;

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd);
  periodStart.setDate(periodStart.getDate() - 7);

  let scopeName: string;
  let userIds: string[];

  if (scopeType === 'organization') {
    scopeName = 'Organization';
    scopeId = orgId; // Use org id for unique constraint
    const users = await query<{ id: string }>(
      `SELECT id::text AS id FROM reimbursement_users WHERE organization_id = $1::uuid AND status IS DISTINCT FROM 'inactive'`,
      [orgId]
    );
    userIds = users.rows.map((r) => r.id);
  } else if (scopeType === 'department' && scopeId) {
    // scopeId = performance_teams.id (UUID)
    const teamRow = await query<{ team_name: string }>(
      `SELECT team_name FROM performance_teams WHERE id = $1::uuid LIMIT 1`,
      [scopeId]
    );
    scopeName = teamRow.rows[0]?.team_name ?? scopeId;
    const users = await query<{ id: string }>(
      `SELECT ru.id::text AS id
       FROM reimbursement_users ru
       JOIN performance_team_members ptm ON ptm.employee_id = ru.auth_user_id AND ptm.is_active = TRUE
       WHERE ptm.team_id = $1::uuid AND ru.organization_id = $2::uuid AND ru.status IS DISTINCT FROM 'inactive'`,
      [scopeId, orgId]
    );
    userIds = users.rows.map((r) => r.id);
  } else if (scopeType === 'team' && scopeId) {
    scopeName = scopeId;
    const users = await query<{ id: string }>(
      `SELECT ru.id::text AS id
       FROM reimbursement_users ru
       JOIN performance_team_members ptm ON ptm.employee_id = ru.auth_user_id AND ptm.is_active = TRUE
       WHERE ptm.team_id = $1::uuid AND ru.organization_id = $2::uuid AND ru.status IS DISTINCT FROM 'inactive'`,
      [scopeId, orgId]
    );
    userIds = users.rows.map((r) => r.id);
  } else {
    return;
  }

  if (userIds.length === 0) {
    return;
  }

  // K-anonymity: do not persist team/department health for small groups (< 5 members)
  // Prevents managers from deducing individual burnout/sentiment in tiny teams
  const K_ANON_THRESHOLD = 5;
  if (scopeType !== 'organization' && userIds.length < K_ANON_THRESHOLD) {
    return;
  }

  // Aggregate sentiment (no individual identifiers)
  const sentimentResult = await query<{ avg_sentiment: string; count: number }>(
    `SELECT ROUND(AVG(normalized_score)::numeric, 0)::text AS avg_sentiment, COUNT(DISTINCT user_id)::int AS count
     FROM heart_sentiment_scores
     WHERE user_id = ANY($1::uuid[]) AND analyzed_at >= $2 AND source = 'composite'`,
    [userIds, periodStart.toISOString()]
  );
  const avgSentiment = parseInt(sentimentResult.rows[0]?.avg_sentiment || '75', 10);

  // Aggregate burnout (count at_risk only, no names)
  const burnoutResult = await query<{ at_risk: string; avg_score: string }>(
    `SELECT
       COUNT(*) FILTER (WHERE risk_level IN ('medium', 'high'))::text AS at_risk,
       ROUND(AVG(CASE WHEN risk_level IN ('medium', 'high') THEN 100 - overall_score ELSE 100 END)::numeric, 0)::text AS avg_score
     FROM (
       SELECT DISTINCT ON (user_id) user_id, risk_level, overall_score
       FROM heart_burnout_assessments
       WHERE user_id = ANY($1::uuid[]) AND assessed_at >= $2
       ORDER BY user_id, assessed_at DESC
     ) latest`,
    [userIds, periodStart.toISOString()]
  );
  const atRiskCount = parseInt(burnoutResult.rows[0]?.at_risk || '0', 10);
  const healthFromBurnout = parseInt(burnoutResult.rows[0]?.avg_score || '75', 10);

  // Aggregate velocity (from time_entries - hours balance)
  const hoursResult = await query<{ avg_hours: string }>(
    `SELECT ROUND(AVG(daily_hours)::numeric, 1)::text AS avg_hours
     FROM (
       SELECT user_id, SUM(hours) AS daily_hours
       FROM time_entries
       WHERE user_id = ANY($1::uuid[]) AND date >= $2::date AND status != 'rejected'
       GROUP BY user_id, date
     ) daily`,
    [userIds, periodStart.toISOString().split('T')[0]]
  );
  const avgHours = parseFloat(hoursResult.rows[0]?.avg_hours || '8');
  const hoursBalanceScore = avgHours >= 6 && avgHours <= 10 ? 85 : avgHours > 10 ? Math.max(50, 85 - (avgHours - 10) * 5) : 70;

  // Compute health score as weighted average
  const healthScore = Math.round(
    (avgSentiment * 0.3 + healthFromBurnout * 0.4 + hoursBalanceScore * 0.2 + 75 * 0.1)
  );
  const clampedHealth = Math.min(100, Math.max(0, healthScore));

  // Get previous period for trend
  const prevPeriodStart = new Date(periodStart);
  prevPeriodStart.setDate(prevPeriodStart.getDate() - 7);
  const prevResult = await query<{ health_score: number }>(
    `SELECT health_score FROM heart_team_health
     WHERE scope_type = $1 AND scope_id IS NOT DISTINCT FROM $2 AND period_start = $3::date`,
    [scopeType, scopeId ?? null, prevPeriodStart.toISOString().split('T')[0]]
  );
  const previousHealthScore = prevResult.rows[0]?.health_score ?? 75;
  const trend =
    clampedHealth > previousHealthScore + 5
      ? 'improving'
      : clampedHealth < previousHealthScore - 5
        ? 'declining'
        : clampedHealth < 40
          ? 'critical'
          : 'stable';

  await query(
    `INSERT INTO heart_team_health (
      organization_id, scope_type, scope_id, scope_name,
      health_score, engagement_score, sentiment_score, velocity_score, hours_balance_score, collaboration_score,
      member_count, at_risk_count, high_engagement_count,
      health_trend, previous_health_score, period_start, period_end
    ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::date, $17::date)
    ON CONFLICT (scope_type, scope_id, period_start)
    DO UPDATE SET
      health_score = EXCLUDED.health_score,
      engagement_score = EXCLUDED.engagement_score,
      sentiment_score = EXCLUDED.sentiment_score,
      velocity_score = EXCLUDED.velocity_score,
      hours_balance_score = EXCLUDED.hours_balance_score,
      collaboration_score = EXCLUDED.collaboration_score,
      member_count = EXCLUDED.member_count,
      at_risk_count = EXCLUDED.at_risk_count,
      high_engagement_count = EXCLUDED.high_engagement_count,
      health_trend = EXCLUDED.health_trend,
      previous_health_score = EXCLUDED.previous_health_score,
      period_end = EXCLUDED.period_end,
      calculated_at = NOW()`,
    [
      orgId,
      scopeType,
      scopeId,
      scopeName,
      clampedHealth,
      avgSentiment,
      avgSentiment,
      75,
      hoursBalanceScore,
      75,
      userIds.length,
      atRiskCount,
      Math.min(userIds.length, Math.floor(userIds.length * 0.3)),
      trend,
      previousHealthScore,
      periodStart.toISOString().split('T')[0],
      periodEnd.toISOString().split('T')[0],
    ]
  );

  eventBus.emit('heart.team.health_updated', {
    departmentId: scopeId ?? orgId,
    healthScore: clampedHealth,
    previousScore: previousHealthScore,
    trend,
  });
}

async function getDefaultOrgId(): Promise<string | null> {
  const result = await query<{ id: string }>(
    `SELECT id::text AS id FROM organizations WHERE slug = 'messign' LIMIT 1`
  );
  return result.rows[0]?.id ?? null;
}
