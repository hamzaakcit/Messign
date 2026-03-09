import { eventBus } from '../eventBus.js';
import type { EventName } from '../eventTypes.js';

export function register(): void {
  eventBus.onAny((eventName: EventName, payload: any) => {
    if (!eventName.startsWith('finance.')) return;

    const actorId = payload?.userId ?? payload?.approverId ?? payload?.actorId ?? 'unknown';
    console.log(`[Audit] ${eventName} by ${actorId}`);
  });

  console.log('[Subscriber] Audit subscriber registered');
}
