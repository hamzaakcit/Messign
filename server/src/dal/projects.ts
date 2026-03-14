import type { PoolClient } from 'pg';
import { withTenantQuery } from '../middleware/tenantContext.js';
import { eventBus } from '../events/index.js';
import type { CallerContext, PaginatedResult, SortOptions } from './types.js';
import { paginationClause } from './helpers.js';
import type { Project, Task } from '../types/index.js';
import { addTask, getTaskById as dbGetTaskById, updateTaskStatus } from '../db/tasksDb.js';
import { getProjectById as dbGetProjectById } from '../db/projectsDb.js';
import { getSprintRequestById, getSprintHelpers } from '../db/sprintsDb.js';
import type { SprintRequestRow } from '../db/sprintsDb.js';

async function runInTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTenantQuery(tenantId, fn);
}

// ── Interfaces ──

export interface ProjectFilters {
  status?: string;
  search?: string;
}

export interface TaskFilters {
  projectId?: string;
  status?: string;
  assigneeId?: string;
  search?: string;
}

export interface CreateTaskInput {
  projectId: string;
  title: string;
  description?: string;
  status?: string;
  assignees?: string[];
  tags?: string[];
  dueDate?: string;
  xpReward?: number;
  priority?: string;
}

export interface SprintStatus {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: string;
  starts_at: string;
  ends_at: string;
  xp_reward: number;
  max_helpers: number;
  helper_count: number;
  requester_id: string;
  resolved_at: string | null;
  resolution_note: string | null;
  helpers?: { user_id: string; joined_at: string; contribution: string | null; xp_earned: number }[];
}

// Resolve caller's auth_user_id for task assignee checks (tasks.assignees stores auth_user_id).
async function getCallerAuthUserId(client: PoolClient, ctx: CallerContext): Promise<string | null> {
  if (!ctx.organizationId) return null;
  const r = await client.query<{ auth_user_id: string | null }>(
    `SELECT auth_user_id FROM reimbursement_users WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [ctx.userId, ctx.organizationId],
  );
  const row = r.rows[0];
  return row?.auth_user_id ?? null;
}

// RBAC: employee sees tasks assigned to them; manager sees team tasks; admin sees all.
function taskWhereClause(
  ctx: CallerContext,
  authUserId: string | null,
  paramOffset: number,
): { clause: string; params: unknown[] } {
  switch (ctx.role) {
    case 'employee':
      if (!authUserId) return { clause: '1=0', params: [] };
      return {
        clause: `t.assignees @> jsonb_build_array($${paramOffset}::text)`,
        params: [authUserId],
      };
    case 'manager':
      return {
        clause: `(t.assignees @> jsonb_build_array($${paramOffset}::text) OR EXISTS (SELECT 1 FROM reimbursement_users ru WHERE ru.manager_id = $${paramOffset + 1} AND ru.auth_user_id IS NOT NULL AND t.assignees ? ru.auth_user_id::text))`,
        params: [authUserId ?? ctx.userId, ctx.userId],
      };
    case 'dept_head':
    case 'finance_admin':
    case 'system_admin':
      return { clause: '1=1', params: [] };
    default:
      return { clause: '1=0', params: [] };
  }
}

// ── DAL Functions ──

export async function listProjects(
  ctx: CallerContext,
  filters?: ProjectFilters,
  sort?: SortOptions,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResult<Project>> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for listProjects');

  return runInTenant(tenantId, async (client) => {
    const authUserId = await getCallerAuthUserId(client, ctx);
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (ctx.role === 'employee' || ctx.role === 'manager') {
      if (!authUserId && ctx.role === 'employee') {
        const countResult = await client.query<{ count: string }>(`SELECT COUNT(*) as count FROM projects WHERE 1=0`, []);
        const total = parseInt(countResult.rows[0]?.count ?? '0', 10);
        return { data: [], total, page, pageSize, totalPages: 0 };
      }
      conditions.push(
        `(p.id IN (SELECT DISTINCT project_id FROM tasks t WHERE t.assignees @> jsonb_build_array($${idx}::text)) OR p.team @> jsonb_build_array($${idx}::text))`,
      );
      params.push(authUserId ?? ctx.userId);
      idx++;
    }

    if (filters?.status) {
      conditions.push(`p.status = $${idx++}`);
      params.push(filters.status);
    }
    if (filters?.search) {
      conditions.push(`(p.name ILIKE $${idx} OR p.description ILIKE $${idx})`);
      params.push(`%${filters.search}%`);
      idx++;
    }

    const whereSQL = conditions.length ? conditions.join(' AND ') : '1=1';
    const sortCol: Record<string, string> = {
      name: 'p.name',
      status: 'p.status',
      created_at: 'p.created_at',
      due_date: 'p.due_date',
    };
    const orderBy = sortCol[sort?.field ?? 'created_at'] ?? 'p.created_at';
    const orderDir = sort?.direction === 'asc' ? 'ASC' : 'DESC';

    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM projects p WHERE ${whereSQL}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const pg = paginationClause(page, pageSize, idx);

    const dataResult = await client.query(
      `SELECT p.id, p.name, p.description, p.type, COALESCE(p.progress, 0)::int AS progress,
            COALESCE(p.team, '[]')::jsonb AS team, COALESCE(p.capacity, '{"current":0,"max":5}')::jsonb AS capacity,
            p.status, p.due_date::text AS due_date, p.created_at::text AS created_at
     FROM projects p
     WHERE ${whereSQL}
     ORDER BY ${orderBy} ${orderDir}
     ${pg.clause}`,
      [...params, ...pg.params],
    );

    const data = dataResult.rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? '',
      type: r.type ?? 'product',
      progress: Number(r.progress ?? 0),
      team: Array.isArray(r.team) ? r.team : [],
      capacity: r.capacity && typeof r.capacity === 'object' ? (r.capacity as { current: number; max: number }) : { current: 0, max: 5 },
      status: r.status,
      dueDate: r.due_date ?? undefined,
      createdAt: r.created_at,
    })) as Project[];

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  });
}

export async function getProjectById(ctx: CallerContext, projectId: string): Promise<Project | null> {
  const project = await dbGetProjectById(projectId);
  if (!project) return null;

  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getProjectById');

  if (ctx.role !== 'system_admin' && ctx.role !== 'finance_admin' && ctx.role !== 'dept_head') {
    const allowed = await runInTenant(tenantId, async (client) => {
      const authUserId = await getCallerAuthUserId(client, ctx);
      const idForCheck = authUserId ?? ctx.userId;
      const check = await client.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM tasks t WHERE t.project_id = $1 AND t.assignees @> jsonb_build_array($2::text)`,
        [projectId, idForCheck],
      );
      const inTeam = project.team?.includes(idForCheck);
      return parseInt(check.rows[0]?.n ?? '0', 10) > 0 || inTeam;
    });
    if (!allowed) return null;
  }

  return project;
}

