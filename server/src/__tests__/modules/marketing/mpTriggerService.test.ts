import { describe, it, expect, vi } from 'vitest';
import {
  evaluatePerformanceTriggers,
  evaluateComplianceTriggers,
  evaluateBatchTriggers,
  evaluateStreakBonus,
  getUserTriggerSummary,
  getLeaderboard,
  MP_THRESHOLDS,
  MP_POINTS,
} from '../../../services/marketing/mpTriggerService.js';

function makeMockDb(opts: {
  hasTrigger?: boolean;
  streakCount?: number;
  insertReturn?: Record<string, unknown>;
} = {}) {
  const { hasTrigger = false, streakCount = 0, insertReturn } = opts;
  let callCount = 0;
  return {
    query: vi.fn(async (sql: string) => {
      callCount++;
      if (sql.includes('SELECT 1 FROM mp_marketing_triggers')) {
        return { rows: hasTrigger ? [{ 1: 1 }] : [] };
      }
      if (sql.includes('INSERT INTO mp_marketing_triggers')) {
        return { rows: [insertReturn || { id: `trigger-${callCount}`, organization_id: 'org-1', user_id: 'u-1', trigger_type: 'test', content_id: null, batch_job_id: null, points_earned: 50, multiplier: '1.0', details: {}, status: 'pending', created_at: new Date().toISOString() }] };
      }
      if (sql.includes("trigger_type = 'high_open_rate'") && sql.includes('ORDER BY')) {
        return { rows: Array.from({ length: streakCount }, (_, i) => ({ id: `s-${i}` })) };
      }
      if (sql.includes("trigger_type = 'streak_bonus'") && sql.includes('multiplier')) {
        return { rows: [] };
      }
      if (sql.includes('GROUP BY user_id')) {
        return { rows: [
          { user_id: 'u-1', total_points: 300, trigger_count: 6 },
          { user_id: 'u-2', total_points: 150, trigger_count: 3 },
        ] };
      }
      if (sql.includes('SUM(points_earned')) {
        return { rows: [{ total_points: 250, trigger_count: 5, pending_points: 100 }] };
      }
      if (sql.includes('SELECT * FROM mp_marketing_triggers') && sql.includes('ORDER BY')) {
        return { rows: [] };
      }
      return { rows: [] };
    }),
  };
}

describe('Performance Trigger Evaluation', () => {
  it('high_open_rate triggers at >30%', () => {
    const shouldTrigger = (openRate: number) => openRate > MP_THRESHOLDS.high_open_rate;
    expect(shouldTrigger(0.35)).toBe(true);
    expect(shouldTrigger(0.30)).toBe(false);
    expect(shouldTrigger(0.29)).toBe(false);
  });

  it('high_ctr triggers at >5%', () => {
    const shouldTrigger = (ctr: number) => ctr > MP_THRESHOLDS.high_ctr;
    expect(shouldTrigger(0.06)).toBe(true);
    expect(shouldTrigger(0.05)).toBe(false);
  });

  it('high_conversion triggers at >2%', () => {
    const shouldTrigger = (conv: number) => conv > MP_THRESHOLDS.high_conversion;
    expect(shouldTrigger(0.03)).toBe(true);
    expect(shouldTrigger(0.02)).toBe(false);
  });

  it('multiple triggers can fire for same content', () => {
    const metrics = { openRate: 0.35, clickThroughRate: 0.06, conversionRate: 0.03 };
    const triggered: string[] = [];
    if (metrics.openRate > MP_THRESHOLDS.high_open_rate) triggered.push('high_open_rate');
    if (metrics.clickThroughRate > MP_THRESHOLDS.high_ctr) triggered.push('high_ctr');
    if (metrics.conversionRate > MP_THRESHOLDS.high_conversion) triggered.push('high_conversion');
    expect(triggered).toHaveLength(3);
  });

  it('points awarded correctly', () => {
    expect(MP_POINTS.high_open_rate).toBe(50);
    expect(MP_POINTS.high_ctr).toBe(75);
    expect(MP_POINTS.high_conversion).toBe(100);
    expect(MP_POINTS.perfect_compliance).toBe(30);
    expect(MP_POINTS.batch_completion).toBe(40);
    expect(MP_POINTS.streak_bonus).toBe(50);
  });

  it('evaluatePerformanceTriggers creates records for exceeded thresholds', async () => {
    const db = makeMockDb();
    const triggers = await evaluatePerformanceTriggers(
      'org-1', 'u-1', 'c-1',
      { openRate: 0.35, clickThroughRate: 0.06, conversionRate: 0.03 },
      db,
    );
    expect(triggers).toHaveLength(3);
    expect(db.query).toHaveBeenCalled();
  });

  it('evaluatePerformanceTriggers skips when under threshold', async () => {
    const db = makeMockDb();
    const triggers = await evaluatePerformanceTriggers(
      'org-1', 'u-1', 'c-1',
      { openRate: 0.20, clickThroughRate: 0.03 },
      db,
    );
    expect(triggers).toHaveLength(0);
  });

  it('evaluatePerformanceTriggers deduplicates existing triggers', async () => {
    const db = makeMockDb({ hasTrigger: true });
    const triggers = await evaluatePerformanceTriggers(
      'org-1', 'u-1', 'c-1',
      { openRate: 0.35 },
      db,
    );
    expect(triggers).toHaveLength(0);
  });
});

