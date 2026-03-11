import { query } from '../../../db/index.js';
import { eventBus } from '../../../events/index.js';
import * as doraInsights from '../../../dal/doraInsights.js';
import { getWeightsForRole } from '../../../config/burnoutWeights.js';

interface BurnoutSignals {
  hoursCreep: { score: number; weeklyAvg: number; baselineAvg: number; percentChange: number };
  afterHours: { score: number; afterHoursPercent: number; threshold: number };
  responseTime: { score: number; currentAvg: number; baselineAvg: number; percentChange: number };
  velocityDecline: { score: number; currentRate: number; baselineRate: number; percentChange: number };
  sentimentShift: { score: number; currentScore: number; baselineScore: number; trend: string };
  ptoAvoidance: { score: number; daysSincePto: number; teamAvgDays: number };
}

// ── Main assessment function (called per user) ──
export async function assessBurnoutRisk(userId: string): Promise<void> {
  const signals = await gatherSignals(userId);
  const roleOrDept = await getUserRoleOrDepartment(userId);
  const overallScore = calculateOverallScore(signals, roleOrDept);
  const riskLevel = scoreToRiskLevel(overallScore);

  // Get previous assessment for comparison
  const prev = await query<{ risk_level: string }>(
    'SELECT risk_level FROM heart_burnout_assessments WHERE user_id = $1::uuid ORDER BY assessed_at DESC LIMIT 1',
    [userId]
  );
  const previousRiskLevel = prev.rows[0]?.risk_level || 'none';

  // Store assessment
  await query(
    `INSERT INTO heart_burnout_assessments (
      user_id, risk_level, overall_score, signals,
      hours_creep_score, after_hours_score, response_time_score,
      velocity_decline_score, sentiment_shift_score, pto_avoidance_score,
      weekly_hours_avg, after_hours_percent, response_time_change_percent,
      velocity_change_percent, days_since_pto, sentiment_trend,
      previous_risk_level
    ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      userId,
      riskLevel,
      overallScore,
      JSON.stringify(signals),
      signals.hoursCreep.score,
      signals.afterHours.score,
      signals.responseTime.score,
      signals.velocityDecline.score,
      signals.sentimentShift.score,
      signals.ptoAvoidance.score,
      signals.hoursCreep.weeklyAvg,
      signals.afterHours.afterHoursPercent,
      signals.responseTime.percentChange,
      signals.velocityDecline.percentChange,
      signals.ptoAvoidance.daysSincePto,
      signals.sentimentShift.trend,
      previousRiskLevel,
    ]
  );

  // Emit event if risk is medium or above
  if (riskLevel !== 'none' && riskLevel !== 'low') {
    const activeSignals = Object.entries(signals)
      .filter(([, v]) => v.score >= 50)
      .map(([k]) => k);

    eventBus.emit('heart.burnout.risk_detected', {
      userId,
      riskLevel: riskLevel as 'low' | 'medium' | 'high',
      signals: activeSignals,
      confidenceScore: overallScore,
    });
  }

  // If risk improved from medium/high to low/none, emit cleared
  if (['medium', 'high'].includes(previousRiskLevel) && ['none', 'low'].includes(riskLevel)) {
    eventBus.emit('heart.burnout.risk_cleared', { userId, previousRiskLevel });
  }

  // Take action based on risk level
  await handleRiskActions(userId, riskLevel, signals, previousRiskLevel);
}

// ── Signal gathering functions ──
async function gatherSignals(userId: string): Promise<BurnoutSignals> {
  const [hours, afterHours, responseTime, velocity, sentiment, pto] = await Promise.all([
    measureHoursCreep(userId),
    measureAfterHoursActivity(userId),
    measureResponseTimeChange(userId),
    measureVelocityDecline(userId),
    measureSentimentShift(userId),
    measurePTOAvoidance(userId),
  ]);
  return {
    hoursCreep: hours,
    afterHours,
    responseTime,
    velocityDecline: velocity,
    sentimentShift: sentiment,
    ptoAvoidance: pto,
  };
}

async function measureHoursCreep(userId: string) {
  // Compare last 2 weeks avg hours vs 4-week rolling baseline
  const recent = await query<{ weekly_avg: string }>(
    `SELECT COALESCE(SUM(hours), 0)::numeric / GREATEST(COUNT(DISTINCT date)::numeric, 1) * 5 AS weekly_avg
     FROM time_entries WHERE user_id = $1::uuid AND date >= CURRENT_DATE - INTERVAL '14 days'
       AND status != 'rejected'`,
    [userId]
  );
  const baseline = await query<{ weekly_avg: string }>(
    `SELECT COALESCE(SUM(hours), 0)::numeric / GREATEST(COUNT(DISTINCT date)::numeric, 1) * 5 AS weekly_avg
     FROM time_entries WHERE user_id = $1::uuid
       AND date >= CURRENT_DATE - INTERVAL '42 days' AND date < CURRENT_DATE - INTERVAL '14 days'
       AND status != 'rejected'`,
    [userId]
  );
  const weeklyAvg = parseFloat(recent.rows[0]?.weekly_avg || '0');
  const baselineAvg = parseFloat(baseline.rows[0]?.weekly_avg || '40');
  const percentChange = baselineAvg > 0 ? ((weeklyAvg - baselineAvg) / baselineAvg) * 100 : 0;
  // Score: 0 if no creep, 100 if >25% sustained increase
  const score = Math.min(100, Math.max(0, percentChange * 4));
  return { score, weeklyAvg, baselineAvg, percentChange };
}

async function measureAfterHoursActivity(userId: string) {
  // Resolve reimbursement_user id to auth_user_id for messages table
  const userRow = await query<{ auth_user_id: string | null }>(
    'SELECT auth_user_id FROM reimbursement_users WHERE id = $1::uuid LIMIT 1',
    [userId]
  );
  const authUserId = userRow.rows[0]?.auth_user_id ?? userId;

  const total = await query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM messages WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '14 days'`,
    [authUserId]
  );
  const afterHrs = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM messages WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '14 days'
     AND (EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') < 9 OR EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') >= 18)`,
    [authUserId]
  );
  const totalCount = parseInt(total.rows[0]?.total || '1', 10);
  const afterCount = parseInt(afterHrs.rows[0]?.count || '0', 10);
  const afterHoursPercent = (afterCount / Math.max(1, totalCount)) * 100;
  const threshold = 30;
  const score = Math.min(100, Math.max(0, (afterHoursPercent / threshold) * 100));
  return { score, afterHoursPercent, threshold };
}

async function measureResponseTimeChange(_userId: string) {
  // Simplified: use message gap analysis from chat
  // For now, return a baseline score
  return { score: 0, currentAvg: 0, baselineAvg: 0, percentChange: 0 };
}

async function measureVelocityDecline(userId: string) {
  // Resolve to auth_user_id for tasks.assignees (JSONB array of auth_user_ids)
  const userRow = await query<{ auth_user_id: string | null }>(
    'SELECT auth_user_id FROM reimbursement_users WHERE id = $1::uuid LIMIT 1',
    [userId]
  );
  const authUserId = userRow.rows[0]?.auth_user_id ?? userId;

  // Compare task completion rate last 2 weeks vs previous 4 weeks
  const assigneesJson = JSON.stringify([authUserId]);
  const recent = await query<{ completed: string; total: string }>(
    `SELECT
       COUNT(*) FILTER (WHERE status IN ('completed', 'done'))::text AS completed,
       COUNT(*)::text AS total
     FROM tasks
     WHERE assignees @> $1::jsonb
       AND (completed_at >= NOW() - INTERVAL '14 days' OR created_at >= NOW() - INTERVAL '14 days')`,
    [assigneesJson]
  );
  const baseline = await query<{ completed: string; total: string }>(
    `SELECT
       COUNT(*) FILTER (WHERE status IN ('completed', 'done') AND completed_at >= NOW() - INTERVAL '42 days' AND completed_at < NOW() - INTERVAL '14 days')::text AS completed,
       COUNT(*)::text AS total
     FROM tasks
     WHERE assignees @> $1::jsonb
       AND (completed_at >= NOW() - INTERVAL '42 days' AND completed_at < NOW() - INTERVAL '14 days'
            OR created_at >= NOW() - INTERVAL '42 days' AND created_at < NOW() - INTERVAL '14 days')`,
    [assigneesJson]
  );
  const recentTotal = parseInt(recent.rows[0]?.total || '0', 10);
  const recentCompleted = parseInt(recent.rows[0]?.completed || '0', 10);
  const baselineTotal = parseInt(baseline.rows[0]?.total || '0', 10);
  const baselineCompleted = parseInt(baseline.rows[0]?.completed || '0', 10);
  const recentRate = recentTotal > 0 ? (recentCompleted / recentTotal) * 100 : 100;
  const baselineRate = baselineTotal > 0 ? (baselineCompleted / baselineTotal) * 100 : 100;
  const percentChange = baselineRate > 0 ? ((recentRate - baselineRate) / baselineRate) * 100 : 0;
  // Negative change = decline = higher risk
  const score = Math.min(100, Math.max(0, Math.abs(Math.min(0, percentChange)) * 3));
  return { score, currentRate: recentRate, baselineRate, percentChange };
}

async function measureSentimentShift(userId: string) {
  const recent = await query<{ avg: string }>(
    `SELECT AVG(normalized_score)::text AS avg FROM heart_sentiment_scores
     WHERE user_id = $1::uuid AND analyzed_at >= NOW() - INTERVAL '7 days'`,
    [userId]
  );
  const baseline = await query<{ avg: string }>(
    `SELECT AVG(normalized_score)::text AS avg FROM heart_sentiment_scores
     WHERE user_id = $1::uuid AND analyzed_at >= NOW() - INTERVAL '30 days' AND analyzed_at < NOW() - INTERVAL '7 days'`,
    [userId]
  );
  const currentScore = parseFloat(recent.rows[0]?.avg || '50');
  const baselineScore = parseFloat(baseline.rows[0]?.avg || '50');
  const shift = baselineScore - currentScore; // positive shift = declining sentiment
  const trend = shift > 5 ? 'declining' : shift < -5 ? 'improving' : 'stable';
  const score = Math.min(100, Math.max(0, shift * 5));
  return { score, currentScore, baselineScore, trend };
}

async function measurePTOAvoidance(_userId: string) {
  // Simplified — would need a leave/PTO table in production
  const daysSincePto = 30;
  const teamAvgDays = 25;
  const score = Math.min(100, Math.max(0, ((daysSincePto - teamAvgDays) / teamAvgDays) * 100));
  return { score, daysSincePto, teamAvgDays };
}

// ── Score calculation (uses configurable weights per role/department) ──
function calculateOverallScore(signals: BurnoutSignals, roleOrDept?: string | null): number {
  const weights = getWeightsForRole(roleOrDept);
  return (Object.keys(weights) as Array<keyof BurnoutSignals>).reduce((sum, key) => {
    return sum + (signals[key].score * weights[key as keyof typeof weights]);
  }, 0);
}

async function getUserRoleOrDepartment(userId: string): Promise<string | null> {
  const result = await query<{ team_type: string; team_name: string }>(
    `SELECT pt.team_type, pt.team_name
     FROM performance_team_members ptm
     JOIN performance_teams pt ON pt.id = ptm.team_id
     WHERE ptm.employee_id = (SELECT auth_user_id FROM reimbursement_users WHERE id = $1::uuid LIMIT 1)
       AND ptm.is_active = TRUE
     LIMIT 1`,
    [userId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return row.team_type || row.team_name || null;
}

function scoreToRiskLevel(score: number): 'none' | 'low' | 'medium' | 'high' {
  if (score >= 70) return 'high';
  if (score >= 45) return 'medium';
  if (score >= 20) return 'low';
  return 'none';
}

// ── Action handler ──
async function handleRiskActions(
  userId: string,
  riskLevel: string,
  signals: BurnoutSignals,
  _previousRiskLevel: string
): Promise<void> {
  if (riskLevel === 'none' || riskLevel === 'low') return;

  const topSignals = Object.entries(signals)
    .filter(([, v]) => v.score >= 50)
    .sort((a, b) => b[1].score - a[1].score)
    .map(([k]) => k);

  // Get organization for createInsight
  const orgRow = await query<{ organization_id: string }>(
    'SELECT organization_id::text AS organization_id FROM reimbursement_users WHERE id = $1::uuid LIMIT 1',
    [userId]
  );
  const organizationId = orgRow.rows[0]?.organization_id;

  if (riskLevel === 'medium') {
    await doraInsights.createInsight({
      organizationId,
      module: 'heart',
      severity: 'info',
      title: 'Wellness check-in',
      message: generatePrivateNudge(topSignals),
      targetUserId: userId,
      metadata: { type: 'wellness_nudge', riskLevel, signals: topSignals },
    });
    eventBus.emit('heart.wellness.check_sent', {
      userId,
      triggerSignal: topSignals[0] ?? 'general',
      checkType: 'private_nudge',
    });
  }

  if (riskLevel === 'high') {
    await doraInsights.createInsight({
      organizationId,
      module: 'heart',
      severity: 'warning',
      title: 'Take care of yourself',
      message: generatePrivateNudge(topSignals),
      targetUserId: userId,
      metadata: { type: 'wellness_nudge', riskLevel, signals: topSignals },
    });

    const managerId = await getManagerId(userId);
    if (managerId) {
      const teamSize = await getManagerTeamSize(managerId);
      const MIN_TEAM_FOR_ALERT = 5;
      if (teamSize >= MIN_TEAM_FOR_ALERT) {
        await doraInsights.createInsight({
          organizationId,
          module: 'heart',
          severity: 'warning',
          title: 'Team member wellness alert',
          message:
            'One of your team members is showing signs of elevated stress. Consider scheduling a casual 1:1 check-in with your team.',
          targetUserId: String(managerId),
          metadata: { type: 'manager_wellness_alert', anonymous: true },
        });
        eventBus.emit('heart.wellness.check_sent', {
          userId,
          triggerSignal: topSignals[0] ?? 'general',
          checkType: 'manager_alert',
        });
      }
    }
  }
}

function generatePrivateNudge(signals: string[]): string {
  const nudges: Record<string, string> = {
    hoursCreep:
      'Your working hours have been trending up recently. Would it help to review your task load and see what could be delegated?',
    afterHours:
      "You've been active outside business hours more than usual. Setting boundaries can help maintain your energy.",
    responseTime:
      "Your response times have increased — that's often a sign of being stretched thin. It's okay to prioritize.",
    velocityDecline:
      'Your task completion pace has slowed down. This could be a sign of too many competing priorities. Want me to help prioritize?',
    sentimentShift:
      "Your communication tone has shifted recently. Everything okay? Sometimes talking to a trusted colleague helps.",
    ptoAvoidance: "You haven't taken time off in a while. Rest is important for sustained performance.",
  };
  const primary = nudges[signals[0] ?? ''] ?? 'Dora noticed some changes in your work patterns. Remember to take care of yourself.';
  return primary;
}

async function getManagerId(userId: string): Promise<string | null> {
  const result = await query<{ manager_id: string }>(
    'SELECT manager_id::text AS manager_id FROM reimbursement_users WHERE id = $1::uuid',
    [userId]
  );
  return result.rows[0]?.manager_id ?? null;
}

async function getManagerTeamSize(managerId: string): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM reimbursement_users WHERE manager_id = $1::uuid AND status IS DISTINCT FROM 'inactive'`,
    [managerId]
  );
  return parseInt(result.rows[0]?.count ?? '0', 10);
}
