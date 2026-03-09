import { eventBus } from '../eventBus.js';
import { notificationQueue } from '../../queue/index.js';

export function register(): void {
  eventBus.on('finance.expense.approved', async (payload) => {
    await notificationQueue.add('expense_approved', {
      userId: '', // TODO: resolve from expense owner via DAL in worker
      expenseId: payload.expenseId,
      type: 'expense_approved',
      title: 'Expense Approved',
      message: 'Your expense has been approved',
      link: `/finance/expenses?detail=${payload.expenseId}`,
      channel: 'in_app',
    });
  });

  eventBus.on('finance.expense.rejected', async (payload) => {
    await notificationQueue.add('expense_rejected', {
      userId: '',
      expenseId: payload.expenseId,
      type: 'expense_rejected',
      title: 'Expense Rejected',
      message: payload.reason ? `Your expense was rejected: ${payload.reason}` : 'Your expense was rejected',
      link: `/finance/expenses?detail=${payload.expenseId}`,
      channel: 'in_app',
    });
  });

  eventBus.on('finance.invoice.overdue', async (payload) => {
    await notificationQueue.add('invoice_overdue', {
      userId: '', // TODO: resolve to vendor owner or finance admins
      type: 'invoice_overdue',
      title: 'Invoice Overdue',
      message: `Invoice is ${payload.daysOverdue} days overdue (${payload.amount})`,
      link: `/finance/invoices`,
      channel: 'in_app',
    });
  });

  eventBus.on('finance.budget.threshold_breached', async (payload) => {
    await notificationQueue.add('budget_threshold_breached', {
      userId: '', // TODO: resolve to budget owner or department admins
      type: 'budget_threshold_breached',
      title: 'Budget Threshold Breached',
      message: `Budget is at ${payload.currentPercent}% (threshold: ${payload.threshold}%)`,
      link: `/finance/budgets?detail=${payload.budgetId}`,
      channel: 'in_app',
    });
  });

  console.log('[Subscriber] Notification subscriber registered');
}
