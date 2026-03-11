import { eventBus } from '../eventBus.js';
import { crossModuleQueue, notificationQueue, gamificationQueue } from '../../queue/index.js';
import { emitToUser } from '../../sockets/index.js';

export function register(): void {
  eventBus.on('crm.deal.won', async (payload) => {
    void emitToUser(payload.ownerId, 'celebration:deal-won', {
      dealId: payload.dealId,
      amount: payload.amount,
      currency: payload.currency,
    });
    await crossModuleQueue.add('generate_invoice_from_deal', {
      type: 'generate_invoice_from_deal',
      payload: {
        dealId: payload.dealId,
        amount: payload.amount,
        currency: payload.currency,
        companyId: payload.companyId,
      },
      sourceEvent: 'crm.deal.won',
    });
  });

  eventBus.on('crm.deal.stage_changed', async (payload) => {
    await crossModuleQueue.add('update_okr_progress', {
      type: 'update_okr_progress',
      payload: {
        source: 'crm.deals',
        event: 'stage_changed',
        dealId: payload.dealId,
        newStage: payload.newStage,
      },
      sourceEvent: 'crm.deal.stage_changed',
    });
  });

  eventBus.on('crm.deal.created', async (payload) => {
    await notificationQueue.add('deal_created_notification', {
      type: 'deal_created_notification',
      payload: {
        dealId: payload.dealId,
        title: payload.title,
        ownerId: payload.ownerId,
        amount: payload.amount,
      },
    });
  });

  eventBus.on('crm.activity.logged', async (payload) => {
    await gamificationQueue.add('award_xp', {
      type: 'award_xp',
      userId: payload.userId,
      amount: 5,
      reason: `Logged ${payload.type} activity`,
    });
  });

  console.log('[Subscriber] CRM subscriber registered');
}
