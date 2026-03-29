import { describe, expect, it } from 'vitest';
import {
  buildStatusPieData,
  deriveDueBucketsFromTasks,
  deriveStatsFromTasks,
  topProjectsByCount,
  type TaskRowExt,
} from '@/components/dora/widgets/taskWidgetAggregates';

describe('taskWidgetAggregates', () => {
  const monday = new Date('2025-03-24T12:00:00Z');

  it('deriveStatsFromTasks counts overdue and high priority', () => {
    const tasks: TaskRowExt[] = [
      { title: 'a', is_overdue: true, priority: 'high' },
      { title: 'b', is_overdue: false, priority: 'low' },
    ];
    const s = deriveStatsFromTasks(tasks);
    expect(s.total).toBe(2);
    expect(s.overdue).toBe(1);
    expect(s.highPriority).toBe(1);
  });

  it('buildStatusPieData uses byStatus when provided', () => {
    const pie = buildStatusPieData([], { Open: 2, 'In Progress': 1 });
    expect(pie).toEqual(
      expect.arrayContaining([
        { name: 'Open', value: 2 },
        { name: 'In Progress', value: 1 },
      ]),
    );
  });

  it('deriveDueBucketsFromTasks matches week semantics', () => {
    const tasks: TaskRowExt[] = [
      { title: 'o', is_overdue: true, due_date: '2025-03-10T12:00:00Z' },
      { title: 'w', is_overdue: false, due_date: '2025-03-26T12:00:00Z' },
    ];
    const b = deriveDueBucketsFromTasks(tasks, monday);
    expect(b.overdue).toBe(1);
    expect(b.due_this_week).toBe(1);
  });

  it('topProjectsByCount aggregates by project_name', () => {
    const tasks: TaskRowExt[] = [
      { title: '1', project_name: 'Alpha' },
      { title: '2', project_name: 'Alpha' },
      { title: '3', project_name: 'Beta' },
    ];
    const top = topProjectsByCount(tasks, 5);
    expect(top[0]).toEqual({ name: 'Alpha', count: 2 });
    expect(top[1]).toEqual({ name: 'Beta', count: 1 });
  });
});
