import { describe, it, expect } from 'vitest';
import { buildDashboardTodos } from '@/components/dashboard/analytics/buildDashboardTodos';
import type { CommandCenterDTO } from '@/types/command-center';

const emptyWs = {
  crm: { ok: false as const, error: 'x' },
  hr: { ok: false as const, error: 'x' },
  support: { ok: false as const, error: 'x' },
  marketing: { ok: false as const, error: 'x' },
  assets: { ok: false as const, error: 'x' },
  contracts: { ok: false as const, error: 'x' },
  okr: { ok: false as const, error: 'x' },
  chat: { ok: false as const, error: 'x' },
};

const minimalDto: CommandCenterDTO = {
  generatedAt: new Date().toISOString(),
  pulse: {
    activeProjects: 0,
    tasksCompletedThisWeek: 0,
    blockedTasks: 0,
    avgSprintVelocity: 0,
    velocityDeltaPct: null,
    velocityTrend: [],
    blockers: [],
  },
  brain: {
    todayFocus: null,
    doraUnreadCount: 0,
    knowledgeRecent: [],
    publishedDocCount: 0,
  },
  growth: {
    leaderboard: [],
    myRank: null,
    myXp: 0,
    vibeScore: null,
    engagementTrend: 'stable',
    cultureHealth: null,
    xpRadar: [],
  },
  future: {
    okrs: { overallProgress: 0, onTrack: 0, atRisk: 0, behind: 0 },
    milestones: [],
    sandboxIdeas: [],
  },
  workspace: emptyWs,
};

describe('buildDashboardTodos', () => {
  it('returns at least 20 todos even with sparse data', () => {
    const items = buildDashboardTodos(minimalDto);
    expect(items.length).toBeGreaterThanOrEqual(20);
  });

  it('prioritizes blockers and includes stable ids', () => {
    const dto: CommandCenterDTO = {
      ...minimalDto,
      pulse: {
        ...minimalDto.pulse,
        blockers: [{ id: 't1', title: 'Fix build', projectName: 'Core' }],
      },
    };
    const items = buildDashboardTodos(dto);
    expect(items.some((i) => i.label.includes('Fix build'))).toBe(true);
    expect(items.every((i) => i.id.length > 0)).toBe(true);
  });
});
