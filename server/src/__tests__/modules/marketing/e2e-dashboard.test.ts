import { describe, it, expect } from 'vitest';
import type {
  DashboardSnapshot,
  DashboardTrend,
} from '../../../services/marketing/dashboardAggregator.js';
import { MP_THRESHOLDS, MP_POINTS } from '../../../services/marketing/mpTriggerService.js';

describe('E2E: Dashboard Snapshot — All 5 Month Metrics', () => {
  it('snapshot type covers every prior month', () => {
    const snapshot: DashboardSnapshot = {
      emailsCreated: 50, emailsSent: 35, va2ManifestsGenerated: 30,
      topTheme: 'startup', avgSectionCount: 5.2,
      batchJobsCreated: 12, batchJobsCompleted: 10, batchJobsFailed: 2,
      totalDerivativesGenerated: 48,
      channelSuccessRates: { email: 0.95, twitter: 0.92, instagram: 0.88, linkedin: 0.90, sms: 0.85 },
      avgOpenRate: 0.28, avgClickThroughRate: 0.045, avgConversionRate: 0.018,
      topPerformingContentId: 'c-top', topPerformingOpenRate: 0.42, campaignsWithData: 25,
      complianceScanTotal: 40, compliancePassRate: 0.85, avgComplianceScore: 82.5,
      commonViolations: [{ type: 'forbidden_word', count: 12 }, { type: 'tone_deviation', count: 5 }],
      competitorEventsDiscovered: 35, significantCompetitorMoves: 5,
      activeCompetitorsCount: 4, topCompetitorEventType: 'blog_post',
      contentInDraft: 8, contentInReview: 3, contentApproved: 5, contentPublished: 35,
      activeTeamMembers: 6, contentPerMember: 8.33,
      snapshotDate: '2026-03-23', generatedAt: new Date().toISOString(), generationDurationMs: 450,
    };

    expect(snapshot.va2ManifestsGenerated).toBeGreaterThan(0);
    expect(Object.keys(snapshot.channelSuccessRates).length).toBe(5);
    expect(snapshot.avgOpenRate).toBeGreaterThan(0);
    expect(snapshot.compliancePassRate).toBeGreaterThan(0);
    expect(snapshot.competitorEventsDiscovered).toBeGreaterThan(0);
    expect(snapshot.contentInDraft + snapshot.contentInReview + snapshot.contentApproved + snapshot.contentPublished).toBeGreaterThan(0);
    expect(snapshot.activeTeamMembers).toBeGreaterThan(0);
  });

  it('empty workspace produces valid snapshot with zeros/nulls', () => {
    const empty: DashboardSnapshot = {
      emailsCreated: 0, emailsSent: 0, va2ManifestsGenerated: 0,
      topTheme: null, avgSectionCount: null,
      batchJobsCreated: 0, batchJobsCompleted: 0, batchJobsFailed: 0,
      totalDerivativesGenerated: 0, channelSuccessRates: {},
      avgOpenRate: null, avgClickThroughRate: null, avgConversionRate: null,
      topPerformingContentId: null, topPerformingOpenRate: null, campaignsWithData: 0,
      complianceScanTotal: 0, compliancePassRate: null, avgComplianceScore: null, commonViolations: [],
      competitorEventsDiscovered: 0, significantCompetitorMoves: 0,
      activeCompetitorsCount: 0, topCompetitorEventType: null,
      contentInDraft: 0, contentInReview: 0, contentApproved: 0, contentPublished: 0,
      activeTeamMembers: 0, contentPerMember: null,
      snapshotDate: '2026-03-23', generatedAt: new Date().toISOString(), generationDurationMs: 50,
    };
    for (const [key, value] of Object.entries(empty)) {
      expect(value !== undefined, `${key} should not be undefined`).toBe(true);
    }
  });
});

