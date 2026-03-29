/**
 * Aggregates for projects:get_project_status (Dora project status widget).
 */

export interface ProjectStatusAggregates {
  projectCount: number;
  /** Mean of per-project completion % */
  avgCompletion: number;
  totalTasks: number;
  completedTasks: number;
}

/**
 * Rolls up enriched project rows from get_project_status.
 */
export function computeProjectStatusAggregates(projects: Record<string, unknown>[]): ProjectStatusAggregates {
  if (projects.length === 0) {
    return { projectCount: 0, avgCompletion: 0, totalTasks: 0, completedTasks: 0 };
  }
  let sumCompletion = 0;
  let totalTasks = 0;
  let completedTasks = 0;
  for (const p of projects) {
    sumCompletion += Number(p.completionPercentage ?? 0);
    const ts = p.taskStats as Record<string, unknown> | undefined;
    if (ts) {
      totalTasks += Number(ts.total ?? 0);
      completedTasks += Number(ts.completed ?? 0);
    }
  }
  const n = projects.length;
  return {
    projectCount: n,
    avgCompletion: n > 0 ? Math.round(sumCompletion / n) : 0,
    totalTasks,
    completedTasks,
  };
}

/**
 * Normalizes tool `data` — legacy array or `{ projects, aggregates }` from get_project_status.
 */
export function projectsFromProjectStatusData(data: unknown): unknown[] {
  if (data == null) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === 'object' && Array.isArray((data as Record<string, unknown>).projects)) {
    return (data as Record<string, unknown>).projects as unknown[];
  }
  return [];
}
