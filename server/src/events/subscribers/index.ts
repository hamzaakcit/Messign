import { register as registerAuditSubscriber } from './auditSubscriber.js';
import { register as registerGamificationSubscriber } from './gamificationSubscriber.js';
import { register as registerNotificationSubscriber } from './notificationSubscriber.js';
import { register as registerDoraSubscriber } from './doraSubscriber.js';
import { register as registerAutomationSubscriber } from './automationSubscriber.js';
import { register as registerWebhookSubscriber } from './webhookSubscriber.js';
import { register as registerCelebrationSubscriber } from './celebrationSubscriber.js';
import { register as registerCacheInvalidationSubscriber } from './cacheInvalidationSubscriber.js';
import { register as registerGraphSyncSubscriber } from './graphSyncSubscriber.js';
import { registerTimeWorkflowSubscriber } from './timeWorkflowSubscriber.js';
import { eventBus } from '../../platform/eventBus.js';

export function registerAllSubscribers(): void {
  registerAuditSubscriber();
  registerGamificationSubscriber();
  registerNotificationSubscriber();
  registerDoraSubscriber();
  // CRM handlers: registered by modules/crm via initializeModules
  // Marketing handlers: registered by modules/marketing via initializeModules
  // HR/Recruitment handlers: registered by modules/hr via initializeModules
  // OKR handlers: registered by modules/okr via initializeModules
  // Support handlers: registered by modules/support via initializeModules
  registerTimeWorkflowSubscriber(eventBus);
  registerAutomationSubscriber();
  // Assets, Contracts handlers: registered by modules via initializeModules
  registerWebhookSubscriber();
  // Heart handlers: registered by modules/heart via initializeModules
  registerCelebrationSubscriber();
  registerCacheInvalidationSubscriber();
  registerGraphSyncSubscriber();
}
