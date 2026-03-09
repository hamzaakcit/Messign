import type {
  WriteActionType,
  ActionExecutionResult,
  PendingAction,
} from './types.js';
import { markExecuted } from './actionStore.js';
import { updateTask } from '../../../db/tasksDb.js';
import { createBudget, updateBudget, logFinancialAction } from '../../../db/budgetDb.js';
import { query } from '../../../db/index.js';

export async function executeConfirmedAction(
  action: PendingAction,
): Promise<ActionExecutionResult> {
  const { actionType, payload, token } = action;

  console.log(`[ActionExecutor] Executing ${actionType} (token: ${token.substring(0, 8)}...)`);

  try {
    let result: ActionExecutionResult;

    switch (actionType) {
      case 'create_task':
        result = await executeCreateTask(payload);
        break;
      case 'update_task_status':
        result = await executeUpdateTaskStatus(payload);
        break;
      case 'update_task':
        result = await executeUpdateTask(payload);
        break;
      case 'draft_invoice':
        result = await executeDraftInvoice(payload);
        break;
      case 'send_chat_message':
        result = await executeSendChatMessage(payload);
        break;
      case 'send_reminder':
        result = await executeSendReminder(payload);
        break;
      case 'approve_expense':
        result = await executeApproveExpense(payload);
        break;
      case 'flag_expense':
        result = await executeFlagExpense(payload);
        break;
      case 'create_budget_alert':
        result = await executeCreateBudgetAlert(payload);
        break;
      case 'create_budget':
        result = await executeCreateBudget(payload);
        break;
      case 'update_budget':
        result = await executeUpdateBudget(payload);
        break;
      case 'auto_approve_expense':
        result = await executeAutoApproveExpense(payload);
        break;
      case 'flag_expense_for_review':
        result = await executeFlagExpenseForReview(payload);
        break;
      case 'generate_invoice':
        result = await executeGenerateInvoice(payload);
        break;
      case 'send_payment_reminder':
        result = await executeSendPaymentReminder(payload);
        break;
      case 'suggest_budget_reallocation':
        result = await executeSuggestBudgetReallocation(payload);
        break;
      default:
        result = {
          success: false,
          actionType,
          message: `Unknown action type: ${actionType}`,
          error: 'UNKNOWN_ACTION_TYPE',
        };
    }

    if (result.success) {
      await markExecuted(token);
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ActionExecutor] ${actionType} failed:`, message);

    return {
      success: false,
      actionType,
      message: `Failed to execute action: ${message}`,
      error: message,
    };
  }
}

// Wire these to real DB mutations as each module's API becomes available.

async function executeCreateTask(
  payload: Record<string, unknown>,
): Promise<ActionExecutionResult> {
  console.log('[ActionExecutor] create_task payload:', JSON.stringify(payload, null, 2));

  return {
    success: true,
    actionType: 'create_task',
    message: `Task "${payload.title}" created in ${payload.project_name} and assigned to ${payload.assignee}.`,
    result: {
      taskId: `task-${Date.now()}`,
      title: payload.title,
      projectName: payload.project_name,
    },
  };
}

async function executeUpdateTaskStatus(
  payload: Record<string, unknown>,
): Promise<ActionExecutionResult> {
  console.log('[ActionExecutor] update_task_status payload:', JSON.stringify(payload, null, 2));

  return {
    success: true,
    actionType: 'update_task_status',
    message: `Task "${payload.task_title}" status updated to ${payload.new_status}.`,
    result: { taskTitle: payload.task_title, newStatus: payload.new_status },
  };
}

async function executeUpdateTask(
  payload: Record<string, unknown>,
): Promise<ActionExecutionResult> {
  const taskId = payload.task_id as string;
  if (!taskId) {
    return {
      success: false,
      actionType: 'update_task',
      message: 'Task ID is required.',
      error: 'MISSING_TASK_ID',
    };
  }

  const updates: Record<string, unknown> = {};
  if (payload.due_date != null && String(payload.due_date).trim() !== '') {
    updates.dueDate = String(payload.due_date).trim();
  }
  if (payload.title != null && String(payload.title).trim() !== '') {
    updates.title = String(payload.title).trim();
  }
  if (payload.description != null) {
    updates.description = String(payload.description);
  }
  if (payload.priority != null && String(payload.priority).trim() !== '') {
    updates.priority = String(payload.priority).trim();
  }
  if (payload.status != null && String(payload.status).trim() !== '') {
    updates.status = String(payload.status).trim();
  }

  if (Object.keys(updates).length === 0) {
    return {
      success: false,
      actionType: 'update_task',
      message: 'No updates provided (due_date, title, description, priority, or status).',
      error: 'NO_UPDATES',
    };
  }

  try {
    const task = await updateTask(taskId, updates as Parameters<typeof updateTask>[1]);
    if (!task) {
      return {
        success: false,
        actionType: 'update_task',
        message: 'Task not found.',
        error: 'TASK_NOT_FOUND',
      };
    }
    const parts: string[] = [];
    if (updates.dueDate) parts.push(`due date to ${updates.dueDate}`);
    if (updates.title) parts.push(`title to "${updates.title}"`);
    if (updates.priority) parts.push(`priority to ${updates.priority}`);
    if (updates.status) parts.push(`status to ${updates.status}`);
    return {
      success: true,
      actionType: 'update_task',
      message: `Task "${task.title}" updated: ${parts.join(', ')}.`,
      result: { taskId: task.id, title: task.title, ...updates },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ActionExecutor] update_task failed:', message);
    return {
      success: false,
      actionType: 'update_task',
      message: `Failed to update task: ${message}`,
      error: message,
    };
  }
}

async function executeDraftInvoice(
  payload: Record<string, unknown>,
): Promise<ActionExecutionResult> {
  console.log('[ActionExecutor] draft_invoice payload:', JSON.stringify(payload, null, 2));

  const invoiceId = `MSG-2026-${String(Math.floor(Math.random() * 900) + 100)}`;

  return {
    success: true,
    actionType: 'draft_invoice',
    message: `Invoice ${invoiceId} drafted for ${payload.client_name}: $${(payload.amount as number).toLocaleString()}.`,
    result: { invoiceId, clientName: payload.client_name, amount: payload.amount },
  };
}

async function executeSendChatMessage(
  payload: Record<string, unknown>,
): Promise<ActionExecutionResult> {
  console.log('[ActionExecutor] send_chat_message payload:', JSON.stringify(payload, null, 2));

  return {
    success: true,
    actionType: 'send_chat_message',
    message: `Message sent to #${payload.channel}.`,
    result: { channel: payload.channel },
  };
}

