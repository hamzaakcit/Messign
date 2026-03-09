import { query, getClient } from '../../db/index.js';
import { auditService } from './auditService.js';
import { notificationService } from './notificationService.js';
import { runAIReviewPipeline } from './aiReviewPipeline.js';
import { journalEntryService } from './journalEntryService.js';
import { getBudgetIdForCategory } from './categoryDepartmentMap.js';
import { eventBus } from '../../events/index.js';

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

export interface ExpenseFilters {
  status?: string;
  category_slug?: string;
  date_from?: string;
  date_to?: string;
  amount_min?: number;
  amount_max?: number;
  team_id?: string;
  risk_level?: 'low' | 'medium' | 'high';
  search?: string;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export const expenseService = {
  async create(data: CreateExpenseInput, userId: string, orgId: string) {
    let categoryId = data.category_id ?? null;
    let budgetId = data.budget_id ?? null;

    if (data.category_slug) {
      if (!categoryId) {
        const cat = await query<{ id: string }>(
          'SELECT id FROM expense_categories WHERE organization_id = $1 AND slug = $2 AND is_active = TRUE LIMIT 1',
          [orgId, data.category_slug],
        );
        categoryId = cat.rows[0]?.id ?? null;
      }
      if (!budgetId) {
        budgetId = await getBudgetIdForCategory(orgId, data.category_slug);
      }
    }

    if (!categoryId) {
      const fallback = await query<{ id: string }>(
        'SELECT id FROM expense_categories WHERE organization_id = $1 AND is_active = TRUE ORDER BY name LIMIT 1',
        [orgId],
      );
      categoryId = fallback.rows[0]?.id ?? null;
    }
    if (!categoryId) {
      throw new Error('No expense category found. Please add at least one category in settings.');
    }

    try {
    const result = await query(
      `INSERT INTO reimbursement_requests
       (organization_id, submitted_by, title, description, category_id, category_slug,
        original_amount, original_currency, converted_amount, expense_date,
        tax_amount, tax_rate, tip_amount, budget_id, vendor_id, project_id, team_id,
        tags, notes, receipt_url, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$7,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'draft',$2)
       RETURNING *`,
      [
        orgId, userId, data.title, data.description ?? null,
        categoryId, data.category_slug ?? null,
        data.amount, data.currency ?? 'USD', data.expense_date,
        data.tax_amount ?? null, data.tax_rate ?? null, data.tip_amount ?? null,
        budgetId, data.vendor_id ?? null, data.project_id ?? null,
        data.team_id ?? null, data.tags ?? [], data.notes ?? null,
        data.receipt_url ?? null,
      ],
    );

    const expense = result.rows[0];
    await auditService.log({
      organization_id: orgId,
      event_type: 'expense.created',
      event_category: 'expense',
      actor_type: 'user',
      actor_id: userId,
      entity_type: 'expense',
      entity_id: expense.id,
      changes: { status: 'draft', amount: data.amount },
    });

    eventBus.emit('finance.expense.created', {
      expenseId: expense.id, userId, amount: expense.original_amount,
      currency: expense.currency, category: expense.category, departmentId: expense.department_id,
    });

    return expense;
    } catch (err: unknown) {
      throw err;
    }
  },

  async list(filters: ExpenseFilters, userId: string, orgId: string, userRole: string, teamId?: string) {
    const conditions = ['r.organization_id = $1', 'r.is_deleted = FALSE'];
    const params: unknown[] = [orgId];
    let idx = 2;

    const level = { admin: 6, cfo: 5, finance_admin: 4, finance: 3, manager: 2, employee: 1 }[userRole] ?? 0;
    if (level < 3) {
      if (level >= 2 && teamId) {
        conditions.push(`(r.submitted_by = $${idx} OR r.team_id = $${idx + 1})`);
        params.push(userId, teamId);
        idx += 2;
      } else {
        conditions.push(`r.submitted_by = $${idx++}`);
        params.push(userId);
      }
    }

    if (filters.status) {
      conditions.push(`r.status = $${idx++}`);
      params.push(filters.status);
    }
    if (filters.category_slug) {
      conditions.push(`r.category_slug = $${idx++}`);
      params.push(filters.category_slug);
    }
    if (filters.date_from) {
      conditions.push(`r.expense_date >= $${idx++}`);
      params.push(filters.date_from);
    }
    if (filters.date_to) {
      conditions.push(`r.expense_date <= $${idx++}`);
      params.push(filters.date_to);
    }
    if (filters.amount_min != null) {
      conditions.push(`r.original_amount >= $${idx++}`);
      params.push(filters.amount_min);
    }
    if (filters.amount_max != null) {
      conditions.push(`r.original_amount <= $${idx++}`);
      params.push(filters.amount_max);
    }
    if (filters.team_id) {
      conditions.push(`r.team_id = $${idx++}`);
      params.push(filters.team_id);
    }
    if (filters.risk_level) {
      const ranges: Record<string, [number, number]> = {
        low: [0, 0.3],
        medium: [0.3, 0.7],
        high: [0.7, 1.0],
      };
      const [lo, hi] = ranges[filters.risk_level] ?? [0, 1];
      conditions.push(`r.ai_risk_score >= $${idx++} AND r.ai_risk_score <= $${idx++}`);
      params.push(lo, hi);
    }
    if (filters.search) {
      conditions.push(`(r.title ILIKE $${idx} OR r.description ILIKE $${idx})`);
      params.push(`%${filters.search}%`);
      idx++;
    }

    const sortCol = {
      date: 'r.expense_date',
      amount: 'r.original_amount',
      status: 'r.status',
      risk: 'r.ai_risk_score',
      created: 'r.created_at',
    }[filters.sort_by ?? 'created'] ?? 'r.created_at';
    const sortDir = filters.sort_dir === 'asc' ? 'ASC' : 'DESC';
    const limit = Math.min(filters.limit ?? 20, 100);
    const offset = filters.offset ?? 0;

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM reimbursement_requests r WHERE ${conditions.join(' AND ')}`,
      params,
    );

    const dataResult = await query(
      `SELECT r.*,
              u.full_name as submitter_name, u.email as submitter_email,
              ec.name as category_name, ec.icon as category_icon
       FROM reimbursement_requests r
       LEFT JOIN reimbursement_users u ON u.id = r.submitted_by
       LEFT JOIN expense_categories ec ON ec.id = r.category_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ${sortCol} ${sortDir}
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset],
    );

