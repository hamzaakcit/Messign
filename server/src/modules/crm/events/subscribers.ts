/**
 * CRM Module — Event handlers
 * Subscribes to crm.* domain events.
 */
import type { EventBus } from '../../../platform/eventBus.js';
import { crossModuleQueue, notificationQueue, gamificationQueue } from '../../../queue/index.js';
import { emitToUser } from '../../../sockets/index.js';
import { embedAndStore } from '../../../services/ai/rag/embeddingPipeline.js';

export function registerCrmEventHandlers(eventBus: EventBus): void {
  registerCrmEmbeddingHandlers(eventBus);
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

  console.log('[Module] CRM event handlers registered');
}

/** Cross-module RAG: embed CRM activity notes and deal descriptions */
function registerCrmEmbeddingHandlers(eventBus: EventBus): void {
  eventBus.on('crm.activity.logged', async (payload: { tenantId?: string; activityId?: string; dealId?: string; contactId?: string; type?: string; notes?: string }) => {
    if (!payload.notes || !payload.tenantId) return;
    try {
      await embedAndStore({
        tenantId: payload.tenantId,
        sourceModule: 'crm',
        sourceType: 'activity_note',
        sourceId: payload.activityId!,
        text: payload.notes,
        metadata: {
          deal_id: payload.dealId,
          contact_id: payload.contactId,
          activity_type: payload.type,
        },
        accessRoles: ['sales', 'manager', 'admin'],
        sensitivity: 'normal',
      });
    } catch (err) {
      console.error('[CRM Embedding] activity.logged', err);
    }
  });

  eventBus.on('crm.deal.updated', async (payload: { tenantId?: string; dealId?: string; name?: string; value?: number; stage?: string; description?: string; changes?: string[] }) => {
    if (!payload.description || !payload.tenantId || !payload.dealId) return;
    try {
      await embedAndStore({
        tenantId: payload.tenantId,
        sourceModule: 'crm',
        sourceType: 'deal_description',
        sourceId: payload.dealId,
        text: `Deal: ${payload.name ?? ''}. Value: ${payload.value ?? 0}. Stage: ${payload.stage ?? ''}. ${payload.description}`,
        metadata: { deal_id: payload.dealId, value: payload.value, stage: payload.stage },
        accessRoles: ['sales', 'manager', 'admin'],
        sensitivity: 'normal',
      });
    } catch (err) {
      console.error('[CRM Embedding] deal.updated', err);
    }
  });
}
