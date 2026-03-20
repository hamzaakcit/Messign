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
    const orgId = payload.organizationId;
    if (orgId) {
      await Promise.all([
        invalidateExecutiveDashboard(),
        invalidateCrmMetrics(orgId),
        invalidateReports(orgId),
      ]);
    }
  });

  eventBus.on('finance.expense.approved', async (payload) => {
    const orgId = payload.organizationId;
    if (orgId) {
      await Promise.all([
        invalidateExecutiveDashboard(),
        invalidateSupportMetrics(orgId),
        invalidateReports(orgId),
      ]);
    }
  });

  eventBus.on('okr.goal.updated', async (payload) => {
    const orgId = payload.organizationId;
    if (orgId) {
      invalidateContextCacheForOrganization(orgId);
      await Promise.all([
        invalidateExecutiveDashboard(),
        invalidateReports(orgId),
      ]);
    }
  });

  eventBus.on('time.timesheet.approved', async (payload) => {
    const uid = (payload as { userId?: string }).userId;
    if (uid) invalidateContextCacheForUser(uid);
  });

  eventBus.on('time.timesheet.rejected', async (payload) => {
    const uid = (payload as { userId?: string }).userId;
    if (uid) invalidateContextCacheForUser(uid);
  });

  eventBus.on('recruitment.candidate.hired', async (payload) => {
    const orgId = payload.organizationId;
    if (orgId) {
      await Promise.all([
        invalidateExecutiveDashboard(),
        invalidateReports(orgId),
      ]);
    }
  });

  console.log('[Subscriber] Cache invalidation subscriber registered');
}
