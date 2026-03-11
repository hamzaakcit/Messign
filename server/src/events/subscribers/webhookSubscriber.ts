import { eventBus } from '../eventBus.js';
import { webhookService } from '../../services/webhookService.js';

export function register(): void {
  eventBus.onAny(async (eventName, payload) => {
    try {
      await webhookService.dispatchWebhook(eventName, payload as Record<string, unknown>);
    } catch (error) {
      console.warn('[WebhookSubscriber] Dispatch failed:', error instanceof Error ? error.message : error);
    }
  });
  console.log('[Subscriber] Webhook subscriber registered');
}
