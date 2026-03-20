import type {
  WriteActionType,
  ActionExecutionResult,
  PendingAction,
} from './types.js';
import { getHitlIdempotencyResult, markExecuted, recordHitlIdempotencyResult } from './actionStore.js';
import { updateTask } from '../../../db/tasksDb.js';
import { createBudget, updateBudget, logFinancialAction } from '../../../db/budgetDb.js';
import { query } from '../../../db/index.js';
import { logAuditEvent } from '../../../platform/audit.js';

interface ActionExecutionContext {
  authUserId: string;
  actorReimbursementUserId: string;
  role: string;
  organizationId: string;
}

export async function executeConfirmedAction(
  action: PendingAction,
  context: ActionExecutionContext,
): Promise<ActionExecutionResult> {
  const { actionType, payload, token } = action;
  const authzError = checkWritePermission(actionType, context.role);
  if (authzError) {
    return {
      success: false,
      actionType,
      message: authzError,
      error: 'FORBIDDEN',
    };
  }

  console.log(`[ActionExecutor] Executing ${actionType} (token: ${token.substring(0, 8)}...)`);

  try {
    if (action.idempotencyKey && context.organizationId) {
      const cached = await getHitlIdempotencyResult(
        context.organizationId,
        context.authUserId,
        action.idempotencyKey,
      );
      if (cached?.success) {
        return {
          success: true,
          actionType,
          message: cached.message,
          result: cached.result ?? undefined,
        };
      }
    }

    let result: ActionExecutionResult;

    switch (actionType) {
      case 'projects:create_task':
        result = await executeCreateTask(payload);
        break;
      case 'projects:update_task_status':
        result = await executeUpdateTaskStatus(payload);
        break;
      case 'projects:update_task':
        result = await executeUpdateTask(payload);
        break;
      case 'finance:draft_invoice':
        result = await executeDraftInvoice(payload);
        break;
      case 'communication:send_chat_message':
        result = await executeSendChatMessage(payload);
        break;
      case 'core:send_reminder':
        result = await executeSendReminder(payload);
        break;
      case 'finance:approve_expense':
        result = await executeApproveExpense(payload, context);
        break;
      case 'finance:flag_expense':
        result = await executeFlagExpense(payload, context);
        break;
      case 'finance:create_budget_alert':
        result = await executeCreateBudgetAlert(payload, context);
        break;
      case 'finance:create_budget':
        result = await executeCreateBudget(payload, context);
        break;
      case 'finance:update_budget':
        result = await executeUpdateBudget(payload, context);
        break;
      case 'finance:auto_approve_expense':
        result = await executeAutoApproveExpense(payload, context);
        break;
      case 'finance:flag_expense_for_review':
        result = await executeFlagExpenseForReview(payload, context);
        break;
      case 'finance:generate_invoice':
        result = await executeGenerateInvoice(payload, context);
        break;
      case 'finance:send_payment_reminder':
        result = await executeSendPaymentReminder(payload, context);
        break;
      case 'finance:suggest_budget_reallocation':
        result = await executeSuggestBudgetReallocation(payload, context);
        break;
      case 'crm:create_deal':
        result = await executeCreateDeal(payload, context);
        break;
      case 'support:create_ticket':
        result = await executeCreateTicket(payload, context);
        break;
      case 'assets:assign_asset':
        result = await executeAssignAsset(payload, context);
        break;
      case 'contracts:send_renewal_reminder':
        result = await executeSendRenewalReminder(payload, context);
        break;
      case 'marketing:create_campaign':
        result = await executeCreateCampaign(payload, context);
        break;
      case 'recruitment:post_job':
        result = await executePostJob(payload, context);
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
      logAuditEvent({
        tenantId: context.organizationId,
        userId: context.authUserId,
        action: 'data.write',
        resourceType: actionType,
        resourceId: (result.result && typeof result.result.id === 'string' ? result.result.id : undefined),
        details: {
          actionType,
          payload: Object.keys(payload),
          result: result.message,
        },
      });
      if (action.idempotencyKey && context.organizationId) {
        await recordHitlIdempotencyResult(
          context.organizationId,
          context.authUserId,
          action.idempotencyKey,
          actionType,
          true,
          result.message,
          result.result ?? null,
        );
      }
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

function checkWritePermission(actionType: WriteActionType, role: string): string | null {
  const normalizedRole = String(role || '').toLowerCase();
  const roleMap: Partial<Record<WriteActionType, string[]>> = {
    'finance:create_budget': ['admin', 'finance'],
    'finance:update_budget': ['admin', 'finance'],
    'finance:create_budget_alert': ['admin', 'finance', 'manager'],
    'finance:approve_expense': ['admin', 'finance', 'manager'],
    'finance:flag_expense': ['admin', 'finance', 'manager', 'hr'],
    'finance:auto_approve_expense': ['admin', 'finance'],
    'finance:flag_expense_for_review': ['admin', 'finance', 'manager'],
    'finance:generate_invoice': ['admin', 'finance'],
    'finance:send_payment_reminder': ['admin', 'finance'],
    'finance:suggest_budget_reallocation': ['admin', 'finance'],
    'crm:create_deal': ['admin', 'manager', 'dept_head', 'system_admin'],
    'assets:assign_asset': ['admin', 'manager', 'dept_head', 'system_admin'],
    'contracts:send_renewal_reminder': ['admin', 'manager', 'dept_head', 'system_admin'],
    'marketing:create_campaign': ['admin', 'manager', 'dept_head', 'system_admin'],
    'recruitment:post_job': ['admin', 'manager', 'dept_head', 'system_admin'],
    'support:create_ticket': ['admin', 'manager', 'member', 'dept_head', 'system_admin'],
  };
  const allowedRoles = roleMap[actionType];
  if (!allowedRoles) return null;
  if (!allowedRoles.includes(normalizedRole)) {
    return `Role "${role}" is not allowed to execute action "${actionType}".`;
  }
  return null;
}

// Wire these to real DB mutations as each module's API becomes available.

async function executeCreateTask(
  payload: Record<string, unknown>,
): Promise<ActionExecutionResult> {
  console.log('[ActionExecutor] create_task payload:', JSON.stringify(payload, null, 2));

  return {
    success: true,
    actionType: 'projects:create_task',
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
    actionType: 'projects:update_task_status',
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
      actionType: 'projects:update_task',
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
      actionType: 'projects:update_task',
      message: 'No updates provided (due_date, title, description, priority, or status).',
      error: 'NO_UPDATES',
    };
  }

  try {
    const task = await updateTask(taskId, updates as Parameters<typeof updateTask>[1]);
    if (!task) {
      return {
        success: false,
        actionType: 'projects:update_task',
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
      actionType: 'projects:update_task',
      message: `Task "${task.title}" updated: ${parts.join(', ')}.`,
      result: { taskId: task.id, title: task.title, ...updates },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ActionExecutor] update_task failed:', message);
    return {
      success: false,
      actionType: 'projects:update_task',
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
    actionType: 'finance:draft_invoice',
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
    actionType: 'communication:send_chat_message',
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
    actionType: 'core:send_reminder',
    message: `Reminder sent to ${payload.recipient}.`,
    result: { recipient: payload.recipient },
  };
}

async function executeApproveExpense(
  payload: Record<string, unknown>,
  context: ActionExecutionContext,
): Promise<ActionExecutionResult> {
  const reimbursementId = payload.reimbursement_id as string;
  if (!reimbursementId) {
    return { success: false, actionType: 'finance:approve_expense', message: 'Reimbursement ID required.', error: 'MISSING_ID' };
  }

  try {
    const result = await query<{ status: string; title: string }>(
      `SELECT status, title
       FROM reimbursement_requests
       WHERE id = $1
         AND organization_id = $2::uuid`,
      [reimbursementId, context.organizationId],
    );
    const row = result.rows[0];
    if (!row) {
      return { success: false, actionType: 'finance:approve_expense', message: 'Expense not found.', error: 'NOT_FOUND' };
    }

    const statusMap: Record<string, string> = {
      submitted: 'manager_review',
      manager_review: 'finance_review',
      finance_review: 'approved',
    };
    const nextStatus = statusMap[row.status];
    if (!nextStatus) {
      return { success: false, actionType: 'finance:approve_expense', message: `Cannot approve expense in "${row.status}" status.`, error: 'INVALID_STATUS' };
    }

    await query(
      `UPDATE reimbursement_requests
       SET status = $1, updated_at = NOW()
       WHERE id = $2
         AND organization_id = $3::uuid`,
      [nextStatus, reimbursementId, context.organizationId],
    );

    if (payload.comment) {
      await query(
        `INSERT INTO reimbursement_comments (reimbursement_id, user_id, comment) VALUES ($1, $2, $3)`,
        [reimbursementId, null, `[Dora AI] ${payload.comment}`],
      );
    }

    await logFinancialAction({
      actionType: 'finance:approve_expense',
      relatedEntityType: 'reimbursement_request',
      relatedEntityId: reimbursementId,
      reasoning: `Dora AI approved expense "${row.title}" from ${row.status} → ${nextStatus}`,
    });

    return {
      success: true,
      actionType: 'finance:approve_expense',
      message: `Expense "${row.title}" approved (${row.status} → ${nextStatus}).`,
      result: { reimbursementId, title: row.title, newStatus: nextStatus },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ActionExecutor] approve_expense failed:', message);
    return { success: false, actionType: 'finance:approve_expense', message: `Failed: ${message}`, error: message };
  }
}

async function executeFlagExpense(
  payload: Record<string, unknown>,
  context: ActionExecutionContext,
): Promise<ActionExecutionResult> {
  const reimbursementId = payload.reimbursement_id as string;
  const reason = payload.reason as string;
  if (!reimbursementId || !reason) {
    return { success: false, actionType: 'finance:flag_expense', message: 'Reimbursement ID and reason required.', error: 'MISSING_FIELDS' };
  }

  try {
    const result = await query<{ title: string; status: string }>(
      `SELECT title, status
       FROM reimbursement_requests
       WHERE id = $1
         AND organization_id = $2::uuid`,
      [reimbursementId, context.organizationId],
    );
    const row = result.rows[0];
    if (!row) {
      return { success: false, actionType: 'finance:flag_expense', message: 'Expense not found.', error: 'NOT_FOUND' };
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
      actionType: 'finance:flag_expense',
      relatedEntityType: 'reimbursement_request',
      relatedEntityId: reimbursementId,
      reasoning: `Dora AI flagged expense "${row.title}": ${reason}`,
    });

    return {
      success: true,
      actionType: 'finance:flag_expense',
      message: `Expense "${row.title}" flagged for review: ${reason}`,
      result: { reimbursementId, title: row.title, reason },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ActionExecutor] flag_expense failed:', message);
    return { success: false, actionType: 'finance:flag_expense', message: `Failed: ${message}`, error: message };
  }
}

async function executeCreateBudgetAlert(
  payload: Record<string, unknown>,
  context: ActionExecutionContext,
): Promise<ActionExecutionResult> {
  const department = payload.department as string;
  const threshold = payload.threshold as number;
  if (!department || threshold == null) {
    return { success: false, actionType: 'finance:create_budget_alert', message: 'Department and threshold required.', error: 'MISSING_FIELDS' };
  }

  try {
    const orgId = context.organizationId;

    const budgetResult = await query<{ id: string }>(
      `SELECT id FROM finance_budgets WHERE organization_id = $1 AND department = $2 AND period_start <= CURRENT_DATE AND period_end >= CURRENT_DATE LIMIT 1`,
      [orgId, department],
    );
    const budget = budgetResult.rows[0];

    if (budget) {
      await query(`UPDATE finance_budgets SET alert_threshold = $1, updated_at = NOW() WHERE id = $2`, [threshold, budget.id]);
    }

    await logFinancialAction({
      actionType: 'finance:create_budget_alert',
      relatedEntityType: 'budget',
      relatedEntityId: budget?.id || 'no_active_budget',
      reasoning: `Dora AI set budget alert for ${department} at ${(threshold * 100).toFixed(0)}%`,
      metadata: { department, threshold, message: payload.message },
    });

    return {
      success: true,
      actionType: 'finance:create_budget_alert',
      message: `Budget alert set for ${department} at ${(threshold * 100).toFixed(0)}% threshold.${budget ? '' : ' Note: No active budget found for this department.'}`,
      result: { department, threshold, budgetId: budget?.id },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ActionExecutor] create_budget_alert failed:', message);
    return { success: false, actionType: 'finance:create_budget_alert', message: `Failed: ${message}`, error: message };
  }
}

async function executeCreateBudget(
  payload: Record<string, unknown>,
  context: ActionExecutionContext,
): Promise<ActionExecutionResult> {
  const department = payload.department as string;
  const allocatedAmount = payload.allocated_amount as number;
  const periodStart = payload.period_start as string;
  const periodEnd = payload.period_end as string;

  if (!department || !allocatedAmount || !periodStart || !periodEnd) {
    return {
      success: false,
      actionType: 'finance:create_budget',
      message: 'Missing required fields: department, allocated_amount, period_start, period_end.',
      error: 'MISSING_FIELDS',
    };
  }

  try {
    const orgId = context.organizationId;

    const budget = await createBudget(orgId, {
      department,
      periodStart,
      periodEnd,
      allocatedAmount,
      currency: (payload.currency as string) || 'EUR',
      alertThreshold: (payload.alert_threshold as number) ?? 0.8,
    });

    await logFinancialAction({
      actionType: 'finance:create_budget',
      relatedEntityType: 'budget',
      relatedEntityId: budget.id,
      reasoning: `Dora AI created budget for ${department}: ${budget.currency} ${allocatedAmount}`,
    });

    return {
      success: true,
      actionType: 'finance:create_budget',
      message: `Budget created for ${department}: ${budget.currency} ${allocatedAmount.toLocaleString()} (${periodStart} → ${periodEnd}).`,
      result: { budgetId: budget.id, department, allocatedAmount },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ActionExecutor] create_budget failed:', message);
    return {
      success: false,
      actionType: 'finance:create_budget',
      message: `Failed to create budget: ${message}`,
      error: message,
    };
  }
}

async function executeUpdateBudget(
  payload: Record<string, unknown>,
  context: ActionExecutionContext,
): Promise<ActionExecutionResult> {
  const budgetId = payload.budget_id as string;
  if (!budgetId) {
    return {
      success: false,
      actionType: 'finance:update_budget',
      message: 'Budget ID is required.',
      error: 'MISSING_BUDGET_ID',
    };
  }

  try {
    const orgId = context.organizationId;

    const budget = await updateBudget(budgetId, orgId, {
      allocatedAmount: payload.allocated_amount as number | undefined,
      periodStart: payload.period_start as string | undefined,
      periodEnd: payload.period_end as string | undefined,
      alertThreshold: payload.alert_threshold as number | undefined,
    });

    if (!budget) {
      return {
        success: false,
        actionType: 'finance:update_budget',
        message: 'Budget not found.',
        error: 'BUDGET_NOT_FOUND',
      };
    }

    await logFinancialAction({
      actionType: 'finance:update_budget',
      relatedEntityType: 'budget',
      relatedEntityId: budget.id,
      reasoning: `Dora AI updated budget for ${budget.department}`,
    });

    return {
      success: true,
      actionType: 'finance:update_budget',
      message: `Budget for ${budget.department} updated successfully.`,
      result: { budgetId: budget.id, department: budget.department },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ActionExecutor] update_budget failed:', message);
    return {
      success: false,
      actionType: 'finance:update_budget',
      message: `Failed to update budget: ${message}`,
      error: message,
    };
  }
}

async function executeAutoApproveExpense(payload: Record<string, unknown>, context: ActionExecutionContext): Promise<ActionExecutionResult> {
  try {
    const { query: dbQuery } = await import('../../../db/index.js');
    const expenseId = payload.expense_id as string;
    const reason = payload.reason as string;

    await dbQuery(
      `UPDATE reimbursement_requests SET status = 'ai_approved', ai_auto_approved = TRUE,
       ai_review_notes = $1, approved_at = NOW(), updated_at = NOW()
       WHERE id = $2
         AND organization_id = $3::uuid`,
      [reason, expenseId, context.organizationId],
    );

    return {
      success: true,
      actionType: 'finance:auto_approve_expense',
      message: `Expense auto-approved: ${reason}`,
      result: { expenseId },
    };
  } catch (err) {
    return { success: false, actionType: 'finance:auto_approve_expense', message: `Failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function executeFlagExpenseForReview(payload: Record<string, unknown>, context: ActionExecutionContext): Promise<ActionExecutionResult> {
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
       updated_at = NOW()
       WHERE id = $4
         AND organization_id = $5::uuid`,
      [riskScore, reason, JSON.stringify([{ type: 'manual_flag', severity: riskLevel, description: reason }]), expenseId, context.organizationId],
    );

    return {
      success: true,
      actionType: 'finance:flag_expense_for_review',
      message: `Expense flagged for review: ${reason}`,
      result: { expenseId, riskLevel },
    };
  } catch (err) {
    return { success: false, actionType: 'finance:flag_expense_for_review', message: `Failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function executeGenerateInvoice(payload: Record<string, unknown>, context: ActionExecutionContext): Promise<ActionExecutionResult> {
  try {
    const { invoiceService } = await import('../../finance/invoiceService.js');
    const { query: dbQuery } = await import('../../../db/index.js');

    const orgId = context.organizationId;

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
      actionType: 'finance:generate_invoice',
      message: `Invoice ${invoice.invoice_number} generated for ${payload.client_name}.`,
      result: { invoiceId: invoice.id, invoiceNumber: invoice.invoice_number },
    };
  } catch (err) {
    return { success: false, actionType: 'finance:generate_invoice', message: `Failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function executeSendPaymentReminder(payload: Record<string, unknown>, context: ActionExecutionContext): Promise<ActionExecutionResult> {
  try {
    const { query: dbQuery } = await import('../../../db/index.js');
    const { notificationService } = await import('../../finance/notificationService.js');

    const invoiceId = payload.invoice_id as string;
    const message = (payload.message as string) ?? 'Payment reminder for your invoice.';

    const inv = await dbQuery('SELECT * FROM invoices WHERE id = $1 AND organization_id = $2::uuid', [invoiceId, context.organizationId]);
    if (!inv.rows[0]) throw new Error('Invoice not found');
    const orgId = context.organizationId;

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
      actionType: 'finance:send_payment_reminder',
      message: `Payment reminder sent for invoice ${inv.rows[0].invoice_number ?? invoiceId.substring(0, 8)}.`,
      result: { invoiceId },
    };
  } catch (err) {
    return { success: false, actionType: 'finance:send_payment_reminder', message: `Failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function executeSuggestBudgetReallocation(payload: Record<string, unknown>, context: ActionExecutionContext): Promise<ActionExecutionResult> {
  try {
    const { auditService } = await import('../../finance/auditService.js');
    const { query: dbQuery } = await import('../../../db/index.js');

    const orgId = context.organizationId;

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
      actionType: 'finance:suggest_budget_reallocation',
      message: `Budget reallocation suggestion logged: $${payload.amount} from ${payload.from_budget_id} to ${payload.to_budget_id}.`,
      result: payload,
    };
  } catch (err) {
    return { success: false, actionType: 'finance:suggest_budget_reallocation', message: `Failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function executeCreateDeal(payload: Record<string, unknown>, context: ActionExecutionContext): Promise<ActionExecutionResult> {
  try {
    const orgId = context.organizationId;

    const company = await query<{ id: string }>(
      `SELECT id::text FROM crm_companies
       WHERE organization_id = $1
         AND LOWER(name) LIKE LOWER($2)
       ORDER BY created_at DESC
       LIMIT 1`,
      [orgId, `%${String(payload.companyName ?? '')}%`],
    );
    const deal = await query<{ id: string }>(
      `INSERT INTO crm_deals (organization_id, title, amount, currency, owner_id, company_id, status, description, stage_id)
       VALUES (
         $1, $2, $3, 'EUR',
         (SELECT id FROM reimbursement_users WHERE organization_id = $1 ORDER BY created_at ASC LIMIT 1),
         $4::uuid,
         'open',
         $5,
         (SELECT id FROM crm_pipeline_stages WHERE organization_id = $1 ORDER BY sort_order ASC LIMIT 1)
       )
       RETURNING id::text`,
      [orgId, String(payload.title ?? 'New Deal'), Number(payload.amount ?? 0), company.rows[0]?.id ?? null, String(payload.description ?? '')],
    );
    return { success: true, actionType: 'crm:create_deal', message: 'Deal created successfully.', result: { dealId: deal.rows[0]?.id } };
  } catch (err) {
    return { success: false, actionType: 'crm:create_deal', message: `Failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function executeCreateTicket(payload: Record<string, unknown>, context: ActionExecutionContext): Promise<ActionExecutionResult> {
  try {
    const orgId = context.organizationId;
    const row = await query<{ id: string }>(
      `INSERT INTO support_tickets (organization_id, subject, description, priority, reporter_email, category, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'open')
       RETURNING id::text`,
      [
        orgId,
        String(payload.subject ?? 'Ticket'),
        String(payload.description ?? ''),
        String(payload.priority ?? 'medium'),
        String(payload.reporterEmail ?? ''),
        String(payload.category ?? 'general'),
      ],
    );
    return { success: true, actionType: 'support:create_ticket', message: 'Ticket created successfully.', result: { ticketId: row.rows[0]?.id } };
  } catch (err) {
    return { success: false, actionType: 'support:create_ticket', message: `Failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function executeAssignAsset(payload: Record<string, unknown>, context: ActionExecutionContext): Promise<ActionExecutionResult> {
  try {
    const asset = await query<{ id: string }>(
      `SELECT id::text
       FROM assets
       WHERE organization_id = $1::uuid
         AND LOWER(name) LIKE LOWER($2)
       ORDER BY created_at DESC
       LIMIT 1`,
      [context.organizationId, `%${String(payload.assetName ?? '')}%`],
    );
    const user = await query<{ id: string }>(
      `SELECT id::text
       FROM reimbursement_users
       WHERE organization_id = $1::uuid
         AND LOWER(full_name) LIKE LOWER($2)
       ORDER BY created_at DESC
       LIMIT 1`,
      [context.organizationId, `%${String(payload.employeeName ?? '')}%`],
    );
    if (!asset.rows[0]?.id || !user.rows[0]?.id) throw new Error('Asset or employee not found');
    await query(
      `UPDATE assets
       SET assignee_id = $1::uuid, status = 'assigned', assigned_at = NOW(), updated_at = NOW()
       WHERE id = $2::uuid`,
      [user.rows[0].id, asset.rows[0].id],
    );
    return { success: true, actionType: 'assets:assign_asset', message: 'Asset assigned successfully.', result: { assetId: asset.rows[0].id, assigneeId: user.rows[0].id } };
  } catch (err) {
    return { success: false, actionType: 'assets:assign_asset', message: `Failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function executeSendRenewalReminder(payload: Record<string, unknown>, context: ActionExecutionContext): Promise<ActionExecutionResult> {
  try {
    const contract = await query<{ id: string; title: string }>(
      `SELECT id::text, title
       FROM contracts
       WHERE organization_id = $1::uuid
         AND LOWER(title) LIKE LOWER($2)
       ORDER BY end_date ASC NULLS LAST
       LIMIT 1`,
      [context.organizationId, `%${String(payload.contractName ?? '')}%`],
    );
    if (!contract.rows[0]) throw new Error('Contract not found');
    await query(
      `INSERT INTO contract_reminders (contract_id, reminder_type, reminder_date, sent, created_at)
       VALUES ($1::uuid, 'manual_renewal_reminder', CURRENT_DATE, TRUE, NOW())`,
      [contract.rows[0].id],
    );
    return { success: true, actionType: 'contracts:send_renewal_reminder', message: `Renewal reminder recorded for ${contract.rows[0].title}.`, result: { contractId: contract.rows[0].id } };
  } catch (err) {
    return { success: false, actionType: 'contracts:send_renewal_reminder', message: `Failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function executeCreateCampaign(payload: Record<string, unknown>, context: ActionExecutionContext): Promise<ActionExecutionResult> {
  try {
    const orgId = context.organizationId;
    const row = await query<{ id: string }>(
      `INSERT INTO marketing_campaigns (organization_id, name, channel, budget, start_date, description, status)
       VALUES ($1, $2, $3, $4, $5::date, $6, 'draft')
       RETURNING id::text`,
      [
        orgId,
        String(payload.name ?? 'Campaign'),
        String(payload.channel ?? 'email'),
        Number(payload.budget ?? 0),
        String(payload.startDate ?? new Date().toISOString().slice(0, 10)),
        String(payload.description ?? ''),
      ],
    );
    return { success: true, actionType: 'marketing:create_campaign', message: 'Campaign created successfully.', result: { campaignId: row.rows[0]?.id } };
  } catch (err) {
    return { success: false, actionType: 'marketing:create_campaign', message: `Failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function executePostJob(payload: Record<string, unknown>, context: ActionExecutionContext): Promise<ActionExecutionResult> {
  try {
    const orgId = context.organizationId;
    const row = await query<{ id: string }>(
      `INSERT INTO recruitment_jobs (organization_id, title, department, description, requirements, status)
       VALUES ($1, $2, $3, $4, $5::text[], 'open')
       RETURNING id::text`,
      [
        orgId,
        String(payload.title ?? 'New Role'),
        String(payload.department ?? 'General'),
        String(payload.description ?? ''),
        String(payload.requirements ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      ],
    );
    return { success: true, actionType: 'recruitment:post_job', message: 'Job posted successfully.', result: { jobId: row.rows[0]?.id } };
  } catch (err) {
    return { success: false, actionType: 'recruitment:post_job', message: `Failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
