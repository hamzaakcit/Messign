/**
 * Aggregates for people:get_team_overview (Dora team widget).
 */

export interface TeamOverviewAggregates {
  teamCount: number;
  totalMembers: number;
  /** Member-weighted average completion % across teams */
  avgCompletion: number;
  totalTasks: number;
  completedTasks: number;
}

/**
 * Rolls up team metric rows for KPIs and charts.
 */
export function computeTeamOverviewAggregates(teamMetrics: Record<string, unknown>[]): TeamOverviewAggregates {
  if (teamMetrics.length === 0) {
    return { teamCount: 0, totalMembers: 0, avgCompletion: 0, totalTasks: 0, completedTasks: 0 };
  }
  let totalMembers = 0;
  let completionSum = 0;
  let completionWeight = 0;
  let totalTasks = 0;
  let completedTasks = 0;

  for (const tm of teamMetrics) {
    const mc = Number(tm.memberCount ?? 0);
    const cr = Number(tm.completionRate ?? 0);
    const ts = tm.taskStats as Record<string, unknown> | null | undefined;
    totalMembers += mc;
    if (mc > 0) {
      completionSum += cr * mc;
      completionWeight += mc;
    }
    if (ts) {
      totalTasks += Number(ts.total ?? 0);
      completedTasks += Number(ts.completed ?? 0);
    }
  }
  const avgCompletion = completionWeight > 0 ? Math.round(completionSum / completionWeight) : 0;
  return {
    teamCount: teamMetrics.length,
    totalMembers,
    avgCompletion,
    totalTasks,
    completedTasks,
  };
}

/**
 * One-line summary for chat (no markdown bullets).
 */
export function buildShortTeamOverviewSummary(
  teamMetrics: Record<string, unknown>[],
  timePeriod: string,
  aggregates: TeamOverviewAggregates,
): string {
  const pl = timePeriod.replace(/_/g, ' ');
  if (teamMetrics.length === 0) {
    return `No team data for this period (${pl}).`;
  }
  if (teamMetrics.length === 1) {
    const t = teamMetrics[0];
    const n = String(t?.name ?? 'Team');
    return `${n}: ${aggregates.totalMembers} members, ${aggregates.avgCompletion}% avg completion (${pl}).`;
  }
  return `${aggregates.teamCount} teams, ${aggregates.totalMembers} members, ${aggregates.avgCompletion}% avg completion (${pl}).`;
}
