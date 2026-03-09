import { query, getClient } from '../db/index.js';
import { eventBus } from '../events/index.js';
import type { CallerContext, PaginatedResult } from './types.js';
import { paginationClause } from './helpers.js';
import type { Expense } from './expenses.js';

// ── Interfaces ──

export interface BudgetAllocation {
  id: string;
  budget_id: string;
  category_slug: string;
  allocated_amount: number;
  spent_amount: number | null;
  ai_suggested_amount: number | null;
  ai_suggestion_reason: string | null;
}

export interface BudgetSnapshot {
  id: string;
  budget_id: string;
  snapshot_date: string;
  total_amount: number;
  spent_amount: number;
  forecast_amount: number | null;
  health_score: number | null;
  created_at: string;
}

export interface Budget {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  department: string;
  budget_code: string | null;
  team_id: string | null;
  project_id: string | null;
  owner_id: string;
  allocated_amount: number;
  spent_amount: number;
  currency: string;
  period_start: string;
  period_end: string;
  period_type: string;
  warning_threshold: number;
  critical_threshold: number;
  hard_limit: boolean;
  requires_approval: boolean;
  approval_threshold: number | null;
  status: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  owner_name?: string;
  utilization_pct?: number;
  remaining?: number;
  allocations?: BudgetAllocation[];
  snapshots?: BudgetSnapshot[];
}

export interface BudgetHealth {
  id: string;
  name: string;
  status: 'healthy' | 'warning' | 'critical' | 'exceeded';
  utilization_pct: number;
  spent: number;
  allocated: number;
  remaining: number;
  days_remaining: number;
}

export interface CreateBudgetInput {
  name: string;
  description?: string;
  department: string;
  budget_code?: string;
  team_id?: string;
  project_id?: string;
  owner_id: string;
  allocated_amount: number;
  currency?: string;
  period_start: string;
  period_end: string;
  period_type?: string;
  warning_threshold?: number;
  critical_threshold?: number;
  hard_limit?: boolean;
  requires_approval?: boolean;
  approval_threshold?: number;
}

export type UpdateBudgetInput = Partial<CreateBudgetInput>;

export interface BudgetFilters {
  status?: string;
  team_id?: string;
  department?: string;
}

// ── DAL Functions ──

