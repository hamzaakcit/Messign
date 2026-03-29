import { describe, expect, it } from 'vitest';
import {
  buildShortSprintSummary,
  computeSprintStatusAggregates,
  sprintsFromSprintStatusData,
} from '../../../services/ai/tools/sprintStatusAggregates.js';

const REF_SPRINT_ID = '3a733025-e96b-4ee4-9b8a-4fb6423ad4b7';

describe('sprintStatusAggregates', () => {
  it('computes aggregates from enriched sprint rows', () => {
    const rows = [
      {
        id: REF_SPRINT_ID,
        status: 'ACTIVE',
        progress: 80,
        daysLeft: 3,
        helperCount: 2,
      },
      { id: 'b', status: 'RESOLVED', progress: 100, daysLeft: 0, helperCount: 3 },
    ];
    expect(computeSprintStatusAggregates(rows)).toEqual({
      sprintCount: 2,
      avgProgress: 90,
      activeCount: 1,
      minDaysLeft: 0,
    });
  });

  it('normalizes array and structured payloads', () => {
    const legacy = [{ id: 'x', progress: 50, status: 'IN_PROGRESS', daysLeft: 1 }];
    expect(sprintsFromSprintStatusData(legacy).aggregates.sprintCount).toBe(1);
    const structured = {
      sprints: legacy,
      aggregates: { sprintCount: 1, avgProgress: 50, activeCount: 1, minDaysLeft: 1 },
    };
    expect(sprintsFromSprintStatusData(structured).aggregates.minDaysLeft).toBe(1);
  });

  it('buildShortSprintSummary avoids markdown', () => {
    const s = buildShortSprintSummary({
      sprintCount: 2,
      avgProgress: 50,
      activeCount: 2,
      minDaysLeft: 4,
    });
    expect(s).not.toContain('**');
    expect(s).toContain('4 days');
  });
});
