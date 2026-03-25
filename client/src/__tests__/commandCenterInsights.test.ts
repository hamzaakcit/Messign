import { describe, it, expect } from 'vitest';
import { buildColumnInsights } from '@/components/command-center/lib/commandCenterInsights';
import type { CommandCenterDTO } from '@/types/command-center';

const base: CommandCenterDTO = {
  generatedAt: new Date().toISOString(),
  pulse: {
    activeProjects: 3,
    tasksCompletedThisWeek: 12,
    blockedTasks: 2,
    avgSprintVelocity: 64,
    velocityDeltaPct: -5,
    velocityTrend: [{ date: '2026-01-01', count: 2 }],
    blockers: [{ id: 't1', title: 'Blocked task', projectName: 'P' }],
  },
  brain: {
    todayFocus: 'Focus',
    doraUnreadCount: 1,
    knowledgeRecent: [],
    publishedDocCount: 5,
  },
  growth: {
    leaderboard: [],
    myRank: 2,
    myXp: 100,
    vibeScore: 4.2,
    engagementTrend: 'stable',
    cultureHealth: 70,
    xpRadar: [{ label: 'A', value: 80 }],
  },
  future: {
    okrs: { overallProgress: 50, onTrack: 2, atRisk: 1, behind: 0 },
    milestones: [{ title: 'Q end', dueDate: '2026-03-31' }],
    sandboxIdeas: [],
  },
};

describe('buildColumnInsights', () => {
  it('mentions blocked tasks in pulse when present', () => {
    const i = buildColumnInsights(base);
    expect(i.pulse).toContain('blocked');
  });

  it('returns loading copy when data is null', () => {
    const i = buildColumnInsights(null);
    expect(i.pulse).toContain('Loading');
  });
});
