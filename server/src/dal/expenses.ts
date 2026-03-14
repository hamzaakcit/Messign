import type { PoolClient } from 'pg';
import { withTenantQuery } from '../middleware/tenantContext.js';
import { eventBus } from '../events/index.js';
import type { CallerContext, PaginatedResult, DateRange, SortOptions } from './types.js';
import { rbacWhereClause, paginationClause } from './helpers.js';

async function runInTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTenantQuery(tenantId, fn);
}

// ── Interfaces ──

export interface Expense {
  id: string;
  organization_id: string;
  submitted_by: string;
  title: string;
  description: string | null;
  category_id: string | null;
  category_slug: string | null;
  original_amount: number;
  original_currency: string;
  exchange_rate: number | null;
  converted_amount: number | null;
  expense_date: string;
  status: string;
  submitted_at: string | null;
  tax_amount: number | null;
  tax_rate: number | null;
  tip_amount: number | null;
  budget_id: string | null;
  vendor_id: string | null;
  project_id: string | null;
  team_id: string | null;
  tags: string[] | null;
  notes: string | null;
  receipt_url: string | null;
  receipt_verified: boolean | null;
  rejection_reason: string | null;
  current_approver_id: string | null;
  approved_at: string | null;
  paid_at: string | null;
  ai_risk_score: number | null;
  ai_risk_flags: unknown | null;
  ai_review_notes: string | null;
  ai_auto_approved: boolean | null;
  ai_category_suggestion: string | null;
  created_at: string;
  updated_at: string;
  submitter_name?: string;
  submitter_email?: string;
  category_name?: string;
  category_icon?: string;
  receipts?: unknown[];
  line_items?: unknown[];
  approval_steps?: unknown[];
  comments?: unknown[];
}

export interface CreateExpenseInput {
  title: string;
  description?: string;
  category_id?: string;
  category_slug?: string;
  amount: number;
  currency?: string;
  expense_date: string;
  tax_amount?: number;
  tax_rate?: number;
  tip_amount?: number;
  budget_id?: string;
  vendor_id?: string;
  project_id?: string;
  team_id?: string;
  tags?: string[];
  notes?: string;
  receipt_url?: string;
}

export type UpdateExpenseInput = Partial<CreateExpenseInput>;

export interface ExpenseFilters {
  status?: string;
  category?: string;
  dateRange?: DateRange;
  amountMin?: number;
  amountMax?: number;
  search?: string;
}

// ── DAL Functions ──

export async function listExpenses(
  ctx: CallerContext,
  filters?: ExpenseFilters,
  sort?: SortOptions,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResult<Expense>> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for listExpenses');

  const conditions = ['r.is_deleted = FALSE'];
  const params: unknown[] = [];
  let idx = 1;

  const rbac = rbacWhereClause(ctx, 'r.submitted_by', 'r.team_id', idx);
  if (rbac.clause !== '1=1') {
    conditions.push(rbac.clause);
    params.push(...rbac.params);
    idx += rbac.params.length;
  }

  if (filters?.status) {
    conditions.push(`r.status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters?.category) {
    conditions.push(`r.category_slug = $${idx++}`);
    params.push(filters.category);
  }
  if (filters?.dateRange?.from) {
    conditions.push(`r.expense_date >= $${idx++}`);
    params.push(filters.dateRange.from);
  }
  if (filters?.dateRange?.to) {
    conditions.push(`r.expense_date <= $${idx++}`);
    params.push(filters.dateRange.to);
  }
  if (filters?.amountMin != null) {
    conditions.push(`r.original_amount >= $${idx++}`);
    params.push(filters.amountMin);
  }
  if (filters?.amountMax != null) {
    conditions.push(`r.original_amount <= $${idx++}`);
    params.push(filters.amountMax);
  }
  if (filters?.search) {
    conditions.push(`(r.title ILIKE $${idx} OR r.description ILIKE $${idx})`);
    params.push(`%${filters.search}%`);
    idx++;
  }

  const whereSQL = conditions.join(' AND ');

  const sortCol: Record<string, string> = {
    date: 'r.expense_date', amount: 'r.original_amount',
    status: 'r.status', created: 'r.created_at',
  };
  const orderBy = sortCol[sort?.field ?? 'created'] ?? 'r.created_at';
  const orderDir = sort?.direction === 'asc' ? 'ASC' : 'DESC';

  return runInTenant(tenantId, async (client) => {
    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM reimbursement_requests r WHERE ${whereSQL}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const pg = paginationClause(page, pageSize, idx);

    const dataResult = await client.query(
      `SELECT r.*,
              u.full_name as submitter_name, u.email as submitter_email,
              ec.name as category_name, ec.icon as category_icon
       FROM reimbursement_requests r
       LEFT JOIN reimbursement_users u ON u.id = r.submitted_by
       LEFT JOIN expense_categories ec ON ec.id = r.category_id
       WHERE ${whereSQL}
       ORDER BY ${orderBy} ${orderDir}
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
  });
}

