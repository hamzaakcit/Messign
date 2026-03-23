// ════════════════════════════════════════════════════════════
// CEO Dashboard — Data Aggregation Service
//
// Queries all marketing module tables and computes executive
// metrics for the dashboard. Results are cached in
// dashboard_snapshots for fast loading.
// ════════════════════════════════════════════════════════════

import type { DbClient } from './performanceCollector.js';

// ── Types ──

export interface DashboardSnapshot {
  emailsCreated: number;
  emailsSent: number;
  va2ManifestsGenerated: number;
  topTheme: string | null;
  avgSectionCount: number | null;

  batchJobsCreated: number;
  batchJobsCompleted: number;
  batchJobsFailed: number;
  totalDerivativesGenerated: number;
  channelSuccessRates: Record<string, number>;

  avgOpenRate: number | null;
  avgClickThroughRate: number | null;
  avgConversionRate: number | null;
  topPerformingContentId: string | null;
  topPerformingOpenRate: number | null;
  campaignsWithData: number;

  complianceScanTotal: number;
  compliancePassRate: number | null;
  avgComplianceScore: number | null;
  commonViolations: Array<{ type: string; count: number }>;

  competitorEventsDiscovered: number;
  significantCompetitorMoves: number;
  activeCompetitorsCount: number;
  topCompetitorEventType: string | null;

  contentInDraft: number;
  contentInReview: number;
  contentApproved: number;
  contentPublished: number;

  activeTeamMembers: number;
  contentPerMember: number | null;

  snapshotDate: string;
  generatedAt: string;
  generationDurationMs: number;
}

export interface DashboardTrend {
  date: string;
  emailsSent: number;
  avgOpenRate: number | null;
  batchJobsCompleted: number;
  compliancePassRate: number | null;
  competitorEvents: number;
}

// ── Aggregation ──

export async function generateSnapshot(
  organizationId: string,
  date: string = new Date().toISOString().slice(0, 10),
  lookbackDays: number = 30,
  db: DbClient,
): Promise<DashboardSnapshot> {
  const startTime = Date.now();
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - lookbackDays);
  const since = sinceDate.toISOString();

  const [
    emailMetrics,
    batchMetrics,
    performanceMetrics,
    complianceMetrics,
    competitorMetrics,
    pipelineMetrics,
    teamMetrics,
  ] = await Promise.all([
    aggregateEmailMetrics(organizationId, since, db),
    aggregateBatchMetrics(organizationId, since, db),
    aggregatePerformanceMetrics(organizationId, since, db),
    aggregateComplianceMetrics(organizationId, since, db),
    aggregateCompetitorMetrics(organizationId, since, db),
    aggregatePipelineMetrics(organizationId, db),
    aggregateTeamMetrics(organizationId, since, db),
  ]);

  return {
    ...emailMetrics,
    ...batchMetrics,
    ...performanceMetrics,
    ...complianceMetrics,
    ...competitorMetrics,
    ...pipelineMetrics,
    ...teamMetrics,
    snapshotDate: date,
    generatedAt: new Date().toISOString(),
    generationDurationMs: Date.now() - startTime,
  };
}

