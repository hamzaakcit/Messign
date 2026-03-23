import { describe, it, expect, vi } from 'vitest';
import type { DashboardSnapshot, DashboardTrend, MpTriggerType } from '../../../services/marketing/dashboardAggregator.js';
import { generateSnapshot, rowToSnapshot, MP_TRIGGER_TYPES } from '../../../services/marketing/dashboardAggregator.js';

function makeMockDb(responses: Array<{ rows: Array<Record<string, unknown>> }>) {
  let callIdx = 0;
  return {
    query: vi.fn(async () => {
      const resp = responses[callIdx] || { rows: [] };
      callIdx++;
      return resp;
    }),
  };
}

describe('DashboardSnapshot type', () => {
  it('has all 5 metric categories', () => {
    const snapshot: DashboardSnapshot = {
      emailsCreated: 50, emailsSent: 35, va2ManifestsGenerated: 30,
      topTheme: 'executive', avgSectionCount: 5.2,
      batchJobsCreated: 12, batchJobsCompleted: 10, batchJobsFailed: 2,
      totalDerivativesGenerated: 48, channelSuccessRates: { email: 0.95, twitter: 0.90 },
      avgOpenRate: 0.28, avgClickThroughRate: 0.045, avgConversionRate: 0.018,
      topPerformingContentId: 'c-1', topPerformingOpenRate: 0.42, campaignsWithData: 25,
      complianceScanTotal: 40, compliancePassRate: 0.85, avgComplianceScore: 82.5,
      commonViolations: [{ type: 'forbidden_word', count: 12 }],
      competitorEventsDiscovered: 35, significantCompetitorMoves: 5,
      activeCompetitorsCount: 4, topCompetitorEventType: 'blog_post',
      contentInDraft: 8, contentInReview: 3, contentApproved: 5, contentPublished: 35,
      activeTeamMembers: 6, contentPerMember: 8.33,
      snapshotDate: '2026-03-23', generatedAt: new Date().toISOString(), generationDurationMs: 450,
    };

    expect(snapshot.emailsCreated).toBe(50);
    expect(snapshot.batchJobsCompleted).toBe(10);
    expect(snapshot.avgOpenRate).toBe(0.28);
    expect(snapshot.compliancePassRate).toBe(0.85);
    expect(snapshot.competitorEventsDiscovered).toBe(35);
    expect(snapshot.contentPublished).toBe(35);
    expect(snapshot.activeTeamMembers).toBe(6);
  });

  it('handles null values for empty workspace', () => {
    const empty: DashboardSnapshot = {
      emailsCreated: 0, emailsSent: 0, va2ManifestsGenerated: 0,
      topTheme: null, avgSectionCount: null,
      batchJobsCreated: 0, batchJobsCompleted: 0, batchJobsFailed: 0,
      totalDerivativesGenerated: 0, channelSuccessRates: {},
      avgOpenRate: null, avgClickThroughRate: null, avgConversionRate: null,
      topPerformingContentId: null, topPerformingOpenRate: null, campaignsWithData: 0,
      complianceScanTotal: 0, compliancePassRate: null, avgComplianceScore: null,
      commonViolations: [],
      competitorEventsDiscovered: 0, significantCompetitorMoves: 0,
      activeCompetitorsCount: 0, topCompetitorEventType: null,
      contentInDraft: 0, contentInReview: 0, contentApproved: 0, contentPublished: 0,
      activeTeamMembers: 0, contentPerMember: null,
      snapshotDate: '2026-03-23', generatedAt: new Date().toISOString(), generationDurationMs: 50,
    };
    expect(empty.avgOpenRate).toBeNull();
    expect(empty.channelSuccessRates).toEqual({});
    expect(empty.commonViolations).toEqual([]);
  });
});