export async function listTasks(
  ctx: CallerContext,
  filters?: TaskFilters,
  sort?: SortOptions,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResult<Task>> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for listTasks');

  return runInTenant(tenantId, async (client) => {
    const authUserId = await getCallerAuthUserId(client, ctx);
    const taskRbac = taskWhereClause(ctx, authUserId, 1);
    const conditions: string[] = [taskRbac.clause];
    const params: unknown[] = [...taskRbac.params];
    let idx = params.length + 1;

    if (filters?.projectId) {
      conditions.push(`t.project_id = $${idx++}`);
      params.push(filters.projectId);
    }
    if (filters?.status) {
      conditions.push(`t.status = $${idx++}`);
      params.push(filters.status);
    }
    if (filters?.search) {
      conditions.push(`(t.title ILIKE $${idx} OR t.description ILIKE $${idx})`);
      params.push(`%${filters.search}%`);
      idx++;
    }

    const whereSQL = conditions.join(' AND ');
    const sortCol: Record<string, string> = {
      title: 't.title',
      status: 't.status',
      due_date: 't.due_date',
      created_at: 't.created_at',
      completed_at: 't.completed_at',
    };
    const orderBy = sortCol[sort?.field ?? 'created_at'] ?? 't.created_at';
    const orderDir = sort?.direction === 'asc' ? 'ASC' : 'DESC';

    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM tasks t WHERE ${whereSQL}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const pg = paginationClause(page, pageSize, idx);

    const dataResult = await client.query(
      `SELECT t.id, t.project_id, t.title, t.description, t.status, COALESCE(t.assignees, '[]')::jsonb AS assignees,
            COALESCE(t.tags, '[]')::jsonb AS tags, t.due_date::text, COALESCE(t.xp_reward, 50)::int AS xp_reward,
            t.priority, t.created_at::text, t.completed_at::text
     FROM tasks t
     WHERE ${whereSQL}
     ORDER BY ${orderBy} ${orderDir}
     ${pg.clause}`,
      [...params, ...pg.params],
    );

    const data = dataResult.rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      projectId: r.project_id,
      title: r.title,
      description: r.description ?? '',
      status: r.status,
      assignees: Array.isArray(r.assignees) ? r.assignees : [],
      tags: Array.isArray(r.tags) ? r.tags : [],
      dueDate: r.due_date ?? undefined,
      xpReward: Number(r.xp_reward ?? 50),
      priority: r.priority ?? 'medium',
      createdAt: r.created_at,
      completedAt: r.completed_at ?? undefined,
    })) as Task[];

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  });
}

