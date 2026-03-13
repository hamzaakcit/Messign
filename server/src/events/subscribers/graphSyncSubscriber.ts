import { eventBus } from '../eventBus.js';
import { registerGraphSyncHandlers } from '../../services/graph/graphSync.js';

export function register(): void {
  registerGraphSyncHandlers(eventBus);
  console.log('[Subscriber] Graph sync registered');
}