    return {
      expenses: dataResult.rows,
      total: parseInt(countResult.rows[0]?.count ?? '0', 10),
      limit,
      offset,
    };
  },

  async getById(expenseId: string, userId: string, orgId: string, userRole: string) {
    const expense = await query(
      `SELECT r.*,
              u.full_name as submitter_name, u.email as submitter_email,
              ec.name as category_name, ec.icon as category_icon
       FROM reimbursement_requests r
       LEFT JOIN reimbursement_users u ON u.id = r.submitted_by
       LEFT JOIN expense_categories ec ON ec.id = r.category_id
       WHERE r.id = $1 AND r.organization_id = $2 AND r.is_deleted = FALSE`,
      [expenseId, orgId],
    );
    if (!expense.rows[0]) return null;

    const level = { admin: 6, cfo: 5, finance_admin: 4, finance: 3, manager: 2, employee: 1 }[userRole] ?? 0;
    const row = expense.rows[0];
    if (level < 3 && row.submitted_by !== userId) {
      return null;
    }

    const [receipts, lineItems, approvalSteps, comments] = await Promise.all([
      query('SELECT * FROM reimbursement_documents WHERE reimbursement_id = $1 ORDER BY uploaded_at DESC', [expenseId]),
      query('SELECT * FROM finance_expense_line_items WHERE expense_id = $1 ORDER BY sort_order', [expenseId]),
      query('SELECT a.*, u.full_name as approver_name FROM approval_steps a LEFT JOIN reimbursement_users u ON u.id = a.assigned_to WHERE a.reimbursement_id = $1 ORDER BY a.step_order', [expenseId]),
      query('SELECT c.*, u.full_name as author_name FROM reimbursement_comments c LEFT JOIN reimbursement_users u ON u.id = c.user_id WHERE c.reimbursement_id = $1 ORDER BY c.created_at', [expenseId]),
    ]);

    return {
      ...row,
      receipts: receipts.rows,
      line_items: lineItems.rows,
      approval_steps: approvalSteps.rows,
      comments: comments.rows,
    };
  },

  async update(expenseId: string, data: Partial<CreateExpenseInput>, userId: string, orgId: string) {
    const existing = await query(
      'SELECT * FROM reimbursement_requests WHERE id = $1 AND organization_id = $2 AND is_deleted = FALSE',
      [expenseId, orgId],
    );
    if (!existing.rows[0]) return null;
    if (existing.rows[0].status !== 'draft') {
      throw new Error('Only draft expenses can be edited');
    }
    if (existing.rows[0].submitted_by !== userId) {
      throw new Error('Not authorized to edit this expense');
    }

    // Re-resolve budget when category changes
    let resolvedBudgetId = data.budget_id;
    if (data.category_slug && data.category_slug !== existing.rows[0].category_slug && !data.budget_id) {
      resolvedBudgetId = await getBudgetIdForCategory(orgId, data.category_slug) ?? undefined;
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    const fields: [string, unknown][] = [
      ['title', data.title],
      ['description', data.description],
      ['category_id', data.category_id],
      ['category_slug', data.category_slug],
      ['original_amount', data.amount],
      ['original_currency', data.currency],
      ['converted_amount', data.amount],
      ['expense_date', data.expense_date],
      ['tax_amount', data.tax_amount],
      ['tax_rate', data.tax_rate],
      ['tip_amount', data.tip_amount],
      ['budget_id', resolvedBudgetId],
      ['vendor_id', data.vendor_id],
      ['project_id', data.project_id],
      ['team_id', data.team_id],
      ['tags', data.tags],
      ['notes', data.notes],
      ['receipt_url', data.receipt_url],
    ];

    for (const [col, val] of fields) {
      if (val !== undefined) {
        sets.push(`${col} = $${idx++}`);
        params.push(val);
      }
    }

    if (sets.length === 0) return existing.rows[0];

    sets.push(`updated_at = NOW()`);
    sets.push(`updated_by = $${idx++}`);
    params.push(userId);
    sets.push(`version = version + 1`);

    params.push(expenseId, orgId);
    const result = await query(
      `UPDATE reimbursement_requests SET ${sets.join(', ')}
       WHERE id = $${idx++} AND organization_id = $${idx++}
       RETURNING *`,
      params,
    );

    await auditService.log({
      organization_id: orgId,
      event_type: 'expense.updated',
      event_category: 'expense',
      actor_type: 'user',
      actor_id: userId,
      entity_type: 'expense',
      entity_id: expenseId,
      changes: data as Record<string, unknown>,
    });

    return result.rows[0];
  },

  async softDelete(expenseId: string, userId: string, orgId: string) {
    const existing = await query(
      'SELECT * FROM reimbursement_requests WHERE id = $1 AND organization_id = $2 AND is_deleted = FALSE',
      [expenseId, orgId],
    );
    if (!existing.rows[0]) return false;
    if (existing.rows[0].status !== 'draft') {
      throw new Error('Only draft expenses can be deleted');
    }
    if (existing.rows[0].submitted_by !== userId) {
      throw new Error('Not authorized to delete this expense');
    }

    await query(
      'UPDATE reimbursement_requests SET is_deleted = TRUE, deleted_at = NOW(), updated_by = $1 WHERE id = $2',
      [userId, expenseId],
    );

    await auditService.log({
      organization_id: orgId,
      event_type: 'expense.deleted',
      event_category: 'expense',
      actor_type: 'user',
      actor_id: userId,
      entity_type: 'expense',
      entity_id: expenseId,
    });
    return true;
  },

  async submit(expenseId: string, userId: string, orgId: string) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        'SELECT * FROM reimbursement_requests WHERE id = $1 AND organization_id = $2 AND submitted_by = $3 AND is_deleted = FALSE',
        [expenseId, orgId, userId],
      );
      if (!existing.rows[0]) throw new Error('Expense not found');
      if (existing.rows[0].status !== 'draft') throw new Error('Only draft expenses can be submitted');

      await client.query(
        `UPDATE reimbursement_requests
         SET status = 'submitted', submitted_at = NOW(), updated_at = NOW(), updated_by = $1
         WHERE id = $2`,
        [userId, expenseId],
      );

      const userRow = await client.query(
        'SELECT manager_id FROM reimbursement_users WHERE id = $1',
        [userId],
      );
      let approverId = userRow.rows[0]?.manager_id;
      if (!approverId) {
        const fallback = await client.query(
          `SELECT id FROM reimbursement_users
           WHERE organization_id = $1 AND id != $2 AND role IN ('manager', 'admin', 'finance')
           ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'finance' THEN 2 WHEN 'manager' THEN 3 ELSE 4 END
           LIMIT 1`,
          [orgId, userId],
        );
        approverId = fallback.rows[0]?.id ?? null;
      }

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

      await auditService.log({
        organization_id: orgId,
        event_type: 'expense.submitted',
        event_category: 'expense',
        actor_type: 'user',
        actor_id: userId,
        entity_type: 'expense',
        entity_id: expenseId,
        changes: { status: approverId ? 'manager_review' : 'submitted' },
      });

      eventBus.emit('finance.expense.submitted', {
        expenseId, userId, amount: existing.rows[0].original_amount,
      });

      if (approverId) {
        const expense = existing.rows[0];
        await notificationService.create({
          organization_id: orgId,
          recipient_id: approverId,
          type: 'expense.submitted',
          title: 'New Expense for Review',
          message: `"${expense.title}" ($${expense.original_amount}) needs your approval.`,
          entity_type: 'expense',
          entity_id: expenseId,
          action_url: `/finance/expenses/${expenseId}`,
          priority: 'normal',
        });
      }

      // Fire AI review pipeline asynchronously (don't block the HTTP response)
      runAIReviewPipeline(expenseId, orgId, userId).catch((err) => {
        console.error('[aiReviewPipeline] Failed for expense', expenseId, err);
      });

      return { success: true };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async approve(expenseId: string, approverId: string, orgId: string, comments?: string) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const expense = await client.query(
        'SELECT * FROM reimbursement_requests WHERE id = $1 AND organization_id = $2 AND is_deleted = FALSE',
        [expenseId, orgId],
      );
      if (!expense.rows[0]) throw new Error('Expense not found');

      // Fetch approver role to determine privilege level
      const approverRow = await client.query(
        'SELECT role FROM reimbursement_users WHERE id = $1',
        [approverId],
      );
      const approverRole = approverRow.rows[0]?.role ?? 'employee';
      const isPrivileged = ['admin', 'finance', 'cfo', 'finance_admin'].includes(approverRole);

      // Admins/finance can approve any expense, including their own (edge case in small orgs)
      if (expense.rows[0].submitted_by === approverId && !isPrivileged) {
        throw new Error('Cannot approve your own expense');
      }

      // 1. Look for a step directly assigned to this approver
      let step: { rows: Record<string, unknown>[] };
      try {
        step = await client.query(
          `SELECT * FROM approval_steps
           WHERE reimbursement_id = $1 AND assigned_to = $2 AND status = 'pending'
           ORDER BY step_order LIMIT 1`,
          [expenseId, approverId],
        );
      } catch (e1: unknown) {
        throw e1;
      }
      // 2. Fallback: any pending step for this expense if user has privileged role
      if (!step.rows[0]) {
        try {
          step = await client.query(
            `SELECT s.* FROM approval_steps s
             JOIN reimbursement_users u ON u.id = $2
             WHERE s.reimbursement_id = $1 AND s.status = 'pending'
               AND u.role IN ('manager', 'admin', 'finance', 'cfo', 'finance_admin')
             ORDER BY s.step_order LIMIT 1`,
            [expenseId, approverId],
          );
        } catch (e2: unknown) {
          throw e2;
        }
      }
      // 3. No step exists at all — privileged users can create + approve on the fly
      if (!step.rows[0]) {
        if (!isPrivileged) throw new Error('No pending approval step for this user');
        await client.query(
          `INSERT INTO approval_steps
           (reimbursement_id, step_order, step_type, assigned_to, status, entity_type, entity_id, step_name, decision_at, decision_notes)
           VALUES ($1::UUID, 1, 'manager_approval', $2::UUID, 'approved', 'expense', $3::UUID, 'Admin Approval', NOW(), $4)
           ON CONFLICT (reimbursement_id, step_order) DO UPDATE
             SET status = 'approved', decision_at = NOW(), assigned_to = EXCLUDED.assigned_to, decision_notes = EXCLUDED.decision_notes
           RETURNING *`,
          [expenseId, approverId, expenseId, comments ?? 'Admin force-approved'],
        );
        // Directly update the expense status to approved
        await client.query(
          `UPDATE reimbursement_requests
           SET status = 'approved', approved_at = NOW(), updated_at = NOW(), updated_by = $1,
               current_approver_id = NULL
           WHERE id = $2`,
          [approverId, expenseId],
        );
        if (expense.rows[0].budget_id) {
          await client.query(
            `UPDATE finance_budgets SET spent_amount = spent_amount + $1 WHERE id = $2`,
            [expense.rows[0].original_amount, expense.rows[0].budget_id],
          );
        }
        await client.query('COMMIT');
        await auditService.log({
          organization_id: orgId,
          event_type: 'expense.approved',
          event_category: 'expense',
          actor_type: 'user',
          actor_id: approverId,
          entity_type: 'expense',
          entity_id: expenseId,
          changes: { status: 'approved', note: 'admin_force_approved' },
        });
        eventBus.emit('finance.expense.approved', {
          expenseId, approverId, amount: expense.rows[0].original_amount,
        });
        journalEntryService.generateFromExpense(expenseId, 'approved').catch((err: unknown) =>
          console.error('[journal] Failed to generate expense approval entry:', err));
        return { success: true, newStatus: 'approved' };
      }

      await client.query(
        `UPDATE approval_steps SET status = 'approved', decision_at = NOW(), decision_notes = $1
         WHERE id = $2`,
        [comments ?? null, step.rows[0].id],
      );

      const pendingSteps = await client.query(
        `SELECT COUNT(*) as count FROM approval_steps
         WHERE reimbursement_id = $1 AND status = 'pending'`,
        [expenseId],
      );
      const pendingCount = parseInt(pendingSteps.rows[0]?.count ?? '0', 10);

      let newStatus: string;
      if (pendingCount === 0) {
        newStatus = 'approved';
      } else {
        newStatus = expense.rows[0].status;
      }

      await client.query(
        `UPDATE reimbursement_requests
         SET status = $1::TEXT, approved_at = CASE WHEN $1::TEXT = 'approved' THEN NOW() ELSE approved_at END,
             updated_at = NOW(), updated_by = $2::UUID
         WHERE id = $3::UUID`,
        [newStatus, approverId, expenseId],
      );

      if (expense.rows[0].budget_id && newStatus === 'approved') {
        await client.query(
          `UPDATE finance_budgets SET spent_amount = spent_amount + $1 WHERE id = $2`,
          [expense.rows[0].original_amount, expense.rows[0].budget_id],
        );
      }

      await client.query('COMMIT');

      await auditService.log({
        organization_id: orgId,
        event_type: 'expense.approved',
        event_category: 'expense',
        actor_type: 'user',
        actor_id: approverId,
        entity_type: 'expense',
        entity_id: expenseId,
        changes: { status: newStatus },
      });

      eventBus.emit('finance.expense.approved', {
        expenseId, approverId, amount: expense.rows[0].original_amount,
      });

      await notificationService.create({
        organization_id: orgId,
        recipient_id: expense.rows[0].submitted_by,
        type: 'expense.approved',
        title: 'Expense Approved',
        message: `Your expense "${expense.rows[0].title}" has been approved.`,
        entity_type: 'expense',
        entity_id: expenseId,
        action_url: `/finance/expenses/${expenseId}`,
      });

      if (newStatus === 'approved') {
        journalEntryService.generateFromExpense(expenseId, 'approved').catch((err: unknown) =>
          console.error('[journal] Failed to generate expense approval entry:', err));
      }

      return { success: true, newStatus };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async reject(expenseId: string, approverId: string, orgId: string, reason: string) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const expense = await client.query(
        'SELECT * FROM reimbursement_requests WHERE id = $1 AND organization_id = $2 AND is_deleted = FALSE',
        [expenseId, orgId],
      );
      if (!expense.rows[0]) throw new Error('Expense not found');

      const approverRow2 = await client.query('SELECT role FROM reimbursement_users WHERE id = $1', [approverId]);
      const approverRole2 = approverRow2.rows[0]?.role ?? 'employee';
      const isPrivileged2 = ['admin', 'finance', 'cfo', 'finance_admin'].includes(approverRole2);

      let step = await client.query(
        `SELECT * FROM approval_steps
         WHERE reimbursement_id = $1 AND assigned_to = $2 AND status = 'pending'
         ORDER BY step_order LIMIT 1`,
        [expenseId, approverId],
      );
      if (!step.rows[0]) {
        step = await client.query(
          `SELECT s.* FROM approval_steps s
           JOIN reimbursement_users u ON u.id = $2
           WHERE s.reimbursement_id = $1 AND s.status = 'pending'
             AND u.role IN ('manager', 'admin', 'finance', 'cfo', 'finance_admin')
           ORDER BY s.step_order LIMIT 1`,
          [expenseId, approverId],
        );
      }
      // Privileged users can reject even without an existing pending step
      let stepId: string;
      if (!step.rows[0]) {
        if (!isPrivileged2) throw new Error('No pending approval step for this user');
        const forceStep = await client.query(
          `INSERT INTO approval_steps
           (reimbursement_id, step_order, step_type, assigned_to, status, entity_type, entity_id, step_name, decision_at, decision_notes)
           VALUES ($1::UUID, 1, 'manager_approval', $2::UUID, 'rejected', 'expense', $3::UUID, 'Admin Rejection', NOW(), $4)
           ON CONFLICT (reimbursement_id, step_order) DO UPDATE
             SET status = 'rejected', decision_at = NOW(), assigned_to = EXCLUDED.assigned_to, decision_notes = EXCLUDED.decision_notes
           RETURNING id`,
          [expenseId, approverId, expenseId, reason],
        );
        stepId = forceStep.rows[0].id;
      } else {
        stepId = step.rows[0].id;
        await client.query(
          `UPDATE approval_steps SET status = 'rejected', decision_at = NOW(), decision_notes = $1
           WHERE id = $2`,
          [reason, stepId],
        );
      }

      await client.query(
        `UPDATE reimbursement_requests
         SET status = 'rejected', rejection_reason = $1, updated_at = NOW(), updated_by = $2
         WHERE id = $3`,
        [reason, approverId, expenseId],
      );

      await client.query('COMMIT');

      await auditService.log({
        organization_id: orgId,
        event_type: 'expense.rejected',
        event_category: 'expense',
        actor_type: 'user',
        actor_id: approverId,
        entity_type: 'expense',
        entity_id: expenseId,
        changes: { status: 'rejected', reason },
      });

      eventBus.emit('finance.expense.rejected', { expenseId, approverId, reason });

      await notificationService.create({
        organization_id: orgId,
        recipient_id: expense.rows[0].submitted_by,
        type: 'expense.rejected',
        title: 'Expense Rejected',
        message: `Your expense "${expense.rows[0].title}" was rejected: ${reason}`,
        entity_type: 'expense',
        entity_id: expenseId,
        action_url: `/finance/expenses/${expenseId}`,
        priority: 'high',
      });

      return { success: true };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async bulkApprove(expenseIds: string[], approverId: string, orgId: string) {
    const results: Array<{ id: string; success: boolean; error?: string }> = [];
    for (const id of expenseIds) {
      try {
        await this.approve(id, approverId, orgId);
        results.push({ id, success: true });
      } catch (err) {
        results.push({ id, success: false, error: err instanceof Error ? err.message : 'Unknown error' });
      }
    }
    return results;
  },

  async requestInfo(expenseId: string, approverId: string, orgId: string, message: string) {
    const expense = await query(
      'SELECT * FROM reimbursement_requests WHERE id = $1 AND organization_id = $2 AND is_deleted = FALSE',
      [expenseId, orgId],
    );
    if (!expense.rows[0]) throw new Error('Expense not found');

    await query(
      `UPDATE reimbursement_requests SET status = 'info_requested', updated_at = NOW(), updated_by = $1 WHERE id = $2`,
      [approverId, expenseId],
    );

    await query(
      `INSERT INTO reimbursement_comments (reimbursement_id, user_id, comment_text, is_internal)
       VALUES ($1, $2, $3, FALSE)`,
      [expenseId, approverId, `[Info Requested] ${message}`],
    );

    await auditService.log({
      organization_id: orgId,
      event_type: 'expense.info_requested',
      event_category: 'expense',
      actor_type: 'user',
      actor_id: approverId,
      entity_type: 'expense',
      entity_id: expenseId,
      changes: { status: 'info_requested', message },
    });

    await notificationService.create({
      organization_id: orgId,
      recipient_id: expense.rows[0].submitted_by,
      type: 'expense.info_requested',
      title: 'More Information Needed',
      message: `Your expense "${expense.rows[0].title}" requires additional information: ${message}`,
      entity_type: 'expense',
      entity_id: expenseId,
      action_url: `/finance/expenses/${expenseId}`,
      priority: 'high',
    });

    return { success: true };
  },

  async markPaid(expenseId: string, userId: string, orgId: string, notes?: string) {
    const expense = await query(
      'SELECT * FROM reimbursement_requests WHERE id = $1 AND organization_id = $2 AND is_deleted = FALSE',
      [expenseId, orgId],
    );
    if (!expense.rows[0]) throw new Error('Expense not found');
    if (expense.rows[0].status !== 'approved') {
      throw new Error('Only approved expenses can be marked as paid');
    }

    await query(
      `UPDATE reimbursement_requests
       SET status = 'paid', paid_at = NOW(), updated_at = NOW(), updated_by = $1::UUID
       WHERE id = $2::UUID`,
      [userId, expenseId],
    );

    await auditService.log({
      organization_id: orgId,
      event_type: 'expense.paid',
      event_category: 'expense',
      actor_type: 'user',
      actor_id: userId,
      entity_type: 'expense',
      entity_id: expenseId,
      changes: { status: 'paid', notes },
    });

    await notificationService.create({
      organization_id: orgId,
      recipient_id: expense.rows[0].submitted_by,
      type: 'expense.paid',
      title: 'Expense Paid',
      message: `Your expense "${expense.rows[0].title}" has been paid.`,
      entity_type: 'expense',
      entity_id: expenseId,
      action_url: `/finance/expenses/${expenseId}`,
      priority: 'medium',
    });

    journalEntryService.generateFromExpense(expenseId, 'paid').catch((err: unknown) =>
      console.error('[journal] Failed to generate payment entry:', err));

    return { success: true };
  },

  async getDashboardMetrics(orgId: string, userId: string, userRole: string) {
    const level = { admin: 6, cfo: 5, finance_admin: 4, finance: 3, manager: 2, employee: 1 }[userRole] ?? 0;
    const scopeClause = level >= 3 ? '' : `AND submitted_by = '${userId}'`;

    const [pending, underReview, approvedMonth, totalPaid, overdue] = await Promise.all([
      query<{ count: string; total: string }>(
        `SELECT COUNT(*) as count, COALESCE(SUM(original_amount),0) as total
         FROM reimbursement_requests WHERE organization_id = $1 AND is_deleted = FALSE
         AND status IN ('submitted','manager_review','finance_review','ai_reviewing') ${scopeClause}`,
        [orgId],
      ),
      query<{ count: string; avg_days: string }>(
        `SELECT COUNT(*) as count,
                COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - submitted_at))/86400),0) as avg_days
         FROM reimbursement_requests WHERE organization_id = $1 AND is_deleted = FALSE
         AND status IN ('ai_reviewing','manager_review','finance_review') ${scopeClause}`,
        [orgId],
      ),
      query<{ count: string; total: string }>(
        `SELECT COUNT(*) as count, COALESCE(SUM(original_amount),0) as total
         FROM reimbursement_requests WHERE organization_id = $1 AND is_deleted = FALSE
         AND status IN ('approved','manager_approved','finance_approved','ai_approved')
         AND approved_at >= DATE_TRUNC('month', NOW()) ${scopeClause}`,
        [orgId],
      ),
      query<{ total: string }>(
        `SELECT COALESCE(SUM(original_amount),0) as total
         FROM reimbursement_requests WHERE organization_id = $1 AND is_deleted = FALSE
         AND status IN ('paid','reimbursed')
         AND paid_at >= DATE_TRUNC('year', NOW()) ${scopeClause}`,
        [orgId],
      ),
      query<{ count: string; total: string }>(
        `SELECT COUNT(*) as count, COALESCE(SUM(grand_total),0) as total
         FROM invoices WHERE organization_id = $1 AND status = 'overdue' ${level >= 3 ? '' : `AND employee_id = '${userId}'`}`,
        [orgId],
      ),
    ]);

    return {
      pending_expenses: { count: parseInt(pending.rows[0]?.count ?? '0'), total: parseFloat(pending.rows[0]?.total ?? '0') },
      under_review: { count: parseInt(underReview.rows[0]?.count ?? '0'), avg_days: parseFloat(underReview.rows[0]?.avg_days ?? '0') },
      approved_this_month: { count: parseInt(approvedMonth.rows[0]?.count ?? '0'), total: parseFloat(approvedMonth.rows[0]?.total ?? '0') },
      total_paid_ytd: parseFloat(totalPaid.rows[0]?.total ?? '0'),
      overdue_invoices: { count: parseInt(overdue.rows[0]?.count ?? '0'), total: parseFloat(overdue.rows[0]?.total ?? '0') },
    };
  },
};
