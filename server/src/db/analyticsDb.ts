import { query } from './index.js';

const DEFAULT_ORG_SLUG = 'messign';
const DEFAULT_MAX_PROJECTS = 5;

export interface TalentHeatmapUser {
  id: string;
  name: string;
  avatar: string;
  currentProjects: number;
  maxProjects: number;
  benchStatus: string;
  activeBounties: number;
  activeSprints: number;
}

export interface TalentHeatmapDepartment {
  department: { id: string; name: string; color?: string };
  metrics: {
    totalEmployees: number;
    totalCapacity: number;
    usedCapacity: number;
    utilizationRate: number;
    overloaded: number;
    available: number;
    bench: number;
    marketplaceActive: number;
    activeProjects: number;
    pendingApplications: number;
  };
  users: TalentHeatmapUser[];
  health: 'UNDERUTILIZED' | 'HEALTHY' | 'OVERLOADED';
}

export async function getTalentHeatmap(): Promise<{
  departments: TalentHeatmapDepartment[];
  summary: {
    totalEmployees: number;
    totalCapacity: number;
    totalUsed: number;
    overloadedCount: number;
    benchCount: number;
    avgUtilization: number;
  };
}> {
  const orgResult = await query<{ id: string }>(
    `SELECT id FROM organizations WHERE slug = $1 LIMIT 1`,
    [DEFAULT_ORG_SLUG]
  );
  const orgId = orgResult.rows[0]?.id;
  if (!orgId) {
    return { departments: [], summary: { totalEmployees: 0, totalCapacity: 0, totalUsed: 0, overloadedCount: 0, benchCount: 0, avgUtilization: 0 } };
  }

  const teamsResult = await query<{ id: string; team_name: string }>(
    `SELECT id::text AS id, team_name FROM performance_teams WHERE is_active = TRUE ORDER BY team_name`
  );
  const departments: TalentHeatmapDepartment[] = [];
  const colors: Record<string, string> = {};
  const colorList = ['#63B3ED', '#F6AD55', '#ED64A6', '#48BB78', '#9F7AEA', '#ED8936'];
  let ti = 0;
  for (const team of teamsResult.rows) {
    colors[team.id] = colorList[ti % colorList.length] ?? '#888';
    ti++;
  }

  for (const team of teamsResult.rows) {
    const membersResult = await query<{ auth_user_id: string; full_name: string }>(
      `SELECT ptm.employee_id AS auth_user_id, ru.full_name
       FROM performance_team_members ptm
       JOIN reimbursement_users ru ON ru.auth_user_id = ptm.employee_id AND ru.organization_id = $1
       WHERE ptm.team_id::text = $2 AND ptm.is_active = TRUE`,
      [orgId, team.id]
    );

    const users: TalentHeatmapUser[] = [];
    let usedCapacity = 0;
    const maxProjects = DEFAULT_MAX_PROJECTS;

    for (const m of membersResult.rows) {
      const uid = m.auth_user_id;
      const projectsCount = await query<{ count: string }>(
        `SELECT COUNT(*)::int AS count FROM projects
         WHERE status IN ('active', 'recruiting') AND team @> to_jsonb($1::text)`,
        [uid]
      );
      const bountiesCount = await query<{ count: string }>(
        `SELECT COUNT(*)::int AS count FROM bounties
         WHERE claimed_by = $1 AND status IN ('CLAIMED', 'SUBMITTED')`,
        [uid]
      );
      const sprintsCount = await query<{ count: string }>(
        `SELECT COUNT(*)::int AS count FROM sprint_helpers sh
         JOIN sprint_requests sr ON sr.id = sh.sprint_id
         WHERE sh.user_id = $1 AND sr.status IN ('ACTIVE', 'IN_PROGRESS')`,
        [uid]
      );
      const currentProjects = Number(projectsCount.rows[0]?.count ?? 0);
      usedCapacity += currentProjects;
      users.push({
        id: uid,
        name: m.full_name,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(uid)}`,
        currentProjects,
        maxProjects,
        benchStatus: currentProjects >= maxProjects ? 'OVERLOADED' : currentProjects === 0 ? 'AVAILABLE' : 'BUSY',
        activeBounties: Number(bountiesCount.rows[0]?.count ?? 0),
        activeSprints: Number(sprintsCount.rows[0]?.count ?? 0),
      });
    }

    const totalCapacity = membersResult.rows.length * maxProjects;
    const utilizationRate = totalCapacity > 0 ? Math.round((usedCapacity / totalCapacity) * 100) : 0;
    const overloaded = users.filter((u) => u.currentProjects >= maxProjects).length;
    const available = users.filter((u) => u.currentProjects < maxProjects - 1).length;
    const bench = users.filter((u) => u.currentProjects === 0).length;
    const marketplaceActive = users.filter((u) => u.activeBounties > 0 || u.activeSprints > 0).length;

    const activeProjectsResult = await query<{ count: string }>(
      `SELECT COUNT(DISTINCT p.id)::int AS count FROM projects p
       JOIN performance_team_members ptm ON ptm.team_id::text = $1 AND ptm.is_active = TRUE
         AND p.team @> to_jsonb(ptm.employee_id::text)
       WHERE p.status IN ('active', 'recruiting')`,
      [team.id]
    );
    const pendingAppsResult = await query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM project_applications pa
       JOIN performance_team_members ptm ON ptm.employee_id = pa.user_id AND ptm.team_id::text = $1 AND ptm.is_active = TRUE
       WHERE pa.status = 'pending'`,
      [team.id]
    );

    const health: 'UNDERUTILIZED' | 'HEALTHY' | 'OVERLOADED' =
      utilizationRate < 60 ? 'UNDERUTILIZED' : utilizationRate < 85 ? 'HEALTHY' : 'OVERLOADED';

    departments.push({
      department: { id: team.id, name: team.team_name, color: colors[team.id] },
      metrics: {
        totalEmployees: membersResult.rows.length,
        totalCapacity,
        usedCapacity,
        utilizationRate,
        overloaded,
        available,
        bench,
        marketplaceActive,
        activeProjects: Number(activeProjectsResult.rows[0]?.count ?? 0),
        pendingApplications: Number(pendingAppsResult.rows[0]?.count ?? 0),
      },
      users,
      health,
    });
  }

  const summary = {
    totalEmployees: departments.reduce((s, d) => s + d.metrics.totalEmployees, 0),
    totalCapacity: departments.reduce((s, d) => s + d.metrics.totalCapacity, 0),
    totalUsed: departments.reduce((s, d) => s + d.metrics.usedCapacity, 0),
    overloadedCount: departments.reduce((s, d) => s + d.metrics.overloaded, 0),
    benchCount: departments.reduce((s, d) => s + d.metrics.bench, 0),
    avgUtilization:
      departments.length > 0
        ? Math.round(departments.reduce((s, d) => s + d.metrics.utilizationRate, 0) / departments.length)
        : 0,
  };

  return { departments, summary };
}