export async function storeSnapshot(
  organizationId: string,
  snapshot: DashboardSnapshot,
  periodType: 'daily' | 'weekly' | 'monthly' = 'daily',
  db: DbClient,
): Promise<string> {
  const result = await db.query(
    `INSERT INTO dashboard_snapshots (
      organization_id, snapshot_date, period_type,
      emails_created, emails_sent, va2_manifests_generated,
      top_theme, avg_section_count,
      batch_jobs_created, batch_jobs_completed, batch_jobs_failed,
      total_derivatives_generated, channel_success_rates,
      avg_open_rate, avg_click_through_rate, avg_conversion_rate,
      top_performing_content_id, top_performing_open_rate, campaigns_with_data,
      compliance_scans_total, compliance_pass_rate, avg_compliance_score, common_violations,
      competitor_events_discovered, significant_competitor_moves,
      active_competitors_count, top_competitor_event_type,
      content_in_draft, content_in_review, content_approved, content_published,
      active_team_members, content_per_member,
      generation_duration_ms
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, $18, $19,
      $20, $21, $22, $23, $24, $25, $26, $27,
      $28, $29, $30, $31, $32, $33, $34
    )
    ON CONFLICT (organization_id, snapshot_date, period_type)
    DO UPDATE SET
      emails_created = EXCLUDED.emails_created,
      emails_sent = EXCLUDED.emails_sent,
      va2_manifests_generated = EXCLUDED.va2_manifests_generated,
      top_theme = EXCLUDED.top_theme,
      avg_section_count = EXCLUDED.avg_section_count,
      batch_jobs_created = EXCLUDED.batch_jobs_created,
      batch_jobs_completed = EXCLUDED.batch_jobs_completed,
      batch_jobs_failed = EXCLUDED.batch_jobs_failed,
      total_derivatives_generated = EXCLUDED.total_derivatives_generated,
      channel_success_rates = EXCLUDED.channel_success_rates,
      avg_open_rate = EXCLUDED.avg_open_rate,
      avg_click_through_rate = EXCLUDED.avg_click_through_rate,
      avg_conversion_rate = EXCLUDED.avg_conversion_rate,
      top_performing_content_id = EXCLUDED.top_performing_content_id,
      top_performing_open_rate = EXCLUDED.top_performing_open_rate,
      campaigns_with_data = EXCLUDED.campaigns_with_data,
      compliance_scans_total = EXCLUDED.compliance_scans_total,
      compliance_pass_rate = EXCLUDED.compliance_pass_rate,
      avg_compliance_score = EXCLUDED.avg_compliance_score,
      common_violations = EXCLUDED.common_violations,
      competitor_events_discovered = EXCLUDED.competitor_events_discovered,
      significant_competitor_moves = EXCLUDED.significant_competitor_moves,
      active_competitors_count = EXCLUDED.active_competitors_count,
      top_competitor_event_type = EXCLUDED.top_competitor_event_type,
      content_in_draft = EXCLUDED.content_in_draft,
      content_in_review = EXCLUDED.content_in_review,
      content_approved = EXCLUDED.content_approved,
      content_published = EXCLUDED.content_published,
      active_team_members = EXCLUDED.active_team_members,
      content_per_member = EXCLUDED.content_per_member,
      generation_duration_ms = EXCLUDED.generation_duration_ms,
      generated_at = now()
    RETURNING id`,
    [
      organizationId, snapshot.snapshotDate, periodType,
      snapshot.emailsCreated, snapshot.emailsSent, snapshot.va2ManifestsGenerated,
      snapshot.topTheme, snapshot.avgSectionCount,
      snapshot.batchJobsCreated, snapshot.batchJobsCompleted, snapshot.batchJobsFailed,
      snapshot.totalDerivativesGenerated, JSON.stringify(snapshot.channelSuccessRates),
      snapshot.avgOpenRate, snapshot.avgClickThroughRate, snapshot.avgConversionRate,
      snapshot.topPerformingContentId, snapshot.topPerformingOpenRate, snapshot.campaignsWithData,
      snapshot.complianceScanTotal, snapshot.compliancePassRate, snapshot.avgComplianceScore,
      JSON.stringify(snapshot.commonViolations),
      snapshot.competitorEventsDiscovered, snapshot.significantCompetitorMoves,
      snapshot.activeCompetitorsCount, snapshot.topCompetitorEventType,
      snapshot.contentInDraft, snapshot.contentInReview,
      snapshot.contentApproved, snapshot.contentPublished,
      snapshot.activeTeamMembers, snapshot.contentPerMember,
      snapshot.generationDurationMs,
    ],
  );
  return result.rows[0]?.id as string;
}

export async function getLatestSnapshot(
  organizationId: string,
  db: DbClient,
): Promise<DashboardSnapshot | null> {
  const result = await db.query(
    `SELECT * FROM dashboard_snapshots
     WHERE organization_id = $1
     ORDER BY snapshot_date DESC LIMIT 1`,
    [organizationId],
  );
  if (result.rows.length === 0) return null;
  return rowToSnapshot(result.rows[0] as Record<string, unknown>);
}

