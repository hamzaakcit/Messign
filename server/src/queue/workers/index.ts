import crossModuleWorker from './crossModuleWorker.js';
import notificationWorker from './notificationWorker.js';
import doraInsightsWorker from './doraInsightsWorker.js';
import doraSchedulerWorker from './doraSchedulerWorker.js';
import webhookWorker from './webhookWorker.js';

export function startAllWorkers() {
  console.log('[Workers] All BullMQ workers started');
  console.log('[Workers] - cross-module (concurrency: 5)');
  console.log('[Workers] - notifications (concurrency: 10)');
  console.log('[Workers] - dora-insights (concurrency: 3)');
  console.log('[Workers] - dora-scheduler (concurrency: 1)');
  console.log('[Workers] - webhooks (concurrency: 10)');
}

export { crossModuleWorker, notificationWorker, doraInsightsWorker, doraSchedulerWorker, webhookWorker };
