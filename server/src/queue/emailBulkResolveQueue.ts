/**
 * Phase 2 — bulk email image resolution (BullMQ).
 * Worker not registered yet — pair with Redis idempotency for multi-replica APIs.
 */

import { Queue } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { redisConnection } from './connection.js';

const connection = redisConnection as unknown as ConnectionOptions;

export const EMAIL_BULK_RESOLVE_QUEUE_NAME = 'marketing-email-bulk-resolve';

export interface EmailBulkResolveJobData {
  orgId: string;
  contentIds: string[];
  manifests: Record<string, unknown>[];
  idempotencyKey?: string;
  requestedAt: string;
}

export const emailBulkResolveQueue = new Queue<EmailBulkResolveJobData>(EMAIL_BULK_RESOLVE_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
});

emailBulkResolveQueue.on('error', (err: Error) => {
  console.warn(`[Queues] ${EMAIL_BULK_RESOLVE_QUEUE_NAME} error (Redis?):`, err.message);
});
