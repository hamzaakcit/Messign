/**
 * Finance Module — Event handlers
 * Subscribes to finance.* domain events.
 */
import type { EventBus } from '../../../platform/eventBus.js';
import { embeddingsQueue } from '../../../queue/index.js';

export function registerFinanceEventHandlers(eventBus: EventBus): void {
  eventBus.on('finance.expense.created', async (payload: { expenseId?: string; organizationId?: string }) => {
    if (!payload.expenseId || !payload.organizationId) return;
    await embeddingsQueue.add('embed', {
      type: 'fetch_expense',
      expenseId: payload.expenseId,
      organizationId: payload.organizationId,
    }).catch((err) => console.error('[Finance Embedding] expense.created enqueue', err));
  });
}
