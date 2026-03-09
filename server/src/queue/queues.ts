import { Queue } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { redisConnection } from './connection.js';

// BullMQ bundles its own ioredis; our shared connection is compatible at runtime but TS sees different types.
const connection = redisConnection as unknown as ConnectionOptions;

// ── Queue Definitions ──
// Each queue handles a different category of async work

// Tier 2: Immediate processing (< 5 seconds)
export const crossModuleQueue = new Queue('cross-module', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

export const notificationQueue = new Queue('notifications', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 2000 },
  },
});

export const gamificationQueue = new Queue('gamification', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
});

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

export const doraSchedulerQueue = new Queue('dora-scheduler', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
});

export const analyticsQueue = new Queue('analytics', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
});

console.log('[Queues] All BullMQ queues initialized');
