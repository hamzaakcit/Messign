import { describe, it, expect } from 'vitest';
import { formatCommandCenterSummary } from '../../../services/ai/tools/commandCenterDashboard.js';
import type { CommandCenterDTO } from '../../../dal/commandCenter.js';

const mockDto: CommandCenterDTO = {
  generatedAt: '2026-03-25T12:00:00.000Z',
  pulse: {
    activeProjects: 3,
    tasksCompletedThisWeek: 12,
    blockedTasks: 1,
    avgSprintVelocity: 24,
    velocityDeltaPct: 5,
    velocityTrend: [{ date: '2026-03-24', count: 4 }],
    blockers: [{ id: 't1', title: 'Blocked task A', projectName: 'Proj X' }],
  },
  brain: {
    todayFocus: 'Ship the release',
    doraUnreadCount: 2,
    publishedDocCount: 40,
    knowledgeRecent: [{ id: '1', title: 'Handbook', slug: 'handbook', updatedAt: '2026-03-20' }],
  },
  growth: {
    leaderboard: [
      { rank: 1, userId: 'u1', name: 'Alex', xp: 500, avatar: null },
      { rank: 2, userId: 'u2', name: 'Blake', xp: 400, avatar: null },
    ],
    myRank: 3,
    myXp: 300,
    vibeScore: 4.2,
    engagementTrend: 'up',
    cultureHealth: 78,
    xpRadar: [{ label: 'Alex', value: 100 }],
  },
  future: {
    okrs: { overallProgress: 62, onTrack: 4, atRisk: 1, behind: 0 },
    milestones: [{ title: 'Q1 goal', dueDate: '2026-03-31' }],
    sandboxIdeas: [],
  },
};

describe('formatCommandCenterSummary', () => {
  it('includes Pulse, Brain, Growth, Future sections and key figures', () => {
    const s = formatCommandCenterSummary(mockDto);
    expect(s).toContain('Command Center');
    expect(s).toContain('The Pulse');
    expect(s).toContain('**3**');
    expect(s).toContain('Blocked task A');
    expect(s).toContain('The Brain');
    expect(s).toContain('Ship the release');
    expect(s).toContain('The Growth');
    expect(s).toContain('The Future');
    expect(s).toContain('**62%**');
    expect(s).toContain('Q1 goal');
  });
});