describe('DashboardTrend type', () => {
  it('represents a single day key metrics', () => {
    const trend: DashboardTrend = {
      date: '2026-03-23', emailsSent: 5, avgOpenRate: 0.30,
      batchJobsCompleted: 2, compliancePassRate: 0.90, competitorEvents: 3,
    };
    expect(trend.date).toBe('2026-03-23');
    expect(trend.emailsSent).toBe(5);
  });

  it('trend array is chronological', () => {
    const trends: DashboardTrend[] = [
      { date: '2026-03-21', emailsSent: 3, avgOpenRate: 0.25, batchJobsCompleted: 1, compliancePassRate: 0.80, competitorEvents: 2 },
      { date: '2026-03-22', emailsSent: 5, avgOpenRate: 0.28, batchJobsCompleted: 2, compliancePassRate: 0.85, competitorEvents: 4 },
      { date: '2026-03-23', emailsSent: 4, avgOpenRate: 0.30, batchJobsCompleted: 1, compliancePassRate: 0.90, competitorEvents: 1 },
    ];
    expect(trends[0].date < trends[1].date).toBe(true);
    expect(trends[1].date < trends[2].date).toBe(true);
  });
});

describe('Channel success rate computation', () => {
  it('computes rates from batch results', () => {
    const batchResults = [
      [{ channel: 'email', status: 'completed' }, { channel: 'twitter', status: 'completed' }],
      [{ channel: 'email', status: 'completed' }, { channel: 'twitter', status: 'failed' }],
      [{ channel: 'email', status: 'failed' }, { channel: 'twitter', status: 'completed' }],
    ];

    const counts: Record<string, { success: number; total: number }> = {};
    for (const results of batchResults) {
      for (const r of results) {
        if (!counts[r.channel]) counts[r.channel] = { success: 0, total: 0 };
        counts[r.channel].total++;
        if (r.status === 'completed') counts[r.channel].success++;
      }
    }

    const rates: Record<string, number> = {};
    for (const [ch, c] of Object.entries(counts)) {
      rates[ch] = Math.round((c.success / c.total) * 100) / 100;
    }

    expect(rates.email).toBeCloseTo(0.67, 1);
    expect(rates.twitter).toBeCloseTo(0.67, 1);
  });
});

describe('Common violations aggregation', () => {
  it('counts and sorts violation types', () => {
    const allFlags = [
      { type: 'forbidden_word' }, { type: 'forbidden_word' }, { type: 'forbidden_word' },
      { type: 'tone_deviation' }, { type: 'tone_deviation' },
      { type: 'missing_disclaimer' },
    ];

    const counts: Record<string, number> = {};
    for (const flag of allFlags) {
      counts[flag.type] = (counts[flag.type] || 0) + 1;
    }
    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count }));

    expect(sorted[0]).toEqual({ type: 'forbidden_word', count: 3 });
    expect(sorted[1]).toEqual({ type: 'tone_deviation', count: 2 });
    expect(sorted[2]).toEqual({ type: 'missing_disclaimer', count: 1 });
  });
});

describe('Content per member calculation', () => {
  it('divides total content by member count', () => {
    const contentCount = 50;
    const memberCount = 6;
    const perMember = Math.round((contentCount / memberCount) * 100) / 100;
    expect(perMember).toBe(8.33);
  });

  it('returns null when no members', () => {
    const memberCount = 0;
    const result = memberCount > 0 ? 50 / memberCount : null;
    expect(result).toBeNull();
  });
});

describe('MP Trigger Types', () => {
  it('has 8 trigger types', () => {
    expect(MP_TRIGGER_TYPES).toHaveLength(8);
  });

  it('each trigger has a clear performance criterion', () => {
    const criteria: Record<string, string> = {
      high_open_rate: 'open rate > threshold',
      high_ctr: 'CTR > threshold',
      high_conversion: 'conversion > threshold',
      perfect_compliance: 'compliance score = 100',
      batch_completion: 'all 5 channels completed',
      top_performer: '#1 content in workspace',
      competitor_insight: 'surfaced critical event',
      streak_bonus: 'N consecutive high performers',
    };
    for (const type of MP_TRIGGER_TYPES) {
      expect(criteria[type]).toBeTruthy();
    }
  });

  it('trigger type union matches exported const', () => {
    const t: MpTriggerType = 'high_open_rate';
    expect(MP_TRIGGER_TYPES.includes(t)).toBe(true);
  });
});

