/**
 * Chart-friendly self vs team comparison for get_employee_performance (first employee row).
 */

export interface ComparisonRow {
  key: string;
  label: string;
  self: number;
  team: number;
}

export interface PerformanceComparisonSeries {
  employeeName: string;
  period: string;
  rows: ComparisonRow[];
}

function n(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/**
 * Builds grouped-bar data: self metrics vs team averages (same units as SQL aggregates).
 */
export function buildPerformanceComparisonSeries(
  employees: Record<string, unknown>[],
  teamAverage: Record<string, unknown> | null,
  period: string,
): PerformanceComparisonSeries | null {
  if (!employees.length || !teamAverage) return null;
  const e = employees[0];
  const name = String(e.full_name ?? 'You');
  const rows: ComparisonRow[] = [
    {
      key: 'tasks_completed',
      label: 'Tasks completed',
      self: n(e.tasks_completed),
      team: n(teamAverage.avg_tasks_completed),
    },
    {
      key: 'xp',
      label: 'XP',
      self: n(e.xp),
      team: n(teamAverage.avg_xp),
    },
    {
      key: 'activities',
      label: 'Activities',
      self: n(e.activity_count),
      team: n(teamAverage.avg_activity_count),
    },
  ];
  return { employeeName: name, period, rows };
}
