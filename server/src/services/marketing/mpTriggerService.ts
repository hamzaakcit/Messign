import type { DbClient } from './performanceCollector.js';

// ── Types ──

export interface MpTrigger {
  id: string;
  organization_id: string;
  user_id: string;
  trigger_type: string;
  content_id: string | null;
  batch_job_id: string | null;
  points_earned: number;
  multiplier: number;
  details: Record<string, unknown>;
  status: string;
  created_at: string;
}

// ── Thresholds & Points ──

export const MP_THRESHOLDS = {
  high_open_rate: 0.30,
  high_ctr: 0.05,
  high_conversion: 0.02,
} as const;

export const MP_POINTS: Record<string, number> = {
  high_open_rate: 50,
  high_ctr: 75,
  high_conversion: 100,
  perfect_compliance: 30,
  batch_completion: 40,
  streak_bonus: 50,
};

// ── Evaluation Functions ──

export async function evaluatePerformanceTriggers(
  organizationId: string,
  userId: string,
  contentId: string,
  metrics: { openRate?: number; clickThroughRate?: number; conversionRate?: number },
  db: DbClient,
): Promise<MpTrigger[]> {
  const triggered: MpTrigger[] = [];

  const checks: Array<{ type: string; value: number | undefined; threshold: number }> = [
    { type: 'high_open_rate', value: metrics.openRate, threshold: MP_THRESHOLDS.high_open_rate },
    { type: 'high_ctr', value: metrics.clickThroughRate, threshold: MP_THRESHOLDS.high_ctr },
    { type: 'high_conversion', value: metrics.conversionRate, threshold: MP_THRESHOLDS.high_conversion },
  ];

  for (const check of checks) {
    if (check.value != null && check.value > check.threshold) {
      const exists = await hasTrigger(organizationId, check.type, contentId, null, db);
      if (exists) continue;

      const trigger = await createTrigger(organizationId, userId, {
        triggerType: check.type,
        contentId,
        pointsEarned: MP_POINTS[check.type],
        details: { [check.type.replace('high_', '')]: check.value, threshold: check.threshold },
      }, db);
      triggered.push(trigger);
    }
  }

  return triggered;
}

export async function evaluateComplianceTriggers(
  organizationId: string,
  userId: string,
  contentId: string,
  complianceScore: number,
  db: DbClient,
): Promise<MpTrigger | null> {
  if (complianceScore !== 100) return null;

  const exists = await hasTrigger(organizationId, 'perfect_compliance', contentId, null, db);
  if (exists) return null;

  return createTrigger(organizationId, userId, {
    triggerType: 'perfect_compliance',
    contentId,
    pointsEarned: MP_POINTS.perfect_compliance,
    details: { score: 100 },
  }, db);
}

export async function evaluateBatchTriggers(
  organizationId: string,
  userId: string,
  batchJobId: string,
  completedChannels: number,
  totalChannels: number,
  db: DbClient,
): Promise<MpTrigger | null> {
  if (completedChannels !== totalChannels || totalChannels < 5) return null;

  const exists = await hasTrigger(organizationId, 'batch_completion', null, batchJobId, db);
  if (exists) return null;

  return createTrigger(organizationId, userId, {
    triggerType: 'batch_completion',
    batchJobId,
    pointsEarned: MP_POINTS.batch_completion,
    details: { completed_channels: completedChannels, total_channels: totalChannels },
  }, db);
}

export async function evaluateStreakBonus(
  organizationId: string,
  userId: string,
  db: DbClient,
): Promise<MpTrigger | null> {
  const result = await db.query(
    `SELECT id FROM mp_marketing_triggers
     WHERE organization_id = $1 AND user_id = $2 AND trigger_type = 'high_open_rate'
     ORDER BY created_at DESC LIMIT 10`,
    [organizationId, userId],
  );

  const streakLength = result.rows.length;
  if (streakLength < 3) return null;

  const multiplier = streakLength >= 5 ? 2.0 : 1.5;
  const basePoints = MP_POINTS.streak_bonus;

  const existingStreak = await db.query(
    `SELECT id FROM mp_marketing_triggers
     WHERE organization_id = $1 AND user_id = $2 AND trigger_type = 'streak_bonus'
       AND multiplier = $3
     ORDER BY created_at DESC LIMIT 1`,
    [organizationId, userId, multiplier],
  );

  if (existingStreak.rows.length > 0) return null;

  return createTrigger(organizationId, userId, {
    triggerType: 'streak_bonus',
    pointsEarned: basePoints,
    multiplier,
    details: { streak_length: streakLength, streak_type: 'high_open_rate' },
  }, db);
}