export async function getSnapshotTrend(
  organizationId: string,
  days: number = 30,
  db: DbClient,
): Promise<DashboardTrend[]> {
  const result = await db.query(
    `SELECT snapshot_date, emails_sent, avg_open_rate,
            batch_jobs_completed, compliance_pass_rate,
            competitor_events_discovered
     FROM dashboard_snapshots
     WHERE organization_id = $1 AND period_type = 'daily'
     ORDER BY snapshot_date DESC
     LIMIT $2`,
    [organizationId, days],
  );

  return (result.rows as Array<Record<string, unknown>>).map((row) => ({
    date: row.snapshot_date as string,
    emailsSent: (row.emails_sent as number) || 0,
    avgOpenRate: row.avg_open_rate != null ? parseFloat(String(row.avg_open_rate)) : null,
    batchJobsCompleted: (row.batch_jobs_completed as number) || 0,
    compliancePassRate: row.compliance_pass_rate != null ? parseFloat(String(row.compliance_pass_rate)) : null,
    competitorEvents: (row.competitor_events_discovered as number) || 0,
  })).reverse();
}

// ══════════════════════════════════════════════════════════
// Individual Metric Aggregators
// ══════════════════════════════════════════════════════════

type EmailMetrics = Pick<DashboardSnapshot, 'emailsCreated' | 'emailsSent' | 'va2ManifestsGenerated' | 'topTheme' | 'avgSectionCount'>;

async function aggregateEmailMetrics(orgId: string, since: string, db: DbClient): Promise<EmailMetrics> {
  try {
    const result = await db.query(
      `SELECT
         COUNT(*)::integer as emails_created,
         COUNT(*) FILTER (WHERE status = 'published')::integer as emails_sent
       FROM marketing_content
       WHERE organization_id = $1 AND channel = 'email' AND created_at >= $2`,
      [orgId, since],
    );
    const row = (result.rows[0] || {}) as Record<string, unknown>;

    const va2Result = await db.query(
      `SELECT COUNT(*)::integer as count
       FROM marketing_content
       WHERE organization_id = $1 AND channel = 'email' AND created_at >= $2
         AND body_design IS NOT NULL AND body_design::text LIKE '%"version":"2.0"%'`,
      [orgId, since],
    );

    return {
      emailsCreated: (row.emails_created as number) || 0,
      emailsSent: (row.emails_sent as number) || 0,
      va2ManifestsGenerated: ((va2Result.rows[0] as Record<string, unknown>)?.count as number) || 0,
      topTheme: null,
      avgSectionCount: null,
    };
  } catch {
    return { emailsCreated: 0, emailsSent: 0, va2ManifestsGenerated: 0, topTheme: null, avgSectionCount: null };
  }
}

type BatchMetrics = Pick<DashboardSnapshot, 'batchJobsCreated' | 'batchJobsCompleted' | 'batchJobsFailed' | 'totalDerivativesGenerated' | 'channelSuccessRates'>;

