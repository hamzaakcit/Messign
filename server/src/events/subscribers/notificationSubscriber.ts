import { eventBus } from '../eventBus.js';

export function register(): void {
  eventBus.on('finance.expense.approved', (_payload) => {
    console.log('[Notify] Would notify relevant users about finance.expense.approved');
  });

  eventBus.on('finance.expense.rejected', (_payload) => {
    console.log('[Notify] Would notify relevant users about finance.expense.rejected');
  });

  eventBus.on('finance.invoice.overdue', (_payload) => {
    console.log('[Notify] Would notify relevant users about finance.invoice.overdue');
  });

  eventBus.on('finance.budget.threshold_breached', (_payload) => {
    console.log('[Notify] Would notify relevant users about finance.budget.threshold_breached');
  });

  console.log('[Subscriber] Notification subscriber registered');
}
