import type { PoolClient } from 'pg';
import { withTenantQuery } from '../middleware/tenantContext.js';
import { eventBus } from '../events/index.js';
import { emitToUser } from '../sockets/index.js';
import type { CallerContext } from './types.js';

async function runInTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTenantQuery(tenantId, fn);
}

// ── Interfaces ──

export interface OKRPeriod {
  id: string;
  organization_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
}

export interface KeyResult {
  id: string;
  goal_id: string;
  title: string;
  metric_type: 'number' | 'percentage' | 'currency' | 'boolean';
  target_value: number;
  current_value: number;
  start_value: number;
  unit: string | null;
  auto_source: string | null;
  progress: number;
  created_at: string;
  updated_at: string;
  check_ins?: CheckIn[];
}

export interface Goal {
  id: string;
  organization_id: string;
  period_id: string;
  parent_goal_id: string | null;
  owner_id: string;
  level: 'company' | 'department' | 'team' | 'individual';
  department_id: string | null;
  title: string;
  description: string | null;
  progress: number;
  status: 'on_track' | 'at_risk' | 'behind' | 'completed';
  created_at: string;
  updated_at: string;
  owner_name?: string;
  key_results?: KeyResult[];
  children?: Goal[];
}

export interface CheckIn {
  id: string;
  key_result_id: string;
  user_id: string;
  value: number;
  note: string | null;
  confidence: 'high' | 'medium' | 'low' | null;
  created_at: string;
  user_name?: string;
}

export interface OKRMetrics {
  totalGoals: number;
  onTrack: number;
  atRisk: number;
  behind: number;
  completed: number;
  avgProgress: number;
}

export interface CreateGoalInput {
  period_id: string;
  parent_goal_id?: string;
  level: 'company' | 'department' | 'team' | 'individual';
  department_id?: string;
  title: string;
  description?: string;
}

export interface CreateKeyResultInput {
  title: string;
  metric_type?: 'number' | 'percentage' | 'currency' | 'boolean';
  target_value: number;
  start_value?: number;
  unit?: string;
  auto_source?: string;
}

// ── Functions ──

export async function listPeriods(ctx: CallerContext): Promise<OKRPeriod[]> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for listPeriods');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(`SELECT * FROM okr_periods ORDER BY start_date DESC`, []);
    return result.rows as OKRPeriod[];
  });
}

export async function listGoals(
  ctx: CallerContext,
  periodId?: string,
  level?: string,
  parentGoalId?: string,
): Promise<Goal[]> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for listGoals');

  return runInTenant(tenantId, async (client) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (periodId) {
      conditions.push(`g.period_id = $${idx++}`);
      params.push(periodId);
    }
    if (level) {
      conditions.push(`g.level = $${idx++}`);
      params.push(level);
    }
    if (parentGoalId) {
      conditions.push(`g.parent_goal_id = $${idx++}`);
      params.push(parentGoalId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await client.query(
      `SELECT g.*, u.full_name as owner_name
       FROM okr_goals g
       LEFT JOIN reimbursement_users u ON u.id = g.owner_id
       ${where}
       ORDER BY g.level, g.title`,
      params,
    );

    const goals = result.rows as Goal[];

    for (const goal of goals) {
      const krs = await client.query('SELECT * FROM okr_key_results WHERE goal_id = $1 ORDER BY created_at', [goal.id]);
      goal.key_results = krs.rows as KeyResult[];
    }

    return goals;
  });
}

export async function getGoalTree(ctx: CallerContext, periodId: string): Promise<Goal[]> {
  const allGoals = await listGoals(ctx, periodId);

  const goalMap = new Map<string, Goal>();
  for (const g of allGoals) {
    g.children = [];
    goalMap.set(g.id, g);
  }

  const roots: Goal[] = [];
  for (const g of allGoals) {
    if (g.parent_goal_id && goalMap.has(g.parent_goal_id)) {
      goalMap.get(g.parent_goal_id)!.children!.push(g);
    } else {
      roots.push(g);
    }
  }

  return roots;
}

export async function getGoalById(ctx: CallerContext, goalId: string): Promise<Goal | null> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getGoalById');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `SELECT g.*, u.full_name as owner_name
       FROM okr_goals g
       LEFT JOIN reimbursement_users u ON u.id = g.owner_id
       WHERE g.id = $1`,
      [goalId],
    );
    if (!result.rows[0]) return null;

    const goal = result.rows[0] as Goal;

    const krs = await client.query('SELECT * FROM okr_key_results WHERE goal_id = $1 ORDER BY created_at', [goalId]);
    goal.key_results = krs.rows as KeyResult[];

    for (const kr of goal.key_results) {
      const cis = await client.query(
        `SELECT c.*, u.full_name as user_name
         FROM okr_check_ins c
         LEFT JOIN reimbursement_users u ON u.id = c.user_id
         WHERE c.key_result_id = $1
         ORDER BY c.created_at DESC`,
        [kr.id],
      );
      kr.check_ins = cis.rows as CheckIn[];
    }

    return goal;
  });
}

export async function createGoal(ctx: CallerContext, data: CreateGoalInput): Promise<Goal> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for createGoal');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `INSERT INTO okr_goals (organization_id, period_id, parent_goal_id, owner_id, level, department_id, title, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        tenantId,
        data.period_id,
        data.parent_goal_id ?? null,
        ctx.userId,
        data.level,
        data.department_id ?? null,
        data.title,
        data.description ?? null,
      ],
    );

    const goal = result.rows[0] as Goal;

    eventBus.emit('okr.goal.created', {
      goalId: goal.id,
      title: goal.title,
      ownerId: ctx.userId,
      level: goal.level,
    });

    return goal;
  });
}

