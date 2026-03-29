import { describe, expect, it } from 'vitest';
import {
  computeProjectStatusAggregates,
  projectsFromProjectStatusData,
} from '../../../services/ai/tools/projectStatusAggregates.js';

/** Reference id for fixtures (see user-provided sample). */
const REF_PROJECT_ID = '3a733025-e96b-4ee4-9b8a-4fb6423ad4b7';

describe('computeProjectStatusAggregates', () => {
  it('averages completion and sums task stats', () => {
    const rows = [
      {
        id: REF_PROJECT_ID,
        name: 'P1',
        completionPercentage: 80,
        taskStats: { total: 10, completed: 8 },
      },
      {
        id: 'p2',
        name: 'P2',
        completionPercentage: 60,
        taskStats: { total: 5, completed: 3 },
      },
    ];
    const a = computeProjectStatusAggregates(rows);
    expect(a.projectCount).toBe(2);
    expect(a.avgCompletion).toBe(70);
    expect(a.totalTasks).toBe(15);
    expect(a.completedTasks).toBe(11);
  });
});

describe('projectsFromProjectStatusData', () => {
  it('returns array for legacy shape', () => {
    const rows = [{ id: '1', name: 'X' }];
    expect(projectsFromProjectStatusData(rows)).toEqual(rows);
  });

  it('extracts projects from structured payload', () => {
    const projects = [{ id: '1', name: 'X' }];
    expect(projectsFromProjectStatusData({ projects, aggregates: {} })).toEqual(projects);
  });
});