async function executeSendReminder(
  payload: Record<string, unknown>,
): Promise<ActionExecutionResult> {
  console.log('[ActionExecutor] send_reminder payload:', JSON.stringify(payload, null, 2));

  return {
    success: true,
    actionType: 'send_reminder',
    message: `Reminder sent to ${payload.recipient}.`,
    result: { recipient: payload.recipient },
  };
}

async function executeApproveExpense(
  payload: Record<string, unknown>,
): Promise<ActionExecutionResult> {
  const reimbursementId = payload.reimbursement_id as string;
  if (!reimbursementId) {
    return { success: false, actionType: 'approve_expense', message: 'Reimbursement ID required.', error: 'MISSING_ID' };
  }

  try {
    const result = await query<{ status: string; title: string }>(
      `SELECT status, title FROM reimbursement_requests WHERE id = $1`,
      [reimbursementId],
    );
    const row = result.rows[0];
    if (!row) {
      return { success: false, actionType: 'approve_expense', message: 'Expense not found.', error: 'NOT_FOUND' };
    }

    const statusMap: Record<string, string> = {
      submitted: 'manager_review',
      manager_review: 'finance_review',
      finance_review: 'approved',
    };
    const nextStatus = statusMap[row.status];
    if (!nextStatus) {
      return { success: false, actionType: 'approve_expense', message: `Cannot approve expense in "${row.status}" status.`, error: 'INVALID_STATUS' };
    }

    await query(`UPDATE reimbursement_requests SET status = $1, updated_at = NOW() WHERE id = $2`, [nextStatus, reimbursementId]);

    if (payload.comment) {
      await query(
        `INSERT INTO reimbursement_comments (reimbursement_id, user_id, comment) VALUES ($1, $2, $3)`,
        [reimbursementId, null, `[Dora AI] ${payload.comment}`],
      );
    }

    await logFinancialAction({
      actionType: 'approve_expense',
      relatedEntityType: 'reimbursement_request',
      relatedEntityId: reimbursementId,
      reasoning: `Dora AI approved expense "${row.title}" from ${row.status} → ${nextStatus}`,
    });

    return {
      success: true,
      actionType: 'approve_expense',
      message: `Expense "${row.title}" approved (${row.status} → ${nextStatus}).`,
      result: { reimbursementId, title: row.title, newStatus: nextStatus },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ActionExecutor] approve_expense failed:', message);
    return { success: false, actionType: 'approve_expense', message: `Failed: ${message}`, error: message };
  }
}

