import { eventBus } from '../eventBus.js';
import {
  invalidateExecutiveDashboard,
  invalidateSupportMetrics,
  invalidateCrmMetrics,
  invalidateReports,
} from '../../services/cache/cacheInvalidation.js';

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
      await Promise.all([
        invalidateExecutiveDashboard(),
        invalidateReports(orgId),
      ]);
    }
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
