import { register as registerAuditSubscriber } from './auditSubscriber.js';
import { register as registerGamificationSubscriber } from './gamificationSubscriber.js';
import { register as registerNotificationSubscriber } from './notificationSubscriber.js';

export function registerAllSubscribers(): void {
  registerAuditSubscriber();
  registerGamificationSubscriber();
  registerNotificationSubscriber();
}