async function executeFlagExpense(
  payload: Record<string, unknown>,
): Promise<ActionExecutionResult> {
  const reimbursementId = payload.reimbursement_id as string;
  const reason = payload.reason as string;
  if (!reimbursementId || !reason) {
    return { success: false, actionType: 'flag_expense', message: 'Reimbursement ID and reason required.', error: 'MISSING_FIELDS' };
  }

  try {
    const result = await query<{ title: string; status: string }>(
      `SELECT title, status FROM reimbursement_requests WHERE id = $1`,
      [reimbursementId],
    );
    const row = result.rows[0];
    if (!row) {
      return { success: false, actionType: 'flag_expense', message: 'Expense not found.', error: 'NOT_FOUND' };
    }

    await query(
      `INSERT INTO reimbursement_activity_log (reimbursement_id, user_id, action, action_details)
       VALUES ($1, $2, 'flagged_by_ai', $3)`,
      [reimbursementId, null, JSON.stringify({ reason, flagged_by: 'dora_ai' })],
    );

    await query(
      `INSERT INTO reimbursement_comments (reimbursement_id, user_id, comment) VALUES ($1, $2, $3)`,
      [reimbursementId, null, `[Dora AI Flag] ${reason}`],
    );

    await logFinancialAction({
      actionType: 'flag_expense',
      relatedEntityType: 'reimbursement_request',
      relatedEntityId: reimbursementId,
      reasoning: `Dora AI flagged expense "${row.title}": ${reason}`,
    });

    return {
      success: true,
      actionType: 'flag_expense',
      message: `Expense "${row.title}" flagged for review: ${reason}`,
      result: { reimbursementId, title: row.title, reason },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ActionExecutor] flag_expense failed:', message);
    return { success: false, actionType: 'flag_expense', message: `Failed: ${message}`, error: message };
  }
}

async function executeCreateBudgetAlert(
  payload: Record<string, unknown>,
): Promise<ActionExecutionResult> {
  const department = payload.department as string;
  const threshold = payload.threshold as number;
  if (!department || threshold == null) {
    return { success: false, actionType: 'create_budget_alert', message: 'Department and threshold required.', error: 'MISSING_FIELDS' };
  }

  try {
    const orgResult = await query<{ id: string }>(`SELECT id FROM organizations WHERE slug = 'messign' LIMIT 1`);
    const orgId = orgResult.rows[0]?.id;
    if (!orgId) throw new Error('Organization not found');

    const budgetResult = await query<{ id: string }>(
      `SELECT id FROM finance_budgets WHERE organization_id = $1 AND department = $2 AND period_start <= CURRENT_DATE AND period_end >= CURRENT_DATE LIMIT 1`,
      [orgId, department],
    );
    const budget = budgetResult.rows[0];

    if (budget) {
      await query(`UPDATE finance_budgets SET alert_threshold = $1, updated_at = NOW() WHERE id = $2`, [threshold, budget.id]);
    }

    await logFinancialAction({
      actionType: 'create_budget_alert',
      relatedEntityType: 'budget',
      relatedEntityId: budget?.id || 'no_active_budget',
      reasoning: `Dora AI set budget alert for ${department} at ${(threshold * 100).toFixed(0)}%`,
      metadata: { department, threshold, message: payload.message },
    });

    return {
      success: true,
      actionType: 'create_budget_alert',
      message: `Budget alert set for ${department} at ${(threshold * 100).toFixed(0)}% threshold.${budget ? '' : ' Note: No active budget found for this department.'}`,
      result: { department, threshold, budgetId: budget?.id },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ActionExecutor] create_budget_alert failed:', message);
    return { success: false, actionType: 'create_budget_alert', message: `Failed: ${message}`, error: message };
  }
}

