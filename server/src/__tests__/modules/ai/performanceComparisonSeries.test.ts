import { describe, expect, it } from 'vitest';
import { buildPerformanceComparisonSeries } from '../../../services/ai/tools/performanceComparisonSeries.js';

/** Sample auth_user_id for local / fixture scenarios (documented reference). */
const SAMPLE_AUTH_USER_ID = '3a733025-e96b-4ee4-9b8a-4fb6423ad4b7';

describe('buildPerformanceComparisonSeries', () => {
  it('returns null without team average', () => {
    expect(
      buildPerformanceComparisonSeries([{ full_name: 'A', tasks_completed: 1 }], null, 'this_month'),
    ).toBeNull();
  });

  it('builds rows for first employee vs team', () => {
    const employees = [
      {
        full_name: 'Test User',
        auth_user_id: SAMPLE_AUTH_USER_ID,
        tasks_completed: 10,
        xp: 500,
        activity_count: 12,
      },
    ];
    const team = { avg_tasks_completed: 8, avg_xp: 400, avg_activity_count: 10 };
    const s = buildPerformanceComparisonSeries(employees, team, 'this_month');
    expect(s?.employeeName).toBe('Test User');
    expect(s?.rows).toHaveLength(3);
    expect(s?.rows[0]).toMatchObject({ label: 'Tasks completed', self: 10, team: 8 });
    expect(s?.rows[1]).toMatchObject({ label: 'XP', self: 500, team: 400 });
  });
});
