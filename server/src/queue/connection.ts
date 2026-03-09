import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Shared connection for all BullMQ queues and workers
export const redisConnection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  retryStrategy: (times: number) => {
    if (times > 10) {
      console.error('[Redis] Max retries reached, giving up');
      return null;
    }
    return Math.min(times * 200, 5000);
  },
});

redisConnection.on('connect', () => console.log('[Redis] Connected'));
redisConnection.on('error', (err) => console.error('[Redis] Error:', err.message));

export default redisConnection;