async function executeCreateBudget(
  payload: Record<string, unknown>,
): Promise<ActionExecutionResult> {
  const department = payload.department as string;
  const allocatedAmount = payload.allocated_amount as number;
  const periodStart = payload.period_start as string;
  const periodEnd = payload.period_end as string;

  if (!department || !allocatedAmount || !periodStart || !periodEnd) {
    return {
      success: false,
      actionType: 'create_budget',
      message: 'Missing required fields: department, allocated_amount, period_start, period_end.',
      error: 'MISSING_FIELDS',
    };
  }

  try {
    const orgResult = await query<{ id: string }>(`SELECT id FROM organizations WHERE slug = 'messign' LIMIT 1`);
    const orgId = orgResult.rows[0]?.id;
    if (!orgId) throw new Error('Organization not found');

    const budget = await createBudget(orgId, {
      department,
      periodStart,
      periodEnd,
      allocatedAmount,
      currency: (payload.currency as string) || 'EUR',
      alertThreshold: (payload.alert_threshold as number) ?? 0.8,
    });

    await logFinancialAction({
      actionType: 'create_budget',
      relatedEntityType: 'budget',
      relatedEntityId: budget.id,
      reasoning: `Dora AI created budget for ${department}: ${budget.currency} ${allocatedAmount}`,
    });

    return {
      success: true,
      actionType: 'create_budget',
      message: `Budget created for ${department}: ${budget.currency} ${allocatedAmount.toLocaleString()} (${periodStart} → ${periodEnd}).`,
      result: { budgetId: budget.id, department, allocatedAmount },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ActionExecutor] create_budget failed:', message);
    return {
      success: false,
      actionType: 'create_budget',
      message: `Failed to create budget: ${message}`,
      error: message,
    };
  }
}

async function executeUpdateBudget(
  payload: Record<string, unknown>,
): Promise<ActionExecutionResult> {
  const budgetId = payload.budget_id as string;
  if (!budgetId) {
    return {
      success: false,
      actionType: 'update_budget',
      message: 'Budget ID is required.',
      error: 'MISSING_BUDGET_ID',
    };
  }

  try {
    const orgResult = await query<{ id: string }>(`SELECT id FROM organizations WHERE slug = 'messign' LIMIT 1`);
    const orgId = orgResult.rows[0]?.id;
    if (!orgId) throw new Error('Organization not found');

    const budget = await updateBudget(budgetId, orgId, {
      allocatedAmount: payload.allocated_amount as number | undefined,
      periodStart: payload.period_start as string | undefined,
      periodEnd: payload.period_end as string | undefined,
      alertThreshold: payload.alert_threshold as number | undefined,
    });

    if (!budget) {
      return {
        success: false,
        actionType: 'update_budget',
        message: 'Budget not found.',
        error: 'BUDGET_NOT_FOUND',
      };
    }

    await logFinancialAction({
      actionType: 'update_budget',
      relatedEntityType: 'budget',
      relatedEntityId: budget.id,
      reasoning: `Dora AI updated budget for ${budget.department}`,
    });

    return {
      success: true,
      actionType: 'update_budget',
      message: `Budget for ${budget.department} updated successfully.`,
      result: { budgetId: budget.id, department: budget.department },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ActionExecutor] update_budget failed:', message);
    return {
      success: false,
      actionType: 'update_budget',
      message: `Failed to update budget: ${message}`,
      error: message,
    };
  }
}