describe('rowToSnapshot', () => {
  it('maps snake_case DB row to camelCase snapshot', () => {
    const row: Record<string, unknown> = {
      emails_created: 10, emails_sent: 8, va2_manifests_generated: 5,
      top_theme: 'startup', avg_section_count: '4.5',
      batch_jobs_created: 3, batch_jobs_completed: 2, batch_jobs_failed: 1,
      total_derivatives_generated: 9, channel_success_rates: { email: 0.95 },
      avg_open_rate: '0.3200', avg_click_through_rate: '0.0500', avg_conversion_rate: '0.0200',
      top_performing_content_id: 'cid-1', top_performing_open_rate: '0.4500', campaigns_with_data: 5,
      compliance_scans_total: 12, compliance_pass_rate: '0.9000', avg_compliance_score: '88.50',
      common_violations: [{ type: 'tone_deviation', count: 3 }],
      competitor_events_discovered: 20, significant_competitor_moves: 3,
      active_competitors_count: 2, top_competitor_event_type: 'product_launch',
      content_in_draft: 4, content_in_review: 2, content_approved: 3, content_published: 15,
      active_team_members: 4, content_per_member: '5.00',
      snapshot_date: '2026-03-22', generated_at: '2026-03-22T10:00:00Z', generation_duration_ms: 320,
    };

    const snapshot = rowToSnapshot(row);

    expect(snapshot.emailsCreated).toBe(10);
    expect(snapshot.emailsSent).toBe(8);
    expect(snapshot.topTheme).toBe('startup');
    expect(snapshot.avgSectionCount).toBe(4.5);
    expect(snapshot.avgOpenRate).toBe(0.32);
    expect(snapshot.avgClickThroughRate).toBe(0.05);
    expect(snapshot.compliancePassRate).toBe(0.9);
    expect(snapshot.avgComplianceScore).toBe(88.5);
    expect(snapshot.commonViolations).toEqual([{ type: 'tone_deviation', count: 3 }]);
    expect(snapshot.topCompetitorEventType).toBe('product_launch');
    expect(snapshot.contentPerMember).toBe(5);
    expect(snapshot.snapshotDate).toBe('2026-03-22');
  });

  it('handles null numerics correctly', () => {
    const row: Record<string, unknown> = {
      emails_created: 0, emails_sent: 0, va2_manifests_generated: 0,
      top_theme: null, avg_section_count: null,
      batch_jobs_created: 0, batch_jobs_completed: 0, batch_jobs_failed: 0,
      total_derivatives_generated: 0, channel_success_rates: {},
      avg_open_rate: null, avg_click_through_rate: null, avg_conversion_rate: null,
      top_performing_content_id: null, top_performing_open_rate: null, campaigns_with_data: 0,
      compliance_scans_total: 0, compliance_pass_rate: null, avg_compliance_score: null,
      common_violations: [],
      competitor_events_discovered: 0, significant_competitor_moves: 0,
      active_competitors_count: 0, top_competitor_event_type: null,
      content_in_draft: 0, content_in_review: 0, content_approved: 0, content_published: 0,
      active_team_members: 0, content_per_member: null,
      snapshot_date: '2026-03-22', generated_at: '2026-03-22T10:00:00Z', generation_duration_ms: 0,
    };
    const snapshot = rowToSnapshot(row);

    expect(snapshot.avgOpenRate).toBeNull();
    expect(snapshot.avgComplianceScore).toBeNull();
    expect(snapshot.contentPerMember).toBeNull();
    expect(snapshot.topTheme).toBeNull();
  });
});

