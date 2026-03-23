import { eventBus } from '../eventBus.js';
import {
  invalidateExecutiveDashboard,
  invalidateSupportMetrics,
  invalidateCrmMetrics,
  invalidateReports,
} from '../../services/cache/cacheInvalidation.js';
import { invalidateContextCacheForOrganization, invalidateContextCacheForUser } from '../../services/ai/v2/context/resolveContext.js';

export function register(): void {
  eventBus.on('crm.deal.won', async (payload) => {
    try {
      const orgId = payload.organizationId;
      if (orgId) {
        await Promise.all([
          invalidateExecutiveDashboard(),
          invalidateCrmMetrics(orgId),
          invalidateReports(orgId),
        ]);
      }
    } catch (err) { console.error('[CacheInvalidation] crm.deal.won error:', err); }
  });

  eventBus.on('finance.expense.approved', async (payload) => {
    try {
      const orgId = payload.organizationId;
      if (orgId) {
        await Promise.all([
          invalidateExecutiveDashboard(),
          invalidateSupportMetrics(orgId),
          invalidateReports(orgId),
        ]);
      }
    } catch (err) { console.error('[CacheInvalidation] finance.expense.approved error:', err); }
  });

  eventBus.on('okr.goal.updated', async (payload) => {
    try {
      const orgId = payload.organizationId;
      if (orgId) {
        invalidateContextCacheForOrganization(orgId);
        await Promise.all([
          invalidateExecutiveDashboard(),
          invalidateReports(orgId),
        ]);
      }
    } catch (err) { console.error('[CacheInvalidation] okr.goal.updated error:', err); }
  });

  eventBus.on('time.timesheet.approved', async (payload) => {
    try {
      const uid = (payload as { userId?: string }).userId;
      if (uid) invalidateContextCacheForUser(uid);
    } catch (err) { console.error('[CacheInvalidation] time.timesheet.approved error:', err); }
  });

  eventBus.on('time.timesheet.rejected', async (payload) => {
    try {
      const uid = (payload as { userId?: string }).userId;
      if (uid) invalidateContextCacheForUser(uid);
    } catch (err) { console.error('[CacheInvalidation] time.timesheet.rejected error:', err); }
  });

  eventBus.on('recruitment.candidate.hired', async (payload) => {
    try {
      const orgId = payload.organizationId;
      if (orgId) {
        await Promise.all([
          invalidateExecutiveDashboard(),
          invalidateReports(orgId),
        ]);
      }
    } catch (err) { console.error('[CacheInvalidation] recruitment.candidate.hired error:', err); }
  });

  console.log('[Subscriber] Cache invalidation subscriber registered');
}