async function executeAutoApproveExpense(payload: Record<string, unknown>): Promise<ActionExecutionResult> {
  try {
    const { query: dbQuery } = await import('../../../db/index.js');
    const expenseId = payload.expense_id as string;
    const reason = payload.reason as string;

    await dbQuery(
      `UPDATE reimbursement_requests SET status = 'ai_approved', ai_auto_approved = TRUE,
       ai_review_notes = $1, approved_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [reason, expenseId],
    );

    return {
      success: true,
      actionType: 'auto_approve_expense',
      message: `Expense auto-approved: ${reason}`,
      result: { expenseId },
    };
  } catch (err) {
    return { success: false, actionType: 'auto_approve_expense', message: `Failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function executeFlagExpenseForReview(payload: Record<string, unknown>): Promise<ActionExecutionResult> {
  try {
    const { query: dbQuery } = await import('../../../db/index.js');
    const expenseId = payload.expense_id as string;
    const reason = payload.reason as string;
    const riskLevel = (payload.risk_level as string) ?? 'medium';

    const riskScore = { low: 0.3, medium: 0.6, high: 0.9 }[riskLevel] ?? 0.6;

    await dbQuery(
      `UPDATE reimbursement_requests SET status = 'ai_flagged',
       ai_risk_score = $1, ai_review_notes = $2,
       ai_risk_flags = COALESCE(ai_risk_flags, '[]'::jsonb) || $3::jsonb,
       updated_at = NOW() WHERE id = $4`,
      [riskScore, reason, JSON.stringify([{ type: 'manual_flag', severity: riskLevel, description: reason }]), expenseId],
    );

    return {
      success: true,
      actionType: 'flag_expense_for_review',
      message: `Expense flagged for review: ${reason}`,
      result: { expenseId, riskLevel },
    };
  } catch (err) {
    return { success: false, actionType: 'flag_expense_for_review', message: `Failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function executeGenerateInvoice(payload: Record<string, unknown>): Promise<ActionExecutionResult> {
  try {
    const { invoiceService } = await import('../../finance/invoiceService.js');
    const { query: dbQuery } = await import('../../../db/index.js');

    const orgResult = await dbQuery<{ id: string }>('SELECT id FROM organizations WHERE slug = $1', ['messign']);
    const orgId = orgResult.rows[0]?.id;
    if (!orgId) throw new Error('Organization not found');

    const items = typeof payload.items === 'string' ? JSON.parse(payload.items) : (payload.items as unknown[]) ?? [];

    const invoice = await invoiceService.create({
      from_name: 'Messign',
      to_name: payload.client_name as string,
      currency: (payload.currency as string) ?? 'USD',
      payment_terms: (payload.payment_terms as string) ?? 'Net 30',
      line_items: items,
    }, 'system', orgId);

    return {
      success: true,
      actionType: 'generate_invoice',
      message: `Invoice ${invoice.invoice_number} generated for ${payload.client_name}.`,
      result: { invoiceId: invoice.id, invoiceNumber: invoice.invoice_number },
    };
  } catch (err) {
    return { success: false, actionType: 'generate_invoice', message: `Failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function executeSendPaymentReminder(payload: Record<string, unknown>): Promise<ActionExecutionResult> {
  try {
    const { query: dbQuery } = await import('../../../db/index.js');
    const { notificationService } = await import('../../finance/notificationService.js');

    const invoiceId = payload.invoice_id as string;
    const message = (payload.message as string) ?? 'Payment reminder for your invoice.';

    const inv = await dbQuery('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
    if (!inv.rows[0]) throw new Error('Invoice not found');

    const orgResult = await dbQuery<{ id: string }>('SELECT id FROM organizations WHERE slug = $1', ['messign']);
    const orgId = orgResult.rows[0]?.id;
    if (!orgId) throw new Error('Organization not found');

    if (inv.rows[0].employee_id) {
      await notificationService.create({
        organization_id: orgId,
        recipient_id: inv.rows[0].employee_id,
        type: 'invoice.payment_reminder',
        title: 'Payment Reminder',
        message,
        entity_type: 'invoice',
        entity_id: invoiceId,
        priority: 'high',
        ai_generated: true,
      });
    }

    return {
      success: true,
      actionType: 'send_payment_reminder',
      message: `Payment reminder sent for invoice ${inv.rows[0].invoice_number ?? invoiceId.substring(0, 8)}.`,
      result: { invoiceId },
    };
  } catch (err) {
    return { success: false, actionType: 'send_payment_reminder', message: `Failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function executeSuggestBudgetReallocation(payload: Record<string, unknown>): Promise<ActionExecutionResult> {
  try {
    const { auditService } = await import('../../finance/auditService.js');
    const { query: dbQuery } = await import('../../../db/index.js');

    const orgResult = await dbQuery<{ id: string }>('SELECT id FROM organizations WHERE slug = $1', ['messign']);
    const orgId = orgResult.rows[0]?.id;
    if (!orgId) throw new Error('Organization not found');

    await auditService.log({
      organization_id: orgId,
      event_type: 'budget.reallocation_suggested',
      event_category: 'budget',
      actor_type: 'ai',
      actor_name: 'Dora AI',
      entity_type: 'budget',
      entity_id: payload.to_budget_id as string,
      changes: {
        from: payload.from_budget_id,
        to: payload.to_budget_id,
        amount: payload.amount,
        reason: payload.reason,
      },
      ai_involved: true,
    });

    return {
      success: true,
      actionType: 'suggest_budget_reallocation',
      message: `Budget reallocation suggestion logged: $${payload.amount} from ${payload.from_budget_id} to ${payload.to_budget_id}.`,
      result: payload,
    };
  } catch (err) {
    return { success: false, actionType: 'suggest_budget_reallocation', message: `Failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
