import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisConnection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  lazyConnect: true,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 500, 30_000);
    if (times % 20 === 0) {
      console.warn(`[Redis] Still reconnecting (attempt ${times}), next in ${delay}ms`);
    }
    return delay;
  },
});

redisConnection.on('connect', () => console.log('[Redis] Connected to', REDIS_URL.replace(/\/\/.*@/, '//***@')));
redisConnection.on('error', (err) => console.warn('[Redis] Error:', err.message));

redisConnection.connect().catch((err) => {
  console.warn('[Redis] Initial connection failed (will keep retrying):', err.message);
});

export default redisConnection;
