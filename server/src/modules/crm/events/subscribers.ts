/**
 * CRM Module — Event handlers
 * Subscribes to crm.* domain events.
 */
import type { EventBus } from '../../../platform/eventBus.js';
import { crossModuleQueue, notificationQueue, gamificationQueue, embeddingsQueue } from '../../../queue/index.js';
import { emitToUser } from '../../../sockets/index.js';
import type { EmbeddingInput } from '../../../services/ai/rag/embeddingPipeline.js';

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

const CRM_ACCESS_ROLES = ['sales', 'manager', 'admin'];

/** Cross-module RAG: enqueue CRM activity notes and deal descriptions for embedding */
function registerCrmEmbeddingHandlers(eventBus: EventBus): void {
  eventBus.on('crm.activity.logged', async (payload: { tenantId?: string; activityId?: string; dealId?: string; contactId?: string; type?: string; notes?: string }) => {
    if (!payload.notes || !payload.tenantId || !payload.activityId) return;
    const input: EmbeddingInput = {
      tenantId: payload.tenantId,
      sourceModule: 'crm',
      sourceType: 'activity_note',
      sourceId: payload.activityId,
      text: payload.notes,
      metadata: { deal_id: payload.dealId, contact_id: payload.contactId, activity_type: payload.type },
      accessRoles: CRM_ACCESS_ROLES,
      sensitivity: 'normal',
    };
    await embeddingsQueue.add('embed', { type: 'embed', payload: input }).catch((err) => console.error('[CRM Embedding] activity.logged enqueue', err));
  });

  eventBus.on('crm.deal.updated', async (payload: { tenantId?: string; dealId?: string; name?: string; value?: number; stage?: string; description?: string }) => {
    if (!payload.description || !payload.tenantId || !payload.dealId) return;
    const input: EmbeddingInput = {
      tenantId: payload.tenantId,
      sourceModule: 'crm',
      sourceType: 'deal_description',
      sourceId: payload.dealId,
      text: `Deal: ${payload.name ?? ''}. Value: ${payload.value ?? 0}. Stage: ${payload.stage ?? ''}. ${payload.description}`,
      metadata: { deal_id: payload.dealId, value: payload.value, stage: payload.stage },
      accessRoles: CRM_ACCESS_ROLES,
      sensitivity: 'normal',
    };
    await embeddingsQueue.add('embed', { type: 'embed', payload: input }).catch((err) => console.error('[CRM Embedding] deal.updated enqueue', err));
  });
}
