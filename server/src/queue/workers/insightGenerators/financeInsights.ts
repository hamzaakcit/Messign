import { query } from '../../../db/index.js';
import * as doraInsights from '../../../dal/doraInsights.js';

async function getOrgIdForAuthUser(authUserId: string): Promise<string | undefined> {
  const result = await query<{ organization_id: string }>(
    `SELECT organization_id::text AS organization_id
     FROM reimbursement_users
     WHERE auth_user_id = $1
     LIMIT 1`,
    [authUserId],
  );
  return result.rows[0]?.organization_id;
}

export async function onExpenseCreated(payload: {
  expenseId: string;
  userId: string;
  amount: number;
  category: string;
  departmentId?: string;
}) {
  const organizationId = await getOrgIdForAuthUser(payload.userId);
  if (!organizationId || !payload.departmentId) {
    return null;
  }

  const budgetResult = await query<{
    id: string;
    spent_amount: string;
    allocated_amount: string;
    department: string;
  }>(
    `SELECT id::text AS id, spent_amount::text, allocated_amount::text, department
     FROM finance_budgets
     WHERE organization_id = $1
       AND department = $2
       AND (is_active = TRUE OR status = 'active')
     ORDER BY updated_at DESC
     LIMIT 1`,
    [organizationId, payload.departmentId],
  );

  const budget = budgetResult.rows[0];
  if (!budget) {
    return null;
  }

  const allocated = Number(budget.allocated_amount ?? 0);
  const spent = Number(budget.spent_amount ?? 0);
  if (allocated <= 0) {
    return null;
  }

  const consumedPercent = ((spent / allocated) * 100);
  if (consumedPercent < 85) {
    return null;
  }

  return doraInsights.createInsight({
    organizationId,
    module: 'finance',
    severity: consumedPercent >= 100 ? 'critical' : 'warning',
    title: 'Budget threshold approaching',
    message: `Expense of €${payload.amount.toLocaleString()} in ${payload.category} pushes ${budget.department} budget usage to ${consumedPercent.toFixed(1)}%.`,
    actionUrl: '/finance/budgets',
    actionLabel: 'View Budget',
    sourceEvent: 'finance.expense.created',
    sourceEntityType: 'expense',
    sourceEntityId: payload.expenseId,
    targetRole: 'manager',
    metadata: {
      budgetId: budget.id,
      department: budget.department,
      consumedPercent: Number(consumedPercent.toFixed(2)),
    },
  });
}

export async function onInvoiceOverdue(payload: {
  invoiceId: string;
  vendorId: string;
  daysOverdue: number;
  amount: number;
}) {
  const invoiceResult = await query<{ organization_id: string }>(
    `SELECT organization_id::text AS organization_id
     FROM invoices
     WHERE id = $1
     LIMIT 1`,
    [payload.invoiceId],
  );
  const organizationId = invoiceResult.rows[0]?.organization_id;

  return doraInsights.createInsight({
    organizationId,
    module: 'finance',
    severity: payload.daysOverdue > 14 ? 'critical' : 'warning',
    title: `Invoice overdue by ${payload.daysOverdue} days`,
    message: `Invoice for €${payload.amount.toLocaleString()} is ${payload.daysOverdue} days past due.`,
    actionUrl: `/finance/invoices?detail=${payload.invoiceId}`,
    actionLabel: 'View Invoice',
    sourceEvent: 'finance.invoice.overdue',
    sourceEntityType: 'invoice',
    sourceEntityId: payload.invoiceId,
    targetRole: 'finance',
    metadata: {
      vendorId: payload.vendorId,
      daysOverdue: payload.daysOverdue,
    },
  });
}

export async function onBudgetThresholdBreached(payload: {
  budgetId: string;
  departmentId: string;
  currentPercent: number;
  threshold: number;
}) {
  const budgetResult = await query<{ organization_id: string }>(
    `SELECT organization_id::text AS organization_id
     FROM finance_budgets
     WHERE id = $1
     LIMIT 1`,
    [payload.budgetId],
  );
  const organizationId = budgetResult.rows[0]?.organization_id;

  return doraInsights.createInsight({
    organizationId,
    module: 'finance',
    severity: payload.currentPercent >= 100 ? 'critical' : 'warning',
    title: 'Budget threshold breached',
    message: `${payload.departmentId} budget is now ${payload.currentPercent.toFixed(1)}% utilized, above the ${payload.threshold}% alert threshold.`,
    actionUrl: `/finance/budgets?detail=${payload.budgetId}`,
    actionLabel: 'Review Budget',
    sourceEvent: 'finance.budget.threshold_breached',
    sourceEntityType: 'budget',
    sourceEntityId: payload.budgetId,
    targetRole: 'manager',
    metadata: {
      currentPercent: payload.currentPercent,
      threshold: payload.threshold,
      departmentId: payload.departmentId,
    },
  });
}