export async function listBudgets(
  ctx: CallerContext,
  filters?: BudgetFilters,
): Promise<PaginatedResult<Budget>> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (ctx.organizationId) {
    conditions.push(`b.organization_id = $${idx++}`);
    params.push(ctx.organizationId);
  }

  if (ctx.role === 'employee') {
    conditions.push(`(b.team_id = $${idx} OR b.owner_id = $${idx + 1})`);
    params.push(ctx.teamId ?? '', ctx.userId);
    idx += 2;
  } else if (ctx.role === 'manager') {
    conditions.push(`(b.team_id = $${idx} OR b.owner_id = $${idx + 1})`);
    params.push(ctx.teamId ?? '', ctx.userId);
    idx += 2;
  } else if (ctx.role === 'dept_head') {
    conditions.push(`b.department = $${idx++}`);
    params.push(ctx.departmentId ?? '');
  }
  // finance_admin / system_admin see all

  if (filters?.status) {
    conditions.push(`b.status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters?.team_id) {
    conditions.push(`b.team_id = $${idx++}`);
    params.push(filters.team_id);
  }
  if (filters?.department) {
    conditions.push(`b.department = $${idx++}`);
    params.push(filters.department);
  }

  const whereSQL = conditions.length > 0 ? conditions.join(' AND ') : '1=1';

  const result = await query(
    `SELECT b.*,
            u.full_name as owner_name,
            CASE WHEN b.allocated_amount > 0
              THEN ROUND((COALESCE(b.spent_amount,0) / b.allocated_amount * 100)::numeric, 1)
              ELSE 0 END as utilization_pct,
            b.allocated_amount - COALESCE(b.spent_amount, 0) as remaining
     FROM finance_budgets b
     LEFT JOIN reimbursement_users u ON u.id = b.owner_id
     WHERE ${whereSQL}
     ORDER BY b.created_at DESC`,
    params,
  );

  return {
    data: result.rows as Budget[],
    total: result.rows.length,
    page: 1,
    pageSize: result.rows.length,
    totalPages: 1,
  };
}

export async function getBudgetById(
  ctx: CallerContext,
  budgetId: string,
): Promise<Budget | null> {
  const conditions = ['b.id = $1'];
  const params: unknown[] = [budgetId];
  let idx = 2;

  if (ctx.organizationId) {
    conditions.push(`b.organization_id = $${idx++}`);
    params.push(ctx.organizationId);
  }

  const budget = await query(
    `SELECT b.*,
            u.full_name as owner_name,
            CASE WHEN b.allocated_amount > 0
              THEN ROUND((COALESCE(b.spent_amount,0) / b.allocated_amount * 100)::numeric, 1)
              ELSE 0 END as utilization_pct,
            b.allocated_amount - COALESCE(b.spent_amount, 0) as remaining
     FROM finance_budgets b
     LEFT JOIN reimbursement_users u ON u.id = b.owner_id
     WHERE ${conditions.join(' AND ')}`,
    params,
  );
  if (!budget.rows[0]) return null;

  const [allocations, snapshots] = await Promise.all([
    query('SELECT * FROM finance_budget_allocations WHERE budget_id = $1 ORDER BY category_slug', [budgetId]),
    query('SELECT * FROM finance_budget_snapshots WHERE budget_id = $1 ORDER BY snapshot_date DESC LIMIT 90', [budgetId]),
  ]);

  return {
    ...(budget.rows[0] as Record<string, unknown>),
    allocations: allocations.rows,
    snapshots: snapshots.rows,
  } as Budget;
}

export async function createBudget(
  ctx: CallerContext,
  data: CreateBudgetInput,
): Promise<Budget> {
  if (ctx.role !== 'finance_admin' && ctx.role !== 'system_admin') {
    throw new Error('Only finance_admin or system_admin can create budgets');
  }

  const orgId = ctx.organizationId ?? '';

  const result = await query(
    `INSERT INTO finance_budgets
     (organization_id, name, description, department, budget_code,
      team_id, project_id, owner_id, allocated_amount, currency,
      period_start, period_end, period_type,
      warning_threshold, critical_threshold, hard_limit,
      requires_approval, approval_threshold, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'active')
     RETURNING *`,
    [
      orgId, data.name, data.description ?? null, data.department,
      data.budget_code ?? null, data.team_id ?? null, data.project_id ?? null,
      data.owner_id, data.allocated_amount, data.currency ?? 'USD',
      data.period_start, data.period_end, data.period_type ?? 'monthly',
      data.warning_threshold ?? 80, data.critical_threshold ?? 95,
      data.hard_limit ?? false, data.requires_approval ?? true,
      data.approval_threshold ?? null,
    ],
  );

  return result.rows[0] as Budget;
}

export async function updateBudget(
  ctx: CallerContext,
  budgetId: string,
  data: UpdateBudgetInput,
): Promise<Budget> {
  const existing = await getBudgetById(ctx, budgetId);
  if (!existing) throw new Error('Budget not found');

  if (ctx.role !== 'finance_admin' && ctx.role !== 'system_admin' && existing.owner_id !== ctx.userId) {
    throw new Error('Not authorized to update this budget');
  }

  const fields: [string, unknown][] = [
    ['name', data.name], ['description', data.description],
    ['allocated_amount', data.allocated_amount],
    ['warning_threshold', data.warning_threshold],
    ['critical_threshold', data.critical_threshold],
    ['hard_limit', data.hard_limit],
    ['period_start', data.period_start], ['period_end', data.period_end],
  ];

  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  for (const [col, val] of fields) {
    if (val !== undefined) {
      sets.push(`${col} = $${idx++}`);
      params.push(val);
    }
  }

  if (sets.length === 0) return existing;

  sets.push(`updated_at = NOW()`);
  params.push(budgetId, ctx.organizationId ?? '');

  const result = await query(
    `UPDATE finance_budgets SET ${sets.join(', ')}
     WHERE id = $${idx++} AND organization_id = $${idx++} RETURNING *`,
    params,
  );

  if (!result.rows[0]) throw new Error('Budget not found');
  return result.rows[0] as Budget;
}

export async function checkBudgetHealth(
  ctx: CallerContext,
  budgetId: string,
): Promise<BudgetHealth | null> {
  const budget = await getBudgetById(ctx, budgetId);
  if (!budget) return null;

  const spent = parseFloat(String(budget.spent_amount ?? '0'));
  const allocated = parseFloat(String(budget.allocated_amount ?? '0'));
  const pct = allocated > 0 ? (spent / allocated) * 100 : 0;
  const warning = parseFloat(String(budget.warning_threshold ?? '80'));
  const critical = parseFloat(String(budget.critical_threshold ?? '95'));

  let status: BudgetHealth['status'] = 'healthy';
  if (pct >= 100) status = 'exceeded';
  else if (pct >= critical) status = 'critical';
  else if (pct >= warning) status = 'warning';

  if (status !== 'healthy') {
    eventBus.emit('finance.budget.threshold_breached', {
      budgetId,
      departmentId: budget.department,
      currentPercent: pct,
      threshold: status === 'critical' || status === 'exceeded' ? critical : warning,
    });
  }

  return {
    id: budget.id,
    name: budget.name ?? budget.department,
    status,
    utilization_pct: pct,
    spent,
    allocated,
    remaining: allocated - spent,
    days_remaining: Math.max(0, Math.ceil(
      (new Date(budget.period_end).getTime() - Date.now()) / 86400000,
    )),
  };
}

export async function getBudgetExpenses(
  ctx: CallerContext,
  budgetId: string,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResult<Expense>> {
  const conditions = ['r.budget_id = $1', 'r.is_deleted = FALSE'];
  const params: unknown[] = [budgetId];
  let idx = 2;

  if (ctx.organizationId) {
    conditions.push(`r.organization_id = $${idx++}`);
    params.push(ctx.organizationId);
  }

  const whereSQL = conditions.join(' AND ');

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM reimbursement_requests r WHERE ${whereSQL}`,
    params,
  );
  const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

  const pg = paginationClause(page, pageSize, idx);

  const dataResult = await query(
    `SELECT r.*,
            u.full_name as submitter_name, u.email as submitter_email
     FROM reimbursement_requests r
     LEFT JOIN reimbursement_users u ON u.id = r.submitted_by
     WHERE ${whereSQL}
     ORDER BY r.expense_date DESC
     ${pg.clause}`,
    [...params, ...pg.params],
  );

  return {
    data: dataResult.rows as Expense[],
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