export async function getTaskById(ctx: CallerContext, taskId: string): Promise<Task | null> {
  const task = await dbGetTaskById(taskId);
  if (!task) return null;

  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getTaskById');

  if (ctx.role !== 'system_admin' && ctx.role !== 'finance_admin' && ctx.role !== 'dept_head') {
    const allowed = await runInTenant(tenantId, async (client) => {
      const authUserId = await getCallerAuthUserId(client, ctx);
      const isAssigned = task.assignees?.includes(authUserId ?? '') || task.assignees?.includes(ctx.userId);
      if (!isAssigned && ctx.role === 'employee') return false;
      if (ctx.role === 'manager' && !isAssigned && (task.assignees?.length ?? 0) > 0) {
        const isReport = await client.query<{ n: string }>(
          `SELECT COUNT(*)::text AS n FROM reimbursement_users WHERE manager_id = $1 AND auth_user_id = ANY($2::text[])`,
          [ctx.userId, task.assignees ?? []],
        );
        if (parseInt(isReport.rows[0]?.n ?? '0', 10) === 0) return false;
      }
      return true;
    });
    if (!allowed) return null;
  }

  return task;
}

export async function createTask(ctx: CallerContext, data: CreateTaskInput): Promise<Task> {
  const project = await getProjectById(ctx, data.projectId);
  if (!project) throw new Error('Project not found');

  const task = await addTask({
    projectId: data.projectId,
    title: data.title,
    description: data.description ?? '',
    status: (data.status as Task['status']) ?? 'todo',
    assignees: data.assignees ?? [],
    tags: data.tags ?? [],
    dueDate: data.dueDate,
    xpReward: data.xpReward ?? 50,
    priority: (data.priority as Task['priority']) ?? 'medium',
    createdAt: new Date().toISOString(),
  });

  eventBus.emit('project.task.created', {
    taskId: task.id,
    projectId: data.projectId,
    assigneeId: data.assignees?.[0],
    title: data.title,
  });

  return task;
}

export async function completeTask(ctx: CallerContext, taskId: string): Promise<Task> {
  const task = await getTaskById(ctx, taskId);
  if (!task) throw new Error('Task not found');

  const updated = await updateTaskStatus(taskId, 'done');
  if (!updated) throw new Error('Task not found after update');

  eventBus.emit('project.task.completed', {
    taskId,
    projectId: task.projectId,
    completedBy: ctx.userId,
    xpAwarded: updated.xpReward,
  });

  return updated;
}

export async function getSprintStatus(ctx: CallerContext, sprintId: string): Promise<SprintStatus | null> {
  const sprint = await getSprintRequestById(sprintId);
  if (!sprint) return null;

  const helpers = await getSprintHelpers(sprintId);
  const project = await dbGetProjectById(sprint.project_id);
  if (ctx.role !== 'system_admin' && ctx.role !== 'finance_admin') {
    const tenantId = ctx.organizationId;
    if (!tenantId) throw new Error('Tenant context required for getSprintStatus');
    const allowed = await runInTenant(tenantId, async (client) => {
      const authUserId = await getCallerAuthUserId(client, ctx);
      const inProject = project?.team?.includes(authUserId ?? ctx.userId) ?? false;
      const isHelper = helpers.some((h) => h.user_id === authUserId || h.user_id === ctx.userId);
      const isRequester = sprint.requester_id === authUserId || sprint.requester_id === ctx.userId;
      return inProject || isHelper || isRequester;
    });
    if (!allowed) return null;
  }

  const helperCount = helpers.length;
  return {
    id: (sprint as SprintRequestRow).id,
    project_id: sprint.project_id,
    title: sprint.title,
    description: sprint.description ?? '',
    status: sprint.status,
    starts_at: sprint.starts_at,
    ends_at: sprint.ends_at,
    xp_reward: sprint.xp_reward ?? 100,
    max_helpers: sprint.max_helpers ?? 3,
    helper_count: helperCount,
    requester_id: sprint.requester_id,
    resolved_at: sprint.resolved_at ?? null,
    resolution_note: sprint.resolution_note ?? null,
    helpers: helpers.map((h) => ({
      user_id: h.user_id,
      joined_at: h.joined_at,
      contribution: h.contribution,
      xp_earned: h.xp_earned ?? 0,
    })),
  };
}
