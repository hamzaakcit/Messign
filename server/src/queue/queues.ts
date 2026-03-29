import { Queue } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { redisConnection } from './connection.js';

// BullMQ bundles its own ioredis; our shared connection is compatible at runtime but TS sees different types.
const connection = redisConnection as unknown as ConnectionOptions;

// ── Queue Definitions ──
// Each queue handles a different category of async work

// Tier 2: Immediate processing (< 5 seconds)
function onQueueError(name: string, err: Error): void {
  console.warn(`[Queues] ${name} error (Redis?):`, err.message);
}

export const crossModuleQueue = new Queue('cross-module', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});
crossModuleQueue.on('error', (err) => onQueueError('cross-module', err));

export const notificationQueue = new Queue('notifications', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 2000 },
  },
});
notificationQueue.on('error', (err) => onQueueError('notifications', err));

export const gamificationQueue = new Queue('gamification', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
});
gamificationQueue.on('error', (err) => onQueueError('gamification', err));

// Tier 3: Deferred/scheduled processing
export const doraInsightsQueue = new Queue('dora-insights', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 2000 },
  },
});
doraInsightsQueue.on('error', (err) => onQueueError('dora-insights', err));

export const doraSchedulerQueue = new Queue('dora-scheduler', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
});
doraSchedulerQueue.on('error', (err) => onQueueError('dora-scheduler', err));

// analyticsQueue removed — no producers or consumers exist yet.
// TODO: re-add when analytics pipeline is implemented.

export const webhookQueue = new Queue('webhooks', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});
webhookQueue.on('error', (err) => onQueueError('webhooks', err));

export const embeddingsQueue = new Queue('embeddings', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
});
embeddingsQueue.on('error', (err) => onQueueError('embeddings', err));

export { emailBulkResolveQueue, EMAIL_BULK_RESOLVE_QUEUE_NAME } from './emailBulkResolveQueue.js';