// ── Query Functions ──

export async function getUserTriggerSummary(
  organizationId: string,
  userId: string,
  db: DbClient,
): Promise<{ totalPoints: number; triggerCount: number; pendingPoints: number; recentTriggers: MpTrigger[] }> {
  const agg = await db.query(
    `SELECT
       COALESCE(SUM(points_earned * multiplier), 0)::integer AS total_points,
       COUNT(*)::integer AS trigger_count,
       COALESCE(SUM(CASE WHEN status = 'pending' THEN points_earned * multiplier ELSE 0 END), 0)::integer AS pending_points
     FROM mp_marketing_triggers
     WHERE organization_id = $1 AND user_id = $2`,
    [organizationId, userId],
  );
  const row = (agg.rows[0] || {}) as Record<string, unknown>;

  const recent = await db.query(
    `SELECT * FROM mp_marketing_triggers
     WHERE organization_id = $1 AND user_id = $2
     ORDER BY created_at DESC LIMIT 10`,
    [organizationId, userId],
  );

  return {
    totalPoints: (row.total_points as number) || 0,
    triggerCount: (row.trigger_count as number) || 0,
    pendingPoints: (row.pending_points as number) || 0,
    recentTriggers: (recent.rows as Array<Record<string, unknown>>).map(rowToTrigger),
  };
}

export async function getLeaderboard(
  organizationId: string,
  since: string,
  limit: number,
  db: DbClient,
): Promise<Array<{ userId: string; totalPoints: number; triggerCount: number }>> {
  const result = await db.query(
    `SELECT user_id,
            COALESCE(SUM(points_earned * multiplier), 0)::integer AS total_points,
            COUNT(*)::integer AS trigger_count
     FROM mp_marketing_triggers
     WHERE organization_id = $1 AND created_at >= $2
     GROUP BY user_id
     ORDER BY total_points DESC
     LIMIT $3`,
    [organizationId, since, limit],
  );

  return (result.rows as Array<Record<string, unknown>>).map((r) => ({
    userId: r.user_id as string,
    totalPoints: (r.total_points as number) || 0,
    triggerCount: (r.trigger_count as number) || 0,
  }));
}

// ── Helpers ──

async function hasTrigger(
  organizationId: string,
  triggerType: string,
  contentId: string | null,
  batchJobId: string | null,
  db: DbClient,
): Promise<boolean> {
  let sql = `SELECT 1 FROM mp_marketing_triggers WHERE organization_id = $1 AND trigger_type = $2`;
  const params: unknown[] = [organizationId, triggerType];

  if (contentId) {
    params.push(contentId);
    sql += ` AND content_id = $${params.length}`;
  }
  if (batchJobId) {
    params.push(batchJobId);
    sql += ` AND batch_job_id = $${params.length}`;
  }

  sql += ' LIMIT 1';
  const result = await db.query(sql, params);
  return result.rows.length > 0;
}

async function createTrigger(
  organizationId: string,
  userId: string,
  opts: {
    triggerType: string;
    contentId?: string;
    batchJobId?: string;
    pointsEarned: number;
    multiplier?: number;
    details?: Record<string, unknown>;
  },
  db: DbClient,
): Promise<MpTrigger> {
  const result = await db.query(
    `INSERT INTO mp_marketing_triggers (
       organization_id, user_id, trigger_type,
       content_id, batch_job_id,
       points_earned, multiplier, details
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      organizationId,
      userId,
      opts.triggerType,
      opts.contentId ?? null,
      opts.batchJobId ?? null,
      opts.pointsEarned,
      opts.multiplier ?? 1.0,
      JSON.stringify(opts.details ?? {}),
    ],
  );
  return rowToTrigger(result.rows[0] as Record<string, unknown>);
}

function rowToTrigger(row: Record<string, unknown>): MpTrigger {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    user_id: row.user_id as string,
    trigger_type: row.trigger_type as string,
    content_id: (row.content_id as string) || null,
    batch_job_id: (row.batch_job_id as string) || null,
    points_earned: row.points_earned as number,
    multiplier: row.multiplier ? parseFloat(String(row.multiplier)) : 1.0,
    details: (row.details || {}) as Record<string, unknown>,
    status: (row.status as string) || 'pending',
    created_at: row.created_at as string,
  };
}
