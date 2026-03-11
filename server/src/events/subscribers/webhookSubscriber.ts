import { eventBus } from '../eventBus.js';
import { webhookService } from '../../services/webhookService.js';

export function register(): void {
  eventBus.onAny(async (eventName, payload) => {
    try {
      const eventPayload = payload as Record<string, unknown>;
      const organizationId =
        (typeof eventPayload.organizationId === 'string' && eventPayload.organizationId) ||
        (typeof eventPayload.organization_id === 'string' && eventPayload.organization_id) ||
        null;
      if (!organizationId) {
        return;
      }
      await webhookService.dispatchWebhook(eventName, eventPayload, organizationId);
    } catch (error) {
      console.warn('[WebhookSubscriber] Dispatch failed:', error instanceof Error ? error.message : error);
    }
  });
  console.log('[Subscriber] Webhook subscriber registered');
}