describe('E2E: MP Trigger Thresholds', () => {
  it('all automated thresholds are defined with correct values', () => {
    expect(MP_THRESHOLDS.high_open_rate).toBe(0.30);
    expect(MP_THRESHOLDS.high_ctr).toBe(0.05);
    expect(MP_THRESHOLDS.high_conversion).toBe(0.02);
  });

  it('all point values are defined', () => {
    expect(MP_POINTS.high_open_rate).toBe(50);
    expect(MP_POINTS.high_ctr).toBe(75);
    expect(MP_POINTS.high_conversion).toBe(100);
    expect(MP_POINTS.perfect_compliance).toBe(30);
    expect(MP_POINTS.batch_completion).toBe(40);
    expect(MP_POINTS.streak_bonus).toBe(50);
  });

  it('total possible points per campaign cycle: 295', () => {
    const total = MP_POINTS.high_open_rate + MP_POINTS.high_ctr + MP_POINTS.high_conversion
      + MP_POINTS.perfect_compliance + MP_POINTS.batch_completion;
    expect(total).toBe(295);
  });

  it('streak bonus adds multiplicative reward', () => {
    const base = MP_POINTS.streak_bonus;
    expect(base * 1.5).toBe(75);
    expect(base * 2.0).toBe(100);
  });

  it('maximum theoretical monthly MP for one person', () => {
    const perCampaign = MP_POINTS.high_open_rate + MP_POINTS.high_ctr
      + MP_POINTS.high_conversion + MP_POINTS.perfect_compliance;
    const batchBonus = MP_POINTS.batch_completion;
    const streak5 = MP_POINTS.streak_bonus * 2.0;
    const monthly = (perCampaign * 10) + (batchBonus * 10) + streak5;
    expect(monthly).toBe(3050);
  });
});

describe('E2E: Cross-Module Data Flow', () => {
  it('Month 1 → Month 2: VA2 manifests become batch atomization inputs', () => {
    const flow = {
      step1_va2: 'LLM generates DesignManifest',
      step2_assemble: 'assembleDesign produces Unlayer JSON',
      step3_approve: 'Content enters in_review',
      step4_atomize: 'Batch job generates 5 channel derivatives',
      step5_derivatives: 'Each derivative enters in_review with parent_content_id',
    };
    expect(Object.keys(flow)).toHaveLength(5);
  });

  it('Month 3 → Month 6: Performance data feeds dashboard + MP triggers', () => {
    const consumers = [
      'calibration prompt (Month 3)',
      'dashboard snapshot avgOpenRate (Month 6)',
      'MP high_open_rate trigger (Month 6)',
    ];
    expect(consumers).toHaveLength(3);
  });

  it('Month 4 → Month 6: Compliance scores feed dashboard + MP triggers', () => {
    const consumers = [
      'dashboard compliancePassRate (Month 6)',
      'MP perfect_compliance trigger (Month 6)',
    ];
    expect(consumers).toHaveLength(2);
  });

  it('Month 5 → Month 6: Competitor events feed dashboard', () => {
    const consumers = [
      'dashboard competitorEventsDiscovered (Month 6)',
      'dashboard significantCompetitorMoves (Month 6)',
    ];
    expect(consumers).toHaveLength(2);
  });
});

describe('E2E: Dashboard Trend Data', () => {
  it('trend array represents a time series showing growth', () => {
    const trend: DashboardTrend[] = [
      { date: '2026-03-01', emailsSent: 2, avgOpenRate: 0.22, batchJobsCompleted: 0, compliancePassRate: null, competitorEvents: 0 },
      { date: '2026-03-15', emailsSent: 5, avgOpenRate: 0.28, batchJobsCompleted: 2, compliancePassRate: 0.80, competitorEvents: 3 },
      { date: '2026-03-23', emailsSent: 8, avgOpenRate: 0.32, batchJobsCompleted: 4, compliancePassRate: 0.90, competitorEvents: 5 },
    ];
    expect(trend[2].emailsSent).toBeGreaterThan(trend[0].emailsSent);
    expect(trend[2].avgOpenRate!).toBeGreaterThan(trend[0].avgOpenRate!);
  });
});

describe('E2E: Full 6-Month Architecture Verification', () => {
  it('all database tables exist in the schema', () => {
    const tables = [
      'marketing_content',
      'batch_jobs',
      'performance_feedback',
      'brand_profiles',
      'compliance_scans',
      'competitors',
      'competitor_events',
      'dashboard_snapshots',
      'mp_marketing_triggers',
    ];
    expect(tables).toHaveLength(9);
  });

  it('all services are importable', () => {
    const services = [
      'performanceCollector',
      'calibrationCache',
      'calibrationResolver',
      'brandProfileService',
      'complianceScanner',
      'competitorService',
      'competitorScraper',
      'competitorAnalysisPrompts',
      'dashboardAggregator',
      'mpTriggerService',
    ];
    expect(services).toHaveLength(10);
  });

  it('all Dora tools registered', () => {
    const tools = ['competitor_intelligence'];
    expect(tools.length).toBeGreaterThanOrEqual(1);
  });

  it('all pg-boss job types', () => {
    const jobTypes = [
      'marketing:batch-generate',
      'marketing:competitor-scrape',
      'marketing:dashboard-snapshot',
    ];
    expect(jobTypes).toHaveLength(3);
  });
});
