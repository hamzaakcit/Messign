import { query } from '../db/index.js';
import type { CallerContext, PaginatedResult, SortOptions } from './types.js';
import { paginationClause } from './helpers.js';

// ── Interfaces ──

export interface Employee {
  id: string;
  organization_id: string;
  auth_user_id: string | null;
  email: string;
  full_name: string;
  role: string;
  manager_id: string | null;
  job_title: string | null;
  xp: number | null;
  level: number | null;
  status: string | null;
  created_at: string;
  updated_at: string | null;
  team_name?: string | null;
}

export interface PerformanceData {
  employeeId: string;
  tasksCompleted: number;
  tasksActive: number;
  tasksOverdue: number;
  xp: number;
  level: number;
  badgesCount?: number;
  activityCount?: number;
  docsAuthored?: number;
}

export interface EmployeeFilters {
  role?: string;
  search?: string;
  managerId?: string;
}

export type UpdateEmployeeInput = Partial<Pick<Employee, 'full_name' | 'role' | 'job_title' | 'manager_id' | 'status'>>;

// ── RBAC for employees: own profile, manager sees team, dept_head sees department, admin sees all ──
function employeeWhereClause(
  ctx: CallerContext,
  paramOffset: number,
): { clause: string; params: unknown[] } {
  switch (ctx.role) {
    case 'employee':
      return { clause: `u.id = $${paramOffset}`, params: [ctx.userId] };
    case 'manager':
      return {
        clause: `(u.id = $${paramOffset} OR u.manager_id = $${paramOffset})`,
        params: [ctx.userId],
      };
    case 'dept_head':
      if (!ctx.departmentId) return { clause: '1=0', params: [] };
      return {
        clause: `u.auth_user_id IN (SELECT employee_id FROM performance_team_members WHERE team_id = $${paramOffset} AND is_active = TRUE)`,
        params: [ctx.departmentId],
      };
    case 'finance_admin':
    case 'system_admin':
      return { clause: '1=1', params: [] };
    default:
      return { clause: '1=0', params: [] };
  }
}

// ── DAL Functions ──

