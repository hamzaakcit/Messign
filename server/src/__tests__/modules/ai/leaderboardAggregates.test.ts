import { describe, expect, it } from 'vitest';
import {
  buildShortLeaderboardSummary,
  computeLeaderboardXpAggregates,
  leaderboardAggregatesFromToolData,
  leaderboardRowsFromToolData,
  rowLooksLikeXpLeaderboard,
} from '../../../services/ai/tools/leaderboardAggregates.js';

const REF_USER_ID = '3a733025-e96b-4ee4-9b8a-4fb6423ad4b7';

describe('leaderboardAggregates', () => {
  it('computes top and average XP', () => {
    const rows = [
      { points: 100, full_name: 'A' },
      { points: 50, full_name: 'B' },
      { user_id: REF_USER_ID, points: 0, full_name: 'C' },
    ];
    expect(computeLeaderboardXpAggregates(rows)).toEqual({ count: 3, topPoints: 100, avgPoints: 50 });
  });

  it('extracts leaderboard from structured or legacy array', () => {
    const structured = {
      leaderboard: [{ rank: 1, points: 10, full_name: 'X', email: 'x@y.com' }],
      aggregates: { count: 1, topPoints: 10, avgPoints: 10 },
    };
    expect(leaderboardRowsFromToolData(structured)?.length).toBe(1);
    expect(leaderboardAggregatesFromToolData(structured)?.topPoints).toBe(10);

    const legacy = [{ rank: 1, points: 5, full_name: 'Y' }];
    expect(leaderboardRowsFromToolData(legacy)?.length).toBe(1);
    expect(leaderboardRowsFromToolData([{ name: 'Badge', description: 'x' }])).toBeNull();
  });

  it('rowLooksLikeXpLeaderboard distinguishes XP rows', () => {
    expect(rowLooksLikeXpLeaderboard({ points: 1, full_name: 'Z' })).toBe(true);
    expect(rowLooksLikeXpLeaderboard({ name: 'Only name' })).toBe(false);
  });

  it('buildShortLeaderboardSummary avoids markdown', () => {
    const s = buildShortLeaderboardSummary({ count: 2, topPoints: 99, avgPoints: 50 }, 'Alex');
    expect(s).toContain('all-time');
    expect(s).not.toContain('**');
  });
});
