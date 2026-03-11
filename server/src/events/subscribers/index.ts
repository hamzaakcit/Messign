import { register as registerAuditSubscriber } from './auditSubscriber.js';
import { register as registerGamificationSubscriber } from './gamificationSubscriber.js';
import { register as registerNotificationSubscriber } from './notificationSubscriber.js';
import { register as registerDoraSubscriber } from './doraSubscriber.js';
import { register as registerCrmSubscriber } from './crmSubscriber.js';
import { register as registerOkrSubscriber } from './okrSubscriber.js';
import { register as registerSupportSubscriber } from './supportSubscriber.js';

export function registerAllSubscribers(): void {
  registerAuditSubscriber();
  registerGamificationSubscriber();
  registerNotificationSubscriber();
  registerDoraSubscriber();
  registerCrmSubscriber();
  registerOkrSubscriber();
  registerSupportSubscriber();
}
