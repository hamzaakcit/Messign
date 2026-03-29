import { describe, expect, it } from 'vitest';
import {
  buildShortTeamOverviewSummary,
  computeTeamOverviewAggregates,
} from '../../../services/ai/tools/teamOverviewAggregates.js';

/** Reference id for fixtures (see user-provided sample). */
const REF_TEAM_ID = '3a733025-e96b-4ee4-9b8a-4fb6423ad4b7';

describe('computeTeamOverviewAggregates', () => {
  it('sums members, tasks, and weighted avg completion', () => {
    const rows = [
      {
        id: REF_TEAM_ID,
        name: 'Alpha',
        memberCount: 2,
        completionRate: 80,
        taskStats: { total: 10, completed: 8 },
      },
      {
        id: 't2',
        name: 'Beta',
        memberCount: 2,
        completionRate: 60,
        taskStats: { total: 5, completed: 3 },
      },
    ];
    const a = computeTeamOverviewAggregates(rows);
    expect(a.teamCount).toBe(2);
    expect(a.totalMembers).toBe(4);
    expect(a.avgCompletion).toBe(70);
    expect(a.totalTasks).toBe(15);
    expect(a.completedTasks).toBe(11);
  });
});

describe('buildShortTeamOverviewSummary', () => {
  it('uses plain text without markdown', () => {
    const rows = [{ id: REF_TEAM_ID, name: 'Alpha', memberCount: 2, completionRate: 50, taskStats: { total: 4, completed: 2 } }];
    const agg = computeTeamOverviewAggregates(rows);
    const s = buildShortTeamOverviewSummary(rows, 'this_month', agg);
    expect(s).toContain('Alpha');
    expect(s).not.toContain('**');
  });

  it('summarizes multi-team rollup', () => {
    const rows = [
      { name: 'A', memberCount: 1, completionRate: 100, taskStats: { total: 1, completed: 1 } },
      { name: 'B', memberCount: 1, completionRate: 0, taskStats: { total: 1, completed: 0 } },
    ];
    const agg = computeTeamOverviewAggregates(rows);
    expect(buildShortTeamOverviewSummary(rows, 'this_month', agg)).toMatch(/2 teams/);
  });
});