async function aggregateBatchMetrics(orgId: string, since: string, db: DbClient): Promise<BatchMetrics> {
  try {
    const result = await db.query(
      `SELECT
         COUNT(*)::integer as total,
         COUNT(*) FILTER (WHERE status = 'completed')::integer as completed,
         COUNT(*) FILTER (WHERE status = 'failed')::integer as failed,
         COALESCE(SUM(completed_channels), 0)::integer as derivatives
       FROM batch_jobs
       WHERE organization_id = $1 AND created_at >= $2`,
      [orgId, since],
    );
    const row = (result.rows[0] || {}) as Record<string, unknown>;

    const channelResult = await db.query(
      `SELECT results FROM batch_jobs
       WHERE organization_id = $1 AND created_at >= $2 AND status IN ('completed', 'partial')`,
      [orgId, since],
    );

    const channelCounts: Record<string, { success: number; total: number }> = {};
    for (const batchRow of channelResult.rows as Array<Record<string, unknown>>) {
      const results = (batchRow.results || []) as Array<{ channel: string; status: string }>;
      for (const r of results) {
        if (!channelCounts[r.channel]) channelCounts[r.channel] = { success: 0, total: 0 };
        channelCounts[r.channel].total++;
        if (r.status === 'completed') channelCounts[r.channel].success++;
      }
    }

    const channelSuccessRates: Record<string, number> = {};
    for (const [channel, counts] of Object.entries(channelCounts)) {
      channelSuccessRates[channel] = counts.total > 0
        ? Math.round((counts.success / counts.total) * 100) / 100
        : 0;
    }

    return {
      batchJobsCreated: (row.total as number) || 0,
      batchJobsCompleted: (row.completed as number) || 0,
      batchJobsFailed: (row.failed as number) || 0,
      totalDerivativesGenerated: (row.derivatives as number) || 0,
      channelSuccessRates,
    };
  } catch {
    return { batchJobsCreated: 0, batchJobsCompleted: 0, batchJobsFailed: 0, totalDerivativesGenerated: 0, channelSuccessRates: {} };
  }
}

type PerformanceMetrics = Pick<DashboardSnapshot, 'avgOpenRate' | 'avgClickThroughRate' | 'avgConversionRate' | 'topPerformingContentId' | 'topPerformingOpenRate' | 'campaignsWithData'>;

async function aggregatePerformanceMetrics(orgId: string, since: string, db: DbClient): Promise<PerformanceMetrics> {
  try {
    const result = await db.query(
      `SELECT
         AVG(open_rate) as avg_open,
         AVG(click_through_rate) as avg_ctr,
         AVG(conversion_rate) as avg_conv,
         COUNT(*)::integer as with_data
       FROM performance_feedback
       WHERE organization_id = $1 AND recorded_at >= $2 AND send_count >= 500`,
      [orgId, since],
    );
    const row = (result.rows[0] || {}) as Record<string, unknown>;

    const topResult = await db.query(
      `SELECT content_id, open_rate
       FROM performance_feedback
       WHERE organization_id = $1 AND recorded_at >= $2 AND send_count >= 500
       ORDER BY open_rate DESC NULLS LAST LIMIT 1`,
      [orgId, since],
    );
    const topRow = (topResult.rows[0] || null) as Record<string, unknown> | null;

    return {
      avgOpenRate: row.avg_open != null ? parseFloat(String(row.avg_open)) : null,
      avgClickThroughRate: row.avg_ctr != null ? parseFloat(String(row.avg_ctr)) : null,
      avgConversionRate: row.avg_conv != null ? parseFloat(String(row.avg_conv)) : null,
      topPerformingContentId: (topRow?.content_id as string) || null,
      topPerformingOpenRate: topRow?.open_rate != null ? parseFloat(String(topRow.open_rate)) : null,
      campaignsWithData: (row.with_data as number) || 0,
    };
  } catch {
    return { avgOpenRate: null, avgClickThroughRate: null, avgConversionRate: null, topPerformingContentId: null, topPerformingOpenRate: null, campaignsWithData: 0 };
  }
}

type ComplianceMetrics = Pick<DashboardSnapshot, 'complianceScanTotal' | 'compliancePassRate' | 'avgComplianceScore' | 'commonViolations'>;

