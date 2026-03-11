/**
 * Event-driven cache invalidation for Redis.
 * Invalidates cached dashboard/metrics when underlying data changes.
 */

import { redisConnection } from '../../queue/connection.js';

/** Delete keys matching a pattern using SCAN (non-blocking). */
export async function invalidateByPattern(pattern: string): Promise<number> {
  let deleted = 0;
  let cursor = '0';
  try {
    do {
      const [nextCursor, keys] = await redisConnection.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await redisConnection.del(...keys);
        deleted += keys.length;
      }
    } while (cursor !== '0');
  } catch (e) {
    if (e instanceof Error) console.warn('[Cache] invalidateByPattern failed:', e.message);
  }
  return deleted;
}

/** Invalidate executive dashboard cache for all users. */
export async function invalidateExecutiveDashboard(): Promise<void> {
  await invalidateByPattern('executive_dashboard_*');
}

/** Invalidate support metrics for an org (all periods). */
export async function invalidateSupportMetrics(orgId: string): Promise<void> {
  await invalidateByPattern(`support_metrics_${orgId}_*`);
}

/** Invalidate CRM metrics for an org (all periods). */
export async function invalidateCrmMetrics(orgId: string): Promise<void> {
  await invalidateByPattern(`crm_metrics_${orgId}_*`);
}

/** Invalidate report cache for an org. */
export async function invalidateReports(orgId: string): Promise<void> {
  await invalidateByPattern(`report_${orgId}_*`);
}

/** Invalidate daily briefing for a user (all dates). */
export async function invalidateDailyBriefing(userId: string): Promise<void> {
  await invalidateByPattern(`daily_briefing_${userId}_*`);
}

/** Invalidate all Finance/OKR/Executive-related caches for an org. */
export async function invalidateOrgCaches(orgId: string): Promise<void> {
  await Promise.all([
    invalidateExecutiveDashboard(),
    invalidateSupportMetrics(orgId),
    invalidateCrmMetrics(orgId),
    invalidateReports(orgId),
  ]);
}
