import { eventBus } from '../eventBus.js';
import { doraInsightsQueue } from '../../queue/index.js';

export function register(): void {
  eventBus.on('finance.expense.created', async (payload) => {
    await doraInsightsQueue.add('analyze_expense', {
      type: 'analyze_expense',
      payload: { expenseId: payload.expenseId },
    });
  });

  eventBus.on('finance.budget.threshold_breached', async (payload) => {
    await doraInsightsQueue.add('generate_insight', {
      type: 'generate_insight',
      payload: {
        module: 'finance',
        subModule: 'budget',
        budgetId: payload.budgetId,
        departmentId: payload.departmentId,
        currentPercent: payload.currentPercent,
        threshold: payload.threshold,
      },
    });
  });

  eventBus.on('finance.invoice.overdue', async (payload) => {
    await doraInsightsQueue.add('overdue_invoice_check', {
      type: 'overdue_invoice_check',
      payload: {
        invoiceId: payload.invoiceId,
        vendorId: payload.vendorId,
        daysOverdue: payload.daysOverdue,
        amount: payload.amount,
      },
    });
  });

  console.log('[Subscriber] Dora subscriber registered');
}