async function aggregateComplianceMetrics(orgId: string, since: string, db: DbClient): Promise<ComplianceMetrics> {
  try {
    const result = await db.query(
      `SELECT
         COUNT(*)::integer as total,
         AVG(CASE WHEN passed THEN 1 ELSE 0 END) as pass_rate,
         AVG(score) as avg_score
       FROM compliance_scans
       WHERE organization_id = $1 AND scanned_at >= $2`,
      [orgId, since],
    );
    const row = (result.rows[0] || {}) as Record<string, unknown>;

    const violationResult = await db.query(
      `SELECT flags FROM compliance_scans
       WHERE organization_id = $1 AND scanned_at >= $2 AND NOT passed`,
      [orgId, since],
    );
    const violationCounts: Record<string, number> = {};
    for (const scanRow of violationResult.rows as Array<Record<string, unknown>>) {
      const flags = (scanRow.flags || []) as Array<{ type: string }>;
      for (const flag of flags) {
        violationCounts[flag.type] = (violationCounts[flag.type] || 0) + 1;
      }
    }
    const commonViolations = Object.entries(violationCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }));

    return {
      complianceScanTotal: (row.total as number) || 0,
      compliancePassRate: row.pass_rate != null ? parseFloat(String(row.pass_rate)) : null,
      avgComplianceScore: row.avg_score != null ? parseFloat(String(row.avg_score)) : null,
      commonViolations,
    };
  } catch {
    return { complianceScanTotal: 0, compliancePassRate: null, avgComplianceScore: null, commonViolations: [] };
  }
}

type CompetitorMetrics = Pick<DashboardSnapshot, 'competitorEventsDiscovered' | 'significantCompetitorMoves' | 'activeCompetitorsCount' | 'topCompetitorEventType'>;

async function aggregateCompetitorMetrics(orgId: string, since: string, db: DbClient): Promise<CompetitorMetrics> {
  try {
    const result = await db.query(
      `SELECT
         COUNT(*)::integer as total_events,
         COUNT(*) FILTER (WHERE significance IN ('high', 'critical'))::integer as significant
       FROM competitor_events
       WHERE organization_id = $1 AND discovered_at >= $2`,
      [orgId, since],
    );
    const row = (result.rows[0] || {}) as Record<string, unknown>;

    const compCount = await db.query(
      `SELECT COUNT(*)::integer as count FROM competitors
       WHERE organization_id = $1 AND active = true`,
      [orgId],
    );

    const typeResult = await db.query(
      `SELECT event_type, COUNT(*)::integer as count
       FROM competitor_events
       WHERE organization_id = $1 AND discovered_at >= $2
       GROUP BY event_type ORDER BY count DESC LIMIT 1`,
      [orgId, since],
    );

    return {
      competitorEventsDiscovered: (row.total_events as number) || 0,
      significantCompetitorMoves: (row.significant as number) || 0,
      activeCompetitorsCount: ((compCount.rows[0] as Record<string, unknown>)?.count as number) || 0,
      topCompetitorEventType: ((typeResult.rows[0] as Record<string, unknown>)?.event_type as string) || null,
    };
  } catch {
    return { competitorEventsDiscovered: 0, significantCompetitorMoves: 0, activeCompetitorsCount: 0, topCompetitorEventType: null };
  }
}

type PipelineMetrics = Pick<DashboardSnapshot, 'contentInDraft' | 'contentInReview' | 'contentApproved' | 'contentPublished'>;