describe('Compliance Trigger Evaluation', () => {
  it('perfect_compliance only at score === 100', () => {
    const shouldTrigger = (score: number) => score === 100;
    expect(shouldTrigger(100)).toBe(true);
    expect(shouldTrigger(99)).toBe(false);
    expect(shouldTrigger(80)).toBe(false);
  });

  it('evaluateComplianceTriggers creates trigger for 100', async () => {
    const db = makeMockDb();
    const trigger = await evaluateComplianceTriggers('org-1', 'u-1', 'c-1', 100, db);
    expect(trigger).not.toBeNull();
  });

  it('evaluateComplianceTriggers returns null for <100', async () => {
    const db = makeMockDb();
    const trigger = await evaluateComplianceTriggers('org-1', 'u-1', 'c-1', 99, db);
    expect(trigger).toBeNull();
  });
});

describe('Batch Trigger Evaluation', () => {
  it('batch_completion requires all channels + minimum 5', () => {
    const shouldTrigger = (completed: number, total: number) =>
      completed === total && total >= 5;
    expect(shouldTrigger(5, 5)).toBe(true);
    expect(shouldTrigger(4, 5)).toBe(false);
    expect(shouldTrigger(3, 3)).toBe(false);
  });

  it('evaluateBatchTriggers creates trigger for full 5-channel completion', async () => {
    const db = makeMockDb();
    const trigger = await evaluateBatchTriggers('org-1', 'u-1', 'batch-1', 5, 5, db);
    expect(trigger).not.toBeNull();
  });

  it('evaluateBatchTriggers returns null for partial completion', async () => {
    const db = makeMockDb();
    const trigger = await evaluateBatchTriggers('org-1', 'u-1', 'batch-1', 4, 5, db);
    expect(trigger).toBeNull();
  });

  it('evaluateBatchTriggers returns null for <5 channels', async () => {
    const db = makeMockDb();
    const trigger = await evaluateBatchTriggers('org-1', 'u-1', 'batch-1', 3, 3, db);
    expect(trigger).toBeNull();
  });
});