export async function listEmployees(
  ctx: CallerContext,
  filters?: EmployeeFilters,
  sort?: SortOptions,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResult<Employee>> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (ctx.organizationId) {
    conditions.push(`u.organization_id = $${idx++}`);
    params.push(ctx.organizationId);
  }

  const rbac = employeeWhereClause(ctx, idx);
  if (rbac.clause !== '1=1') {
    conditions.push(rbac.clause);
    params.push(...rbac.params);
    idx += rbac.params.length;
  }

  if (filters?.role) {
    conditions.push(`u.role = $${idx++}`);
    params.push(filters.role);
  }
  if (filters?.managerId) {
    conditions.push(`u.manager_id = $${idx++}`);
    params.push(filters.managerId);
  }
  if (filters?.search) {
    conditions.push(`(u.full_name ILIKE $${idx} OR u.email ILIKE $${idx})`);
    params.push(`%${filters.search}%`);
    idx++;
  }

  const whereSQL = conditions.join(' AND ');
  const sortCol: Record<string, string> = {
    full_name: 'u.full_name',
    email: 'u.email',
    role: 'u.role',
    created_at: 'u.created_at',
    xp: 'u.xp',
  };
  const orderBy = sortCol[sort?.field ?? 'full_name'] ?? 'u.full_name';
  const orderDir = sort?.direction === 'asc' ? 'ASC' : 'DESC';

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM reimbursement_users u WHERE ${whereSQL}`,
    params,
  );
  const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

  const pg = paginationClause(page, pageSize, idx);

  const dataResult = await query(
    `SELECT u.id, u.organization_id, u.auth_user_id, u.email, u.full_name, u.role, u.manager_id,
            u.job_title, u.xp, u.level, u.status, u.created_at::text AS created_at, u.updated_at::text AS updated_at,
            (SELECT pt.team_name FROM performance_team_members ptm
             JOIN performance_teams pt ON pt.id = ptm.team_id
             WHERE ptm.employee_id = u.auth_user_id AND ptm.is_active = TRUE LIMIT 1) AS team_name
     FROM reimbursement_users u
     WHERE ${whereSQL}
     ORDER BY ${orderBy} ${orderDir}
     ${pg.clause}`,
    [...params, ...pg.params],
  );

  return {
    data: dataResult.rows as Employee[],
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getEmployeeById(
  ctx: CallerContext,
  employeeId: string,
): Promise<Employee | null> {
  const conditions = ['u.id = $1'];
  const params: unknown[] = [employeeId];
  let idx = 2;

  if (ctx.organizationId) {
    conditions.push(`u.organization_id = $${idx++}`);
    params.push(ctx.organizationId);
  }

  const rbac = employeeWhereClause(ctx, idx);
  if (rbac.clause !== '1=1') {
    conditions.push(rbac.clause);
    params.push(...rbac.params);
  }

  const result = await query(
    `SELECT u.id, u.organization_id, u.auth_user_id, u.email, u.full_name, u.role, u.manager_id,
            u.job_title, u.xp, u.level, u.status, u.created_at::text AS created_at, u.updated_at::text AS updated_at,
            (SELECT pt.team_name FROM performance_team_members ptm
             JOIN performance_teams pt ON pt.id = ptm.team_id
             WHERE ptm.employee_id = u.auth_user_id AND ptm.is_active = TRUE LIMIT 1) AS team_name
     FROM reimbursement_users u
     WHERE ${conditions.join(' AND ')}`,
    params,
  );
  if (!result.rows[0]) return null;
  return result.rows[0] as Employee;
}

export async function getTeamMembers(ctx: CallerContext, managerId: string): Promise<Employee[]> {
  if (ctx.role === 'employee' && ctx.userId !== managerId) return [];
  if (ctx.role === 'manager' && ctx.userId !== managerId) return [];
  if (ctx.role === 'dept_head' && !ctx.departmentId) return [];

  const conditions = ['u.manager_id = $1'];
  const params: unknown[] = [managerId];
  let idx = 2;
  if (ctx.organizationId) {
    conditions.push(`u.organization_id = $${idx++}`);
    params.push(ctx.organizationId);
  }
  if (ctx.role === 'dept_head' && ctx.departmentId) {
    conditions.push(`u.auth_user_id IN (SELECT employee_id FROM performance_team_members WHERE team_id = $${idx} AND is_active = TRUE)`);
    params.push(ctx.departmentId);
    idx++;
  }

  const result = await query(
    `SELECT u.id, u.organization_id, u.auth_user_id, u.email, u.full_name, u.role, u.manager_id,
            u.job_title, u.xp, u.level, u.status, u.created_at::text AS created_at, u.updated_at::text AS updated_at,
            (SELECT pt.team_name FROM performance_team_members ptm JOIN performance_teams pt ON pt.id = ptm.team_id
             WHERE ptm.employee_id = u.auth_user_id AND ptm.is_active = TRUE LIMIT 1) AS team_name
     FROM reimbursement_users u
     WHERE ${conditions.join(' AND ')}
     ORDER BY u.full_name`,
    params,
  );
  return result.rows as Employee[];
}

export async function getDepartmentMembers(
  ctx: CallerContext,
  departmentId: string,
): Promise<Employee[]> {
  if (ctx.role === 'employee') return [];
  if (ctx.role === 'dept_head' && ctx.departmentId !== departmentId) return [];

  const conditions = [
    `u.auth_user_id IN (SELECT employee_id FROM performance_team_members WHERE team_id = $1 AND is_active = TRUE)`,
  ];
  const params: unknown[] = [departmentId];
  let idx = 2;
  if (ctx.organizationId) {
    conditions.push(`u.organization_id = $${idx++}`);
    params.push(ctx.organizationId);
  }

  const result = await query(
    `SELECT u.id, u.organization_id, u.auth_user_id, u.email, u.full_name, u.role, u.manager_id,
            u.job_title, u.xp, u.level, u.status, u.created_at::text AS created_at, u.updated_at::text AS updated_at,
            (SELECT pt.team_name FROM performance_team_members ptm JOIN performance_teams pt ON pt.id = ptm.team_id
             WHERE ptm.employee_id = u.auth_user_id AND ptm.is_active = TRUE LIMIT 1) AS team_name
     FROM reimbursement_users u
     WHERE ${conditions.join(' AND ')}
     ORDER BY u.full_name`,
    params,
  );
  return result.rows as Employee[];
}

export async function getEmployeePerformance(
  ctx: CallerContext,
  employeeId: string,
): Promise<PerformanceData | null> {
  const emp = await getEmployeeById(ctx, employeeId);
  if (!emp) return null;

  const assigneeId = emp.auth_user_id ?? emp.id;
  const tasksResult = await query<{ completed: string; active: string; overdue: string }>(
    `SELECT
       COUNT(*) FILTER (WHERE t.status IN ('completed', 'done'))::text AS completed,
       COUNT(*) FILTER (WHERE t.status NOT IN ('completed', 'done', 'cancelled'))::text AS active,
       COUNT(*) FILTER (WHERE t.due_date < NOW() AND t.status NOT IN ('completed', 'done', 'cancelled'))::text AS overdue
     FROM tasks t
     WHERE t.assignees @> jsonb_build_array($1::text)`,
    [assigneeId],
  );
  const row = tasksResult.rows[0];

  return {
    employeeId: emp.id,
    tasksCompleted: parseInt(row?.completed ?? '0', 10),
    tasksActive: parseInt(row?.active ?? '0', 10),
    tasksOverdue: parseInt(row?.overdue ?? '0', 10),
    xp: emp.xp ?? 0,
    level: emp.level ?? 1,
  };
}

export async function updateEmployee(
  ctx: CallerContext,
  employeeId: string,
  data: UpdateEmployeeInput,
): Promise<Employee> {
  const existing = await getEmployeeById(ctx, employeeId);
  if (!existing) throw new Error('Employee not found');
  if (ctx.role === 'employee' && ctx.userId !== employeeId) {
    throw new Error('Not authorized to update this employee');
  }

  const fields: [string, unknown][] = [
    ['full_name', data.full_name],
    ['role', data.role],
    ['job_title', data.job_title],
    ['manager_id', data.manager_id],
    ['status', data.status],
  ];
  const setParts: string[] = [];
  const setParams: unknown[] = [];
  let idx = 1;
  for (const [col, val] of fields) {
    if (val === undefined) continue;
    setParts.push(`${col} = $${idx++}`);
    setParams.push(val);
  }
  if (setParts.length === 0) return existing;
  setParts.push(`updated_at = NOW()`);
  setParams.push(employeeId);

  await query(
    `UPDATE reimbursement_users SET ${setParts.join(', ')} WHERE id = $${idx}`,
    setParams,
  );
  const updated = await getEmployeeById(ctx, employeeId);
  if (!updated) throw new Error('Employee not found after update');
  return updated;
}
