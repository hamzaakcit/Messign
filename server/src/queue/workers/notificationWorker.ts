import { Worker, Job } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { redisConnection } from '../connection.js';

const connection = redisConnection as unknown as ConnectionOptions;

interface NotificationJob {
  userId: string;
  /** When set, worker can resolve userId from expense (e.g. expense owner) when implemented */
  expenseId?: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  channel: 'in_app' | 'email' | 'both';
}

const worker = new Worker<NotificationJob>(
  'notifications',
  async (job: Job<NotificationJob>) => {
    const { userId, type, title, message, link, channel } = job.data;
    console.log(`[Notifications] Sending ${type} to ${userId}: ${title}`);

    // TODO: Write to notifications table for in-app
    // TODO: Send email via email service for email/both
    // TODO: Push via Socket.io for real-time
  },
  { connection, concurrency: 10 }
);

worker.on('error', (err) => console.warn('[Notifications] Worker error (Redis?):', err.message));
worker.on('completed', (job) => console.log(`[Notifications] Job ${job.id} completed`));
worker.on('failed', (job, err) => console.error(`[Notifications] Job ${job?.id} failed:`, err.message));

export default worker;