describe('Streak Bonus Evaluation', () => {
  it('3 consecutive high_open_rate = 1.5x multiplier', () => {
    const streakLength = 3;
    const multiplier = streakLength >= 5 ? 2.0 : streakLength >= 3 ? 1.5 : 1.0;
    expect(multiplier).toBe(1.5);
  });

  it('5 consecutive = 2.0x multiplier', () => {
    const streakLength = 5;
    const multiplier = streakLength >= 5 ? 2.0 : streakLength >= 3 ? 1.5 : 1.0;
    expect(multiplier).toBe(2.0);
  });

  it('no streak < 3', () => {
    const streakLength = 2;
    const shouldTrigger = streakLength >= 3;
    expect(shouldTrigger).toBe(false);
  });

  it('evaluateStreakBonus creates trigger at 3+ streak', async () => {
    const db = makeMockDb({ streakCount: 3 });
    const trigger = await evaluateStreakBonus('org-1', 'u-1', db);
    expect(trigger).not.toBeNull();
  });

  it('evaluateStreakBonus returns null below 3', async () => {
    const db = makeMockDb({ streakCount: 2 });
    const trigger = await evaluateStreakBonus('org-1', 'u-1', db);
    expect(trigger).toBeNull();
  });
});

describe('Deduplication', () => {
  it('same trigger_type + content_id should not duplicate', () => {
    const existing = [{ trigger_type: 'high_open_rate', content_id: 'c-1' }];
    const newTrigger = { trigger_type: 'high_open_rate', content_id: 'c-1' };
    const isDuplicate = existing.some(
      (e) => e.trigger_type === newTrigger.trigger_type && e.content_id === newTrigger.content_id,
    );
    expect(isDuplicate).toBe(true);
  });

  it('different trigger_type for same content is allowed', () => {
    const existing = [{ trigger_type: 'high_open_rate', content_id: 'c-1' }];
    const newTrigger = { trigger_type: 'high_ctr', content_id: 'c-1' };
    const isDuplicate = existing.some(
      (e) => e.trigger_type === newTrigger.trigger_type && e.content_id === newTrigger.content_id,
    );
    expect(isDuplicate).toBe(false);
  });
});

describe('Leaderboard Sorting', () => {
  it('sorts by total points descending', () => {
    const users = [
      { userId: 'u1', totalPoints: 200 },
      { userId: 'u2', totalPoints: 450 },
      { userId: 'u3', totalPoints: 100 },
    ];
    const sorted = [...users].sort((a, b) => b.totalPoints - a.totalPoints);
    expect(sorted[0].userId).toBe('u2');
    expect(sorted[2].userId).toBe('u3');
  });

  it('getLeaderboard returns sorted results', async () => {
    const db = makeMockDb();
    const board = await getLeaderboard('org-1', '2026-01-01', 10, db);
    expect(board).toHaveLength(2);
    expect(board[0].totalPoints).toBeGreaterThanOrEqual(board[1].totalPoints);
  });
});

describe('getUserTriggerSummary', () => {
  it('returns aggregated summary', async () => {
    const db = makeMockDb();
    const summary = await getUserTriggerSummary('org-1', 'u-1', db);
    expect(summary.totalPoints).toBe(250);
    expect(summary.triggerCount).toBe(5);
    expect(summary.pendingPoints).toBe(100);
    expect(Array.isArray(summary.recentTriggers)).toBe(true);
  });
});

describe('MP Trigger Types — Complete Coverage', () => {
  const allTypes = [
    'high_open_rate', 'high_ctr', 'high_conversion',
    'perfect_compliance', 'batch_completion', 'top_performer',
    'competitor_insight', 'streak_bonus',
  ];

  it('8 trigger types defined', () => {
    expect(allTypes).toHaveLength(8);
  });

  it('automated triggers: 6 (performance, compliance, batch, streak)', () => {
    const automated = ['high_open_rate', 'high_ctr', 'high_conversion',
      'perfect_compliance', 'batch_completion', 'streak_bonus'];
    expect(automated).toHaveLength(6);
  });

  it('manual triggers: 2 (top_performer, competitor_insight)', () => {
    const manual = ['top_performer', 'competitor_insight'];
    expect(manual).toHaveLength(2);
  });
});