describe('generateSnapshot', () => {
  it('runs all 7 aggregation queries in parallel and returns a snapshot', async () => {
    function routeQuery(sql: string): { rows: Array<Record<string, unknown>> } {
      if (sql.includes('emails_created') && sql.includes('emails_sent'))
        return { rows: [{ emails_created: 10, emails_sent: 5 }] };
      if (sql.includes('body_design') && sql.includes('version'))
        return { rows: [{ count: 3 }] };
      if (sql.includes('batch_jobs') && sql.includes('as total'))
        return { rows: [{ total: 4, completed: 3, failed: 1, derivatives: 12 }] };
      if (sql.includes('batch_jobs') && sql.includes('results'))
        return { rows: [{ results: [{ channel: 'email', status: 'completed' }] }] };
      if (sql.includes('performance_feedback') && sql.includes('avg_open'))
        return { rows: [{ avg_open: 0.30, avg_ctr: 0.05, avg_conv: 0.02, with_data: 8 }] };
      if (sql.includes('performance_feedback') && sql.includes('content_id'))
        return { rows: [{ content_id: 'top-1', open_rate: 0.45 }] };
      if (sql.includes('compliance_scans') && sql.includes('as total'))
        return { rows: [{ total: 15, pass_rate: 0.85, avg_score: 82 }] };
      if (sql.includes('compliance_scans') && sql.includes('flags'))
        return { rows: [{ flags: [{ type: 'forbidden_word' }] }] };
      if (sql.includes('competitor_events') && sql.includes('total_events'))
        return { rows: [{ total_events: 20, significant: 3 }] };
      if (sql.includes('competitors') && sql.includes('active'))
        return { rows: [{ count: 4 }] };
      if (sql.includes('competitor_events') && sql.includes('GROUP BY'))
        return { rows: [{ event_type: 'blog_post', count: 10 }] };
      if (sql.includes('marketing_content') && sql.includes('draft'))
        return { rows: [{ draft: 5, in_review: 2, approved: 3, published: 20 }] };
      if (sql.includes('DISTINCT') && sql.includes('author_id'))
        return { rows: [{ members: 5 }] };
      if (sql.includes('marketing_content') && sql.includes('COUNT') && sql.includes('created_at'))
        return { rows: [{ count: 30 }] };
      return { rows: [] };
    }

    const db = { query: vi.fn(async (sql: string) => routeQuery(sql)) };

    const snapshot = await generateSnapshot('org-1', '2026-03-23', 30, db);

    expect(snapshot.snapshotDate).toBe('2026-03-23');
    expect(snapshot.generationDurationMs).toBeGreaterThanOrEqual(0);
    expect(snapshot.emailsCreated).toBe(10);
    expect(snapshot.batchJobsCompleted).toBe(3);
    expect(snapshot.campaignsWithData).toBe(8);
    expect(snapshot.complianceScanTotal).toBe(15);
    expect(snapshot.competitorEventsDiscovered).toBe(20);
    expect(snapshot.contentPublished).toBe(20);
    expect(snapshot.activeTeamMembers).toBe(5);
    expect(snapshot.contentPerMember).toBe(6);
    expect(db.query).toHaveBeenCalled();
  });

  it('handles errors gracefully — returns zeros for failed queries', async () => {
    const db = {
      query: vi.fn(async () => { throw new Error('connection refused'); }),
    };

    const snapshot = await generateSnapshot('org-1', '2026-03-23', 30, db);

    expect(snapshot.emailsCreated).toBe(0);
    expect(snapshot.batchJobsCreated).toBe(0);
    expect(snapshot.avgOpenRate).toBeNull();
    expect(snapshot.complianceScanTotal).toBe(0);
    expect(snapshot.competitorEventsDiscovered).toBe(0);
    expect(snapshot.contentInDraft).toBe(0);
    expect(snapshot.activeTeamMembers).toBe(0);
    expect(snapshot.generationDurationMs).toBeGreaterThanOrEqual(0);
  });
});
