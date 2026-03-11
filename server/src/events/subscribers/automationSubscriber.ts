import { eventBus } from '../eventBus.js';
import { processEventAgainstPolicies } from '../../services/dora/automationEngine.js';

export function register(): void {
  eventBus.onAny(async (eventName, payload) => {
    try {
      await processEventAgainstPolicies(eventName, payload as Record<string, unknown>);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Automation] Error processing ${eventName}:`, message);
    }
  });

  console.log('[Automation] Subscriber registered — listening to all events');
}
