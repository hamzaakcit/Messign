import { Worker, Job } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { redisConnection } from '../connection.js';
import { addEmployeeXP } from '../../db/employeesDb.js';
import { eventBus } from '../../events/index.js';

const connection = redisConnection as unknown as ConnectionOptions;

interface GamificationJob {
  type: string;
  userId: string;
  amount: number;
  reason?: string;
}

const worker = new Worker<GamificationJob>(
  'gamification',
  async (job: Job<GamificationJob>) => {
    const { type, userId, amount, reason } = job.data;

    if (type !== 'award_xp' || !userId || !amount) {
      console.warn(`[Gamification] Unknown or incomplete job: type=${type}`);
      return;
    }

    const updated = await addEmployeeXP(userId, amount);
    if (updated) {
      eventBus.emit('gamification.xp.awarded', { userId, amount, reason: reason ?? 'xp_award', source: 'queue' });
    }
  },
  { connection, concurrency: 5 },
);

worker.on('error', (err) => console.warn('[Gamification] Worker error (Redis?):', err.message));
worker.on('failed', (job, err) => console.error(`[Gamification] Job ${job?.id} failed:`, err.message));

export default worker;