export async function getExpenseById(
  ctx: CallerContext,
  expenseId: string,
): Promise<Expense | null> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getExpenseById');

  const conditions = ['r.id = $1', 'r.is_deleted = FALSE'];
  const params: unknown[] = [expenseId];

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `SELECT r.*,
              u.full_name as submitter_name, u.email as submitter_email,
              ec.name as category_name, ec.icon as category_icon
       FROM reimbursement_requests r
       LEFT JOIN reimbursement_users u ON u.id = r.submitted_by
       LEFT JOIN expense_categories ec ON ec.id = r.category_id
       WHERE ${conditions.join(' AND ')}`,
      params,
    );
    if (!result.rows[0]) return null;

    const row = result.rows[0] as Record<string, unknown>;

    if (ctx.role === 'employee' && row.submitted_by !== ctx.userId) return null;
    if (ctx.role === 'manager' && row.submitted_by !== ctx.userId) {
      const teamCheck = await client.query<{ count: string }>(
        'SELECT COUNT(*) as count FROM reimbursement_users WHERE id = $1 AND manager_id = $2',
        [row.submitted_by, ctx.userId],
      );
      if (parseInt(teamCheck.rows[0]?.count ?? '0', 10) === 0) return null;
    }

    const [receipts, lineItems, approvalSteps, comments] = await Promise.all([
      client.query('SELECT * FROM reimbursement_documents WHERE reimbursement_id = $1 ORDER BY uploaded_at DESC', [expenseId]),
      client.query('SELECT * FROM finance_expense_line_items WHERE expense_id = $1 ORDER BY sort_order', [expenseId]),
      client.query('SELECT a.*, u.full_name as approver_name FROM approval_steps a LEFT JOIN reimbursement_users u ON u.id = a.assigned_to WHERE a.reimbursement_id = $1 ORDER BY a.step_order', [expenseId]),
      client.query('SELECT c.*, u.full_name as author_name FROM reimbursement_comments c LEFT JOIN reimbursement_users u ON u.id = c.user_id WHERE c.reimbursement_id = $1 ORDER BY c.created_at', [expenseId]),
    ]);

    return {
      ...row,
      receipts: receipts.rows,
      line_items: lineItems.rows,
      approval_steps: approvalSteps.rows,
      comments: comments.rows,
    } as Expense;
  });
}

export async function createExpense(
  ctx: CallerContext,
  data: CreateExpenseInput,
): Promise<Expense> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for createExpense');

  const currency = data.currency ?? 'USD';

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `INSERT INTO reimbursement_requests
       (organization_id, submitted_by, title, description,
        category_id, category_slug, original_amount, original_currency,
        converted_amount, expense_date, tax_amount, tax_rate, tip_amount,
        budget_id, vendor_id, project_id, team_id,
        tags, notes, receipt_url, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'draft',$21)
       RETURNING *`,
      [
        tenantId, ctx.userId, data.title, data.description ?? null,
        data.category_id ?? null, data.category_slug ?? null,
        data.amount, currency, data.amount,
        data.expense_date, data.tax_amount ?? 0, data.tax_rate ?? 0,
        data.tip_amount ?? 0, data.budget_id ?? null,
        data.vendor_id ?? null, data.project_id ?? null, data.team_id ?? null,
        data.tags ?? [], data.notes ?? null, data.receipt_url ?? null,
        ctx.userId,
      ],
    );

    const expense = result.rows[0] as Expense;

    eventBus.emit('finance.expense.created', {
      expenseId: expense.id, userId: ctx.userId, amount: expense.original_amount,
      currency: expense.original_currency, category: expense.category_slug ?? '',
      departmentId: expense.team_id ?? undefined,
      organizationId: tenantId,
    });

    return expense;
  });
}