export async function updateGoal(
  ctx: CallerContext,
  goalId: string,
  data: Partial<Pick<Goal, 'title' | 'description' | 'status' | 'progress'>>,
): Promise<Goal> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for updateGoal');

  const sets: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];
  let idx = 1;

  if (data.title !== undefined) { sets.push(`title = $${idx++}`); params.push(data.title); }
  if (data.description !== undefined) { sets.push(`description = $${idx++}`); params.push(data.description); }
  if (data.status !== undefined) { sets.push(`status = $${idx++}`); params.push(data.status); }
  if (data.progress !== undefined) { sets.push(`progress = $${idx++}`); params.push(data.progress); }

  params.push(goalId);

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `UPDATE okr_goals SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params,
    );

    const goal = result.rows[0] as Goal;

    eventBus.emit('okr.goal.updated', {
      goalId: goal.id,
      progress: Number(goal.progress),
      status: goal.status,
      organizationId: goal.organization_id ?? undefined,
    });

    return goal;
  });
}

export async function createKeyResult(
  ctx: CallerContext,
  goalId: string,
  data: CreateKeyResultInput,
): Promise<KeyResult> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for createKeyResult');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `INSERT INTO okr_key_results (goal_id, title, metric_type, target_value, start_value, unit, auto_source)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        goalId,
        data.title,
        data.metric_type ?? 'number',
        data.target_value,
        data.start_value ?? 0,
        data.unit ?? null,
        data.auto_source ?? null,
      ],
    );

    const kr = result.rows[0] as KeyResult;

    eventBus.emit('okr.key_result.created', {
      keyResultId: kr.id,
      goalId,
      title: kr.title,
    });

    return kr;
  });
}

export async function checkIn(
  ctx: CallerContext,
  krId: string,
  value: number,
  note?: string,
  confidence?: 'high' | 'medium' | 'low',
): Promise<CheckIn> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for checkIn');

  return runInTenant(tenantId, async (client) => {
    const ciResult = await client.query(
      `INSERT INTO okr_check_ins (key_result_id, user_id, value, note, confidence)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [krId, ctx.userId, value, note ?? null, confidence ?? null],
    );
    const ci = ciResult.rows[0] as CheckIn;

    const krResult = await client.query('SELECT * FROM okr_key_results WHERE id = $1', [krId]);
    const kr = krResult.rows[0];
    if (!kr) throw new Error('Key result not found');

    const range = Number(kr.target_value) - Number(kr.start_value);
    const progress = range > 0
      ? Math.min(100, Math.max(0, ((value - Number(kr.start_value)) / range) * 100))
      : (value >= Number(kr.target_value) ? 100 : 0);

    await client.query(
      `UPDATE okr_key_results SET current_value = $1, progress = $2, updated_at = NOW() WHERE id = $3`,
      [value, progress, krId],
    );

    // Recalculate parent goal progress as avg of KR progresses
    const goalKrs = await client.query(
      'SELECT progress FROM okr_key_results WHERE goal_id = $1',
      [kr.goal_id],
    );
    const avg = goalKrs.rows.reduce((s: number, r: any) => s + Number(r.progress), 0) / goalKrs.rows.length;
    await client.query(
      `UPDATE okr_goals SET progress = $1, updated_at = NOW() WHERE id = $2`,
      [avg, kr.goal_id],
    );

    eventBus.emit('okr.check_in.submitted', {
      checkInId: ci.id,
      keyResultId: krId,
      value,
      userId: ctx.userId,
    });

    eventBus.emit('okr.key_result.updated', {
      keyResultId: krId,
      goalId: kr.goal_id,
      progress,
    });

    if (progress >= 100) {
      const goalRow = (await client.query('SELECT owner_id FROM okr_goals WHERE id = $1', [kr.goal_id])).rows[0];
      const ownerId = goalRow?.owner_id;
      eventBus.emit('okr.key_result.completed', {
        keyResultId: krId,
        goalId: kr.goal_id,
        title: kr.title,
        ownerId,
      });
      if (ownerId) {
        void emitToUser(ownerId, 'celebration:okr-kr-completed', {
          keyResultId: krId,
          goalId: kr.goal_id,
          title: kr.title,
        });
      }
    }

    return ci;
  });
}

export async function updateKeyResultProgress(
  ctx: CallerContext,
  krId: string,
  value: number,
  note?: string,
  confidence?: 'high' | 'medium' | 'low',
): Promise<KeyResult> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for updateKeyResultProgress');

  await checkIn(ctx, krId, value, note, confidence);
  return runInTenant(tenantId, async (client) => {
    const result = await client.query('SELECT * FROM okr_key_results WHERE id = $1', [krId]);
    return result.rows[0] as KeyResult;
  });
}

export async function getOKRMetrics(ctx: CallerContext, periodId?: string): Promise<OKRMetrics> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getOKRMetrics');

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (periodId) {
    conditions.push(`period_id = $${idx++}`);
    params.push(periodId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `SELECT
         COUNT(*)::int as total,
         COUNT(*) FILTER (WHERE status = 'on_track')::int as on_track,
         COUNT(*) FILTER (WHERE status = 'at_risk')::int as at_risk,
         COUNT(*) FILTER (WHERE status = 'behind')::int as behind,
         COUNT(*) FILTER (WHERE status = 'completed')::int as completed,
         COALESCE(AVG(progress), 0)::numeric as avg_progress
       FROM okr_goals ${where}`,
      params,
    );

    const row = result.rows[0];
    return {
      totalGoals: row.total,
      onTrack: row.on_track,
      atRisk: row.at_risk,
      behind: row.behind,
      completed: row.completed,
      avgProgress: Number(row.avg_progress),
    };
  });
}
