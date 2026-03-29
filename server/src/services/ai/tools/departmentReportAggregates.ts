/**
 * Aggregates and short summaries for `analytics:get_department_report`.
 */

export interface DepartmentReportAggregates {
  activeEmployees: number;
  activeProjects: number;
  reimbursementTotal: number;
  pendingReimbursementCount: number;
  knowledgeDocs: number;
  periodActions: number;
}

/**
 * Derives KPI rollups from the assembled `report` sections.
 */
export function computeDepartmentReportAggregates(report: Record<string, unknown>): DepartmentReportAggregates {
  const people = report.people as Record<string, unknown> | undefined;
  const projects = report.projects as Record<string, unknown> | undefined;
  const finance = report.finance as Record<string, unknown> | undefined;
  const knowledge = report.knowledge as Record<string, unknown> | undefined;
  const activity = report.activity as Record<string, unknown> | undefined;

  return {
    activeEmployees: Number(people?.active ?? 0),
    activeProjects: Number(projects?.active ?? 0),
    reimbursementTotal: parseFloat(String(finance?.total_amount ?? 0)) || 0,
    pendingReimbursementCount: Number(finance?.pending_count ?? 0),
    knowledgeDocs: Number(knowledge?.total_docs ?? 0),
    periodActions: Number(activity?.total ?? 0),
  };
}

/**
 * One-line chat summary (no markdown).
 */
export function buildShortDepartmentReportSummary(
  timePeriod: string,
  aggregates: DepartmentReportAggregates,
): string {
  const pl = timePeriod.replace(/_/g, ' ');
  const money = aggregates.reimbursementTotal.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
  return `Executive report (${pl}): ${aggregates.activeEmployees} active employees, ${aggregates.activeProjects} active projects, ${money} reimbursements (${aggregates.pendingReimbursementCount} pending), ${aggregates.knowledgeDocs} knowledge docs, ${aggregates.periodActions} activities.`;
}
