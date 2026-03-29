/**
 * Chart-friendly aggregates for get_tasks_by_user (single source of truth for widgets).
 */

export interface TaskAggregates {
  byStatus: Record<string, number>;
  byPriority: { high: number; medium: number; low: number; none: number };
  dueBuckets: { overdue: number; due_this_week: number; later: number; no_due: number };
}

export interface TaskRowLike {
  status?: string | null;
  priority?: string | null;
  due_date?: string | Date | null;
  is_overdue?: boolean | null;
}

/**
 * Normalizes raw DB status for pie chart labels (aligned with TaskTableWidget badges).
 */
export function normalizeStatusLabel(raw: string | undefined | null): string {
  const s = (raw ?? '').toLowerCase().trim();
  if (s === 'completed' || s === 'done' || s === 'closed') return 'Done';
  if (s === 'in_progress' || s === 'in-progress') return 'In Progress';
  if (s === 'blocked') return 'Blocked';
  if (s === 'todo' || s === 'open' || s === 'pending') return 'Open';
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Other';
}

function getWeekBounds(now: Date): { start: Date; end: Date } {
  const start = new Date(now);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

/**
 * Computes status mix, priority counts, and due-date buckets for task widgets.
 */
export function computeTaskAggregates(tasks: TaskRowLike[], now: Date = new Date()): TaskAggregates {
  const byStatus: Record<string, number> = {};
  const byPriority = { high: 0, medium: 0, low: 0, none: 0 };
  const dueBuckets = { overdue: 0, due_this_week: 0, later: 0, no_due: 0 };
  const { start: weekStart, end: weekEnd } = getWeekBounds(now);

  for (const t of tasks) {
    const label = normalizeStatusLabel(t.status ?? undefined);
    byStatus[label] = (byStatus[label] ?? 0) + 1;

    const pri = (t.priority ?? '').toLowerCase().trim();
    if (pri === 'critical' || pri === 'urgent' || pri === 'high') byPriority.high += 1;
    else if (pri === 'medium' || pri === 'normal') byPriority.medium += 1;
    else if (pri === 'low') byPriority.low += 1;
    else byPriority.none += 1;

    if (t.is_overdue === true) {
      dueBuckets.overdue += 1;
      continue;
    }

    const rawDue = t.due_date;
    if (rawDue == null || rawDue === '') {
      dueBuckets.no_due += 1;
      continue;
    }

    const due = rawDue instanceof Date ? rawDue : new Date(rawDue);
    if (Number.isNaN(due.getTime())) {
      dueBuckets.no_due += 1;
      continue;
    }

    if (due >= weekStart && due < weekEnd) dueBuckets.due_this_week += 1;
    else dueBuckets.later += 1;
  }

  return { byStatus, byPriority, dueBuckets };
}
