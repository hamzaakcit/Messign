import type { EventBus } from '../../../platform/eventBus.js';

export function registerExecutiveEventHandlers(_eventBus: EventBus): void {
  // Executive module has no domain-specific event handlers
  console.log('[Executive] Event handlers registered');
}
