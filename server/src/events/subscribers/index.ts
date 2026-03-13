import { register as registerAuditSubscriber } from './auditSubscriber.js';
import { register as registerGamificationSubscriber } from './gamificationSubscriber.js';
import { register as registerNotificationSubscriber } from './notificationSubscriber.js';
import { register as registerDoraSubscriber } from './doraSubscriber.js';
import { register as registerMarketingSubscriber } from './marketingSubscriber.js';
import { register as registerRecruitmentSubscriber } from './recruitmentSubscriber.js';
import { register as registerOkrSubscriber } from './okrSubscriber.js';
import { register as registerSupportSubscriber } from './supportSubscriber.js';
import { register as registerTimeSubscriber } from './timeSubscriber.js';
import { register as registerAutomationSubscriber } from './automationSubscriber.js';
import { register as registerAssetsSubscriber } from './assetsSubscriber.js';
import { register as registerContractsSubscriber } from './contractsSubscriber.js';
import { register as registerWebhookSubscriber } from './webhookSubscriber.js';
import { register as registerHeartSubscriber } from './heartSubscriber.js';
import { register as registerCelebrationSubscriber } from './celebrationSubscriber.js';
import { register as registerCacheInvalidationSubscriber } from './cacheInvalidationSubscriber.js';
import { register as registerGraphSyncSubscriber } from './graphSyncSubscriber.js';

export function registerAllSubscribers(): void {
  registerAuditSubscriber();
  registerGamificationSubscriber();
  registerNotificationSubscriber();
  registerDoraSubscriber();
  // CRM handlers: registered by modules/crm via initializeModules
  registerMarketingSubscriber();
  registerRecruitmentSubscriber();
  registerOkrSubscriber();
  registerSupportSubscriber();
  registerTimeSubscriber();
  registerAutomationSubscriber();
  registerAssetsSubscriber();
  registerContractsSubscriber();
  registerWebhookSubscriber();
  registerHeartSubscriber();
  registerCelebrationSubscriber();
  registerCacheInvalidationSubscriber();
  registerGraphSyncSubscriber();
}
