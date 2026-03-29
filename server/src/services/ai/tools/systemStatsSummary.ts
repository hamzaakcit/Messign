/**
 * Short plain-text summaries for `analytics:get_system_stats` (no markdown).
 */

/**
 * Builds a one-line platform overview for chat surfaces.
 */
export function buildShortSystemStatsSummary(
  users: Record<string, unknown>,
  tasks: Record<string, unknown>,
  projects: Record<string, unknown>,
  documents: Record<string, unknown>,
  activities: Record<string, unknown>,
  options?: { detailSuffix?: string },
): string {
  const totalTasks = Number(tasks.total ?? 0);
  const completed = Number(tasks.completed ?? 0);
  const rate = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0;
  const activeUsers = Number(users.active ?? 0);
  const totalUsers = Number(users.total ?? 0);
  const activeProjects = Number(projects.active ?? 0);
  const totalProjects = Number(projects.total ?? 0);
  const docTotal = Number(documents.total ?? 0);
  const actWeek = Number(activities.this_week ?? 0);

  let line = `Platform overview: ${activeUsers} active users (${totalUsers} total), ${activeProjects} active projects (${totalProjects} total), ${totalTasks} tasks (${rate}% completed), ${docTotal} knowledge docs, ${actWeek} activities this week.`;
  const suf = options?.detailSuffix?.trim();
  if (suf) line = `${line} ${suf}`;
  return line;
}
