import crossModuleWorker from './crossModuleWorker.js';
import notificationWorker from './notificationWorker.js';
import gamificationWorker from './gamificationWorker.js';
import doraInsightsWorker from './doraInsightsWorker.js';
import doraSchedulerWorker from './doraSchedulerWorker.js';
import webhookWorker from './webhookWorker.js';
import embeddingWorker from './embeddingWorker.js';
import emailBulkResolveWorker from './emailBulkResolveWorker.js';

export function startAllWorkers() {
  console.log(
    '[Workers] 8 BullMQ workers started (cross-module:5, notifications:10, gamification:5, dora-insights:3, dora-scheduler:1, webhooks:10, embeddings:3, marketing-email-bulk-resolve:2)',
  );
}

export {
  crossModuleWorker,
  notificationWorker,
  gamificationWorker,
  doraInsightsWorker,
  doraSchedulerWorker,
  webhookWorker,
  embeddingWorker,
  emailBulkResolveWorker,
};
