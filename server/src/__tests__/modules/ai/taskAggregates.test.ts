import { describe, expect, it } from 'vitest';
import {
  computeTaskAggregates,
  normalizeStatusLabel,
  type TaskRowLike,
} from '../../../services/ai/tools/taskAggregates.js';

describe('normalizeStatusLabel', () => {
  it('maps common DB values to chart labels', () => {
    expect(normalizeStatusLabel('todo')).toBe('Open');
    expect(normalizeStatusLabel('open')).toBe('Open');
    expect(normalizeStatusLabel('in_progress')).toBe('In Progress');
    expect(normalizeStatusLabel('blocked')).toBe('Blocked');
    expect(normalizeStatusLabel('done')).toBe('Done');
  });
});

describe('computeTaskAggregates', () => {
  const monday = new Date('2025-03-24T12:00:00Z');

  it('counts byStatus and byPriority', () => {
    const tasks: TaskRowLike[] = [
      { status: 'todo', priority: 'high', due_date: '2025-03-26T12:00:00Z', is_overdue: false },
      { status: 'in_progress', priority: 'low', due_date: '2025-03-26T12:00:00Z', is_overdue: false },
      { status: 'blocked', priority: 'medium', due_date: null, is_overdue: false },
    ];
    const a = computeTaskAggregates(tasks, monday);
    expect(a.byStatus.Open).toBe(1);
    expect(a.byStatus['In Progress']).toBe(1);
    expect(a.byStatus.Blocked).toBe(1);
    expect(a.byPriority.high).toBe(1);
    expect(a.byPriority.low).toBe(1);
    expect(a.byPriority.medium).toBe(1);
  });

  it('places overdue in dueBuckets.overdue only', () => {
    const tasks: TaskRowLike[] = [
      { status: 'todo', priority: 'high', due_date: '2025-03-20T12:00:00Z', is_overdue: true },
    ];
    const a = computeTaskAggregates(tasks, monday);
    expect(a.dueBuckets.overdue).toBe(1);
    expect(a.dueBuckets.due_this_week).toBe(0);
    expect(a.dueBuckets.later).toBe(0);
  });

  it('counts due_this_week for non-overdue due dates in current week', () => {
    const tasks: TaskRowLike[] = [
      { status: 'todo', priority: 'normal', due_date: '2025-03-26T12:00:00Z', is_overdue: false },
    ];
    const a = computeTaskAggregates(tasks, monday);
    expect(a.dueBuckets.due_this_week).toBe(1);
    expect(a.dueBuckets.overdue).toBe(0);
  });

  it('counts no_due when due_date missing', () => {
    const tasks: TaskRowLike[] = [{ status: 'open', priority: '', is_overdue: false }];
    const a = computeTaskAggregates(tasks, monday);
    expect(a.dueBuckets.no_due).toBe(1);
  });
});