export async function updateExpense(
  ctx: CallerContext,
  expenseId: string,
  data: UpdateExpenseInput,
): Promise<Expense> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for updateExpense');

  const existing = await getExpenseById(ctx, expenseId);
  if (!existing) throw new Error('Expense not found');
  if (existing.status !== 'draft') throw new Error('Only draft expenses can be updated');
  if (ctx.role === 'employee' && existing.submitted_by !== ctx.userId) {
    throw new Error('Not authorized to update this expense');
  }

  const fields: [string, unknown][] = [
    ['title', data.title], ['description', data.description],
    ['category_slug', data.category_slug], ['category_id', data.category_id],
    ['original_amount', data.amount], ['original_currency', data.currency],
    ['expense_date', data.expense_date], ['tax_amount', data.tax_amount],
    ['tax_rate', data.tax_rate], ['tip_amount', data.tip_amount],
    ['budget_id', data.budget_id], ['vendor_id', data.vendor_id],
    ['project_id', data.project_id], ['team_id', data.team_id],
    ['tags', data.tags], ['notes', data.notes], ['receipt_url', data.receipt_url],
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
  sets.push(`updated_at = NOW()`, `updated_by = $${idx++}`);
  params.push(ctx.userId);

  params.push(expenseId);

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `UPDATE reimbursement_requests SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params,
    );
    return result.rows[0] as Expense;
  });
}

export async function submitExpense(
  ctx: CallerContext,
  expenseId: string,
): Promise<Expense> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for submitExpense');

  let existingAmount = 0;
  await runInTenant(tenantId, async (client) => {
    await client.query('BEGIN');
    try {
      const existing = await client.query(
        'SELECT * FROM reimbursement_requests WHERE id = $1 AND submitted_by = $2 AND is_deleted = FALSE',
        [expenseId, ctx.userId],
      );
      if (!existing.rows[0]) throw new Error('Expense not found');
      if (existing.rows[0].status !== 'draft') throw new Error('Only draft expenses can be submitted');
      existingAmount = existing.rows[0].original_amount;

      await client.query(
        `UPDATE reimbursement_requests SET status = 'submitted', submitted_at = NOW(), updated_at = NOW(), updated_by = $1 WHERE id = $2`,
        [ctx.userId, expenseId],
      );

      const userRow = await client.query(
        'SELECT manager_id FROM reimbursement_users WHERE id = $1',
        [ctx.userId],
      );
      const approverId = userRow.rows[0]?.manager_id ?? null;

      if (approverId) {
        await client.query(
          `INSERT INTO approval_steps
           (reimbursement_id, step_order, step_type, assigned_to, status, entity_type, entity_id, step_name)
           VALUES ($1::UUID, 1, 'manager_approval', $2::UUID, 'pending', 'expense', $3::UUID, 'Manager Approval')`,
          [expenseId, approverId, expenseId],
        );
        await client.query(
          `UPDATE reimbursement_requests SET status = 'manager_review', current_approver_id = $1 WHERE id = $2`,
          [approverId, expenseId],
        );
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  });

  eventBus.emit('finance.expense.submitted', {
    expenseId, userId: ctx.userId, amount: existingAmount,
  });

  const updated = await getExpenseById(ctx, expenseId);
  return updated!;
}

export async function approveExpense(
  ctx: CallerContext,
  expenseId: string,
): Promise<Expense> {
  if (ctx.role === 'employee') throw new Error('Insufficient permissions to approve expenses');

  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for approveExpense');

  let approvedAmount = 0;
  await runInTenant(tenantId, async (client) => {
    await client.query('BEGIN');
    try {
      const expense = await client.query(
        'SELECT * FROM reimbursement_requests WHERE id = $1 AND is_deleted = FALSE',
        [expenseId],
      );
      if (!expense.rows[0]) throw new Error('Expense not found');
      approvedAmount = expense.rows[0].original_amount;

      const step = await client.query(
        `SELECT * FROM approval_steps
         WHERE reimbursement_id = $1 AND status = 'pending'
         ORDER BY step_order LIMIT 1`,
        [expenseId],
      );

      if (step.rows[0]) {
        await client.query(
          `UPDATE approval_steps SET status = 'approved', decision_at = NOW() WHERE id = $1`,
          [step.rows[0].id],
        );
      }

      await client.query(
        `UPDATE reimbursement_requests
         SET status = 'approved', approved_at = NOW(), updated_at = NOW(), updated_by = $1, current_approver_id = NULL
         WHERE id = $2`,
        [ctx.userId, expenseId],
      );

      if (expense.rows[0].budget_id) {
        await client.query(
          `UPDATE finance_budgets SET spent_amount = spent_amount + $1 WHERE id = $2`,
          [expense.rows[0].original_amount, expense.rows[0].budget_id],
        );
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  });

  eventBus.emit('finance.expense.approved', {
    expenseId, approverId: ctx.userId, amount: approvedAmount,
    organizationId: tenantId,
  });

  const updated = await getExpenseById(ctx, expenseId);
  return updated!;
}

export async function rejectExpense(
  ctx: CallerContext,
  expenseId: string,
  reason: string,
): Promise<Expense> {
  if (ctx.role === 'employee') throw new Error('Insufficient permissions to reject expenses');

  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for rejectExpense');

  await runInTenant(tenantId, async (client) => {
    await client.query('BEGIN');
    try {
      const expense = await client.query(
        'SELECT * FROM reimbursement_requests WHERE id = $1 AND is_deleted = FALSE',
        [expenseId],
      );
      if (!expense.rows[0]) throw new Error('Expense not found');

      const step = await client.query(
        `SELECT * FROM approval_steps
         WHERE reimbursement_id = $1 AND status = 'pending'
         ORDER BY step_order LIMIT 1`,
        [expenseId],
      );

      if (step.rows[0]) {
        await client.query(
          `UPDATE approval_steps SET status = 'rejected', decision_at = NOW(), decision_notes = $1 WHERE id = $2`,
          [reason, step.rows[0].id],
        );
      }

      await client.query(
        `UPDATE reimbursement_requests
         SET status = 'rejected', rejection_reason = $1, updated_at = NOW(), updated_by = $2
         WHERE id = $3`,
        [reason, ctx.userId, expenseId],
      );

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  });

  eventBus.emit('finance.expense.rejected', { expenseId, approverId: ctx.userId, reason });

  const updated = await getExpenseById(ctx, expenseId);
  return updated!;
}

export async function checkDuplicate(
  ctx: CallerContext,
  amount: number,
  date: string,
  vendorId?: string,
): Promise<{ isDuplicate: boolean; matches: Expense[] }> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for checkDuplicate');

  const conditions = [
    'r.original_amount = $1',
    'r.is_deleted = FALSE',
    `r.expense_date BETWEEN ($2::date - INTERVAL '7 days') AND ($2::date + INTERVAL '7 days')`,
  ];
  const params: unknown[] = [amount, date];
  let idx = 3;

  if (vendorId) {
    conditions.push(`r.vendor_id = $${idx++}`);
    params.push(vendorId);
  }

  const rbac = rbacWhereClause(ctx, 'r.submitted_by', 'r.team_id', idx);
  if (rbac.clause !== '1=1') {
    conditions.push(rbac.clause);
    params.push(...rbac.params);
  }

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `SELECT r.* FROM reimbursement_requests r WHERE ${conditions.join(' AND ')} LIMIT 10`,
      params,
    );
    return {
      isDuplicate: result.rows.length > 0,
      matches: result.rows as Expense[],
    };
  });
}
