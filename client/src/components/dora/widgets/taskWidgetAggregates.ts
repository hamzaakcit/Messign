import type { TaskRow } from '@/types/knowledge-hub/ai';

export interface TaskStatsPayload {
  total: number;
  overdue: number;
  highPriority: number;
}

export interface TaskAggregatesPayload {
  byStatus: Record<string, number>;
  byPriority: { high: number; medium: number; low: number; none: number };
  dueBuckets: { overdue: number; due_this_week: number; later: number; no_due: number };
}

export type TaskRowExt = TaskRow & { is_overdue?: boolean };

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

/** When server aggregates are absent, derive due buckets from row data (matches server/taskAggregates semantics). */
export function deriveDueBucketsFromTasks(tasks: TaskRowExt[], now: Date = new Date()): TaskAggregatesPayload['dueBuckets'] {
  const { start: weekStart, end: weekEnd } = getWeekBounds(now);
  const dueBuckets = { overdue: 0, due_this_week: 0, later: 0, no_due: 0 };
  for (const t of tasks) {
    if (t.is_overdue === true) {
      dueBuckets.overdue += 1;
      continue;
    }
    const rawDue = t.due_date;
    if (rawDue == null || rawDue === '') {
      dueBuckets.no_due += 1;
      continue;
    }
    const due = new Date(rawDue);
    if (Number.isNaN(due.getTime())) {
      dueBuckets.no_due += 1;
      continue;
    }
    if (due >= weekStart && due < weekEnd) dueBuckets.due_this_week += 1;
    else dueBuckets.later += 1;
  }
  return dueBuckets;
}

function normalizeStatusLabel(raw: string | undefined | null): string {
  const s = (raw ?? '').toLowerCase().trim();
  if (s === 'completed' || s === 'done' || s === 'closed') return 'Done';
  if (s === 'in_progress' || s === 'in-progress') return 'In Progress';
  if (s === 'blocked') return 'Blocked';
  if (s === 'todo' || s === 'open' || s === 'pending') return 'Open';
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Other';
}

/** Build pie segments from server byStatus or from task rows. */
export function buildStatusPieData(
  tasks: TaskRowExt[],
  byStatus?: Record<string, number> | null,
): Array<{ name: string; value: number }> {
  if (byStatus && Object.keys(byStatus).length > 0) {
    return Object.entries(byStatus)
      .map(([name, value]) => ({ name, value }))
      .filter((d) => d.value > 0);
  }
  const counts: Record<string, number> = {};
  for (const t of tasks) {
    const label = normalizeStatusLabel(t.status);
    counts[label] = (counts[label] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .filter((d) => d.value > 0);
}

export function topProjectsByCount(tasks: TaskRowExt[], limit: number = 5): Array<{ name: string; count: number }> {
  const m = new Map<string, number>();
  for (const t of tasks) {
    const p = (t.project_name ?? '').trim() || '—';
    m.set(p, (m.get(p) ?? 0) + 1);
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({
      name: name.length > 32 ? `${name.slice(0, 29)}…` : name,
      count,
    }));
}

export function deriveStatsFromTasks(tasks: TaskRowExt[]): TaskStatsPayload {
  const overdue = tasks.filter((t) => t.is_overdue === true).length;
  const highPriority = tasks.filter((t) =>
    ['critical', 'urgent', 'high'].includes((t.priority ?? '').toLowerCase()),
  ).length;
  return { total: tasks.length, overdue, highPriority };
}
