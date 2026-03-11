import { Worker, Job } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { redisConnection } from '../connection.js';
import { webhookService } from '../../services/webhookService.js';

const connection = redisConnection as unknown as ConnectionOptions;

interface WebhookJob {
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
  attempt: number;
}

const worker = new Worker<WebhookJob>(
  'webhooks',
  async (job: Job<WebhookJob>) => {
    const { webhookId, event, payload, attempt } = job.data;
    await webhookService.deliverWebhook(webhookId, event, payload, attempt);
  },
  { connection, concurrency: 10 },
);

worker.on('error', (err) => console.warn('[Webhooks] Worker error (Redis?):', err.message));
worker.on('completed', (job) => console.log(`[Webhooks] Job ${job.id} completed`));
worker.on('failed', (job, err) => console.error(`[Webhooks] Job ${job?.id} failed:`, err.message));

export default worker;
