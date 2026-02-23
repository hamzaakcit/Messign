/**
 * Messign AI Brain — Rate Limiter
 *
 * Limits AI queries per user per time window.
 * Uses in-memory tracking with automatic cleanup.
 *
 * Limits:
 * - Regular users: 20 queries per minute, 200 per hour
 * - Admins/Managers: 40 queries per minute, 400 per hour
 * - Presentation generation: 5 per hour (more expensive)
 *
 * UPGRADE PATH: If you add Redis later, replace the Map with Redis INCR/EXPIRE.
 */

import { Request, Response, NextFunction } from 'express';

interface RateBucket {
  count: number;
  resetAt: number;
}

// Separate buckets for different windows
const minuteBuckets: Map<string, RateBucket> = new Map();
const hourBuckets: Map<string, RateBucket> = new Map();
const presentationBuckets: Map<string, RateBucket> = new Map();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of minuteBuckets) {
    if (now > bucket.resetAt) minuteBuckets.delete(key);
  }
  for (const [key, bucket] of hourBuckets) {
    if (now > bucket.resetAt) hourBuckets.delete(key);
  }
  for (const [key, bucket] of presentationBuckets) {
    if (now > bucket.resetAt) presentationBuckets.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * Get or create a rate bucket for a user.
 */
function getBucket(
  store: Map<string, RateBucket>,
  key: string,
  windowMs: number
): RateBucket {
  const now = Date.now();
  let bucket = store.get(key);

  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    store.set(key, bucket);
  }

  return bucket;
}

/**
 * Rate limit configuration per role.
 */
function getLimits(userRole: string): { perMinute: number; perHour: number } {
  switch (userRole) {
    case 'admin':
    case 'cpo':
      return { perMinute: 40, perHour: 400 };
    case 'manager':
    case 'hr':
    case 'finance':
      return { perMinute: 30, perHour: 300 };
    default:
      return { perMinute: 20, perHour: 200 };
  }
}

/**
 * Middleware: Rate limit AI answer requests.
 * Apply to: POST /ai/answer
 */
export function aiAnswerRateLimit(req: Request, res: Response, next: NextFunction): void {
  const user = (req as Request & { user?: { id: string; role: string } }).user;
  if (!user || !user.id) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const userId = String(user.id);
  const userRole = user.role || 'employee';
  const limits = getLimits(userRole);

  // Check per-minute limit
  const minuteBucket = getBucket(minuteBuckets, `answer:${userId}`, 60_000);
  if (minuteBucket.count >= limits.perMinute) {
    const retryAfter = Math.ceil((minuteBucket.resetAt - Date.now()) / 1000);
    res.status(429).json({
      error: `Rate limit exceeded. You can send ${limits.perMinute} queries per minute. Try again in ${retryAfter} seconds.`,
      retryAfter,
    });
    return;
  }

  // Check per-hour limit
  const hourBucket = getBucket(hourBuckets, `answer:${userId}`, 3600_000);
  if (hourBucket.count >= limits.perHour) {
    const retryAfter = Math.ceil((hourBucket.resetAt - Date.now()) / 1000);
    res.status(429).json({
      error: `Hourly rate limit exceeded (${limits.perHour}/hour). Try again in ${Math.ceil(retryAfter / 60)} minutes.`,
      retryAfter,
    });
    return;
  }

  // Increment both counters
  minuteBucket.count++;
  hourBucket.count++;

  // Add rate limit headers
  res.setHeader('X-RateLimit-Limit', limits.perMinute.toString());
  res.setHeader('X-RateLimit-Remaining', (limits.perMinute - minuteBucket.count).toString());
  res.setHeader('X-RateLimit-Reset', new Date(minuteBucket.resetAt).toISOString());

  next();
}

/**
 * Middleware: Rate limit presentation generation (more expensive).
 * Apply to: POST /ai/presentation
 */
export function aiPresentationRateLimit(req: Request, res: Response, next: NextFunction): void {
  const user = (req as Request & { user?: { id: string; role: string } }).user;
  if (!user || !user.id) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const userId = String(user.id);
  const limit = user.role === 'admin' ? 15 : 5;
  const bucket = getBucket(presentationBuckets, `pres:${userId}`, 3600_000);

  if (bucket.count >= limit) {
    const retryAfter = Math.ceil((bucket.resetAt - Date.now()) / 1000);
    res.status(429).json({
      error: `Presentation rate limit exceeded (${limit}/hour). Try again in ${Math.ceil(retryAfter / 60)} minutes.`,
      retryAfter,
    });
    return;
  }

  bucket.count++;
  next();
}

/**
 * Get current rate limit status for a user (used by admin endpoints).
 */
export function getRateLimitStatus(userId: string): {
  minuteUsed: number;
  minuteLimit: number;
  hourUsed: number;
  hourLimit: number;
} {
  const minuteBucket = minuteBuckets.get(`answer:${userId}`);
  const hourBucket = hourBuckets.get(`answer:${userId}`);

  return {
    minuteUsed: minuteBucket?.count || 0,
    minuteLimit: 20, // Default; actual depends on role
    hourUsed: hourBucket?.count || 0,
    hourLimit: 200,
  };
}