async function aggregatePipelineMetrics(orgId: string, db: DbClient): Promise<PipelineMetrics> {
  try {
    const result = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'draft')::integer as draft,
         COUNT(*) FILTER (WHERE status = 'in_review')::integer as in_review,
         COUNT(*) FILTER (WHERE status = 'approved')::integer as approved,
         COUNT(*) FILTER (WHERE status = 'published')::integer as published
       FROM marketing_content
       WHERE organization_id = $1`,
      [orgId],
    );
    const row = (result.rows[0] || {}) as Record<string, unknown>;
    return {
      contentInDraft: (row.draft as number) || 0,
      contentInReview: (row.in_review as number) || 0,
      contentApproved: (row.approved as number) || 0,
      contentPublished: (row.published as number) || 0,
    };
  } catch {
    return { contentInDraft: 0, contentInReview: 0, contentApproved: 0, contentPublished: 0 };
  }
}

type TeamMetrics = Pick<DashboardSnapshot, 'activeTeamMembers' | 'contentPerMember'>;

async function aggregateTeamMetrics(orgId: string, since: string, db: DbClient): Promise<TeamMetrics> {
  try {
    const result = await db.query(
      `SELECT COUNT(DISTINCT author_id)::integer as members
       FROM marketing_content
       WHERE organization_id = $1 AND created_at >= $2 AND author_id IS NOT NULL`,
      [orgId, since],
    );
    const members = ((result.rows[0] as Record<string, unknown>)?.members as number) || 0;

    const contentResult = await db.query(
      `SELECT COUNT(*)::integer as count FROM marketing_content
       WHERE organization_id = $1 AND created_at >= $2`,
      [orgId, since],
    );
    const contentCount = ((contentResult.rows[0] as Record<string, unknown>)?.count as number) || 0;

    return {
      activeTeamMembers: members,
      contentPerMember: members > 0 ? Math.round((contentCount / members) * 100) / 100 : null,
    };
  } catch {
    return { activeTeamMembers: 0, contentPerMember: null };
  }
}

// ── Helpers ──

export function rowToSnapshot(row: Record<string, unknown>): DashboardSnapshot {
  return {
    emailsCreated: (row.emails_created as number) || 0,
    emailsSent: (row.emails_sent as number) || 0,
    va2ManifestsGenerated: (row.va2_manifests_generated as number) || 0,
    topTheme: (row.top_theme as string) || null,
    avgSectionCount: row.avg_section_count != null ? parseFloat(String(row.avg_section_count)) : null,
    batchJobsCreated: (row.batch_jobs_created as number) || 0,
    batchJobsCompleted: (row.batch_jobs_completed as number) || 0,
    batchJobsFailed: (row.batch_jobs_failed as number) || 0,
    totalDerivativesGenerated: (row.total_derivatives_generated as number) || 0,
    channelSuccessRates: (row.channel_success_rates || {}) as Record<string, number>,
    avgOpenRate: row.avg_open_rate != null ? parseFloat(String(row.avg_open_rate)) : null,
    avgClickThroughRate: row.avg_click_through_rate != null ? parseFloat(String(row.avg_click_through_rate)) : null,
    avgConversionRate: row.avg_conversion_rate != null ? parseFloat(String(row.avg_conversion_rate)) : null,
    topPerformingContentId: (row.top_performing_content_id as string) || null,
    topPerformingOpenRate: row.top_performing_open_rate != null ? parseFloat(String(row.top_performing_open_rate)) : null,
    campaignsWithData: (row.campaigns_with_data as number) || 0,
    complianceScanTotal: (row.compliance_scans_total as number) || 0,
    compliancePassRate: row.compliance_pass_rate != null ? parseFloat(String(row.compliance_pass_rate)) : null,
    avgComplianceScore: row.avg_compliance_score != null ? parseFloat(String(row.avg_compliance_score)) : null,
    commonViolations: (row.common_violations || []) as Array<{ type: string; count: number }>,
    competitorEventsDiscovered: (row.competitor_events_discovered as number) || 0,
    significantCompetitorMoves: (row.significant_competitor_moves as number) || 0,
    activeCompetitorsCount: (row.active_competitors_count as number) || 0,
    topCompetitorEventType: (row.top_competitor_event_type as string) || null,
    contentInDraft: (row.content_in_draft as number) || 0,
    contentInReview: (row.content_in_review as number) || 0,
    contentApproved: (row.content_approved as number) || 0,
    contentPublished: (row.content_published as number) || 0,
    activeTeamMembers: (row.active_team_members as number) || 0,
    contentPerMember: row.content_per_member != null ? parseFloat(String(row.content_per_member)) : null,
    snapshotDate: row.snapshot_date as string,
    generatedAt: row.generated_at as string,
    generationDurationMs: (row.generation_duration_ms as number) || 0,
  };
}

// ── MP Trigger Types ──

export const MP_TRIGGER_TYPES = [
  'high_open_rate',
  'high_ctr',
  'high_conversion',
  'perfect_compliance',
  'batch_completion',
  'top_performer',
  'competitor_insight',
  'streak_bonus',
] as const;

export type MpTriggerType = (typeof MP_TRIGGER_TYPES)[number];
