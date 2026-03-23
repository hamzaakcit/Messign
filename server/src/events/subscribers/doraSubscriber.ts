import { eventBus } from '../eventBus.js';
import { doraInsightsQueue } from '../../queue/index.js';
import { query } from '../../db/index.js';
import { emitBroadcast, emitToDepartment, emitToRole, emitToUser } from '../../sockets/index.js';

export function register(): void {
  // Dora insight socket emission: DAL emits domain events; subscriber handles socket layer
  eventBus.on('dora.insight.created', async (payload) => {
    if (payload.targetUserId) {
      try {
        await emitToUser(payload.targetUserId, 'dora:new-insight', payload.insight);
      } catch (err) {
        console.error('[DoraSubscriber] emitToUser failed (dora.insight.created)', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (payload.targetRole) {
      try {
        await emitToRole(payload.targetRole, 'dora:new-insight', payload.insight, payload.organizationId);
      } catch (err) {
        console.error('[DoraSubscriber] emitToRole failed (dora.insight.created)', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (payload.targetDepartment) {
      try {
        await emitToDepartment(payload.targetDepartment, 'dora:new-insight', payload.insight, payload.organizationId);
      } catch (err) {
        console.error('[DoraSubscriber] emitToDepartment failed (dora.insight.created)', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (!payload.targetUserId && !payload.targetRole && !payload.targetDepartment) {
      emitBroadcast('dora:new-insight', payload.insight);
    }
  });

  eventBus.on('dora.insight.counts-refresh', async (payload) => {
    const socketPayload = { module: payload.module ?? null, updatedAt: new Date().toISOString() };
    if (payload.targetUserId) {
      try {
        await emitToUser(payload.targetUserId, 'dora:insight-counts', socketPayload);
      } catch (err) {
        console.error('[DoraSubscriber] emitToUser failed (dora.insight.counts-refresh)', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (payload.targetRole) {
      try {
        await emitToRole(payload.targetRole, 'dora:insight-counts', socketPayload, payload.organizationId);
      } catch (err) {
        console.error('[DoraSubscriber] emitToRole failed (dora.insight.counts-refresh)', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (payload.targetDepartment) {
      try {
        await emitToDepartment(payload.targetDepartment, 'dora:insight-counts', socketPayload, payload.organizationId);
      } catch (err) {
        console.error('[DoraSubscriber] emitToDepartment failed (dora.insight.counts-refresh)', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (!payload.targetUserId && !payload.targetRole && !payload.targetDepartment) {
      emitBroadcast('dora:insight-counts', socketPayload);
    }
  });

  eventBus.on('finance.expense.created', async (payload) => {
    try {
      await doraInsightsQueue.add('expense_created', {
        type: 'expense_created',
        payload: {
          expenseId: payload.expenseId,
          userId: payload.userId,
          amount: payload.amount,
          category: payload.category,
          departmentId: payload.departmentId,
        },
      });
    } catch (err) { console.error('[DoraSubscriber] finance.expense.created handler error:', err); }
  });

  eventBus.on('finance.budget.threshold_breached', async (payload) => {
    try {
      await doraInsightsQueue.add('budget_threshold_breached', {
        type: 'budget_threshold_breached',
        payload: {
          budgetId: payload.budgetId,
          departmentId: payload.departmentId,
          currentPercent: payload.currentPercent,
          threshold: payload.threshold,
        },
      });
    } catch (err) { console.error('[DoraSubscriber] finance.budget.threshold_breached handler error:', err); }
  });

  eventBus.on('finance.invoice.overdue', async (payload) => {
    try {
      await doraInsightsQueue.add('invoice_overdue', {
        type: 'invoice_overdue',
        payload: {
          invoiceId: payload.invoiceId,
          vendorId: payload.vendorId,
          daysOverdue: payload.daysOverdue,
          amount: payload.amount,
        },
      });
    } catch (err) { console.error('[DoraSubscriber] finance.invoice.overdue handler error:', err); }
  });

  eventBus.on('support.sla.breached', async (payload) => {
    try {
      await doraInsightsQueue.add('support_sla_breached', { type: 'support_sla_breached', payload });
    } catch (err) { console.error('[DoraSubscriber] support.sla.breached handler error:', err); }
  });

  eventBus.on('support.pattern.detected', async (payload) => {
    try {
      await doraInsightsQueue.add('support_pattern_detected', { type: 'support_pattern_detected', payload });
    } catch (err) { console.error('[DoraSubscriber] support.pattern.detected handler error:', err); }
  });

  eventBus.on('support.volume.spike', async (payload) => {
    try {
      await doraInsightsQueue.add('support_volume_spike', { type: 'support_volume_spike', payload });
    } catch (err) { console.error('[DoraSubscriber] support.volume.spike handler error:', err); }
  });

  eventBus.on('crm.deal.won', async (payload) => {
    try {
      await doraInsightsQueue.add('crm_deal_won', {
        type: 'crm_deal_won',
        payload: { dealId: payload.dealId, amount: payload.amount, ownerId: payload.ownerId },
      });
    } catch (err) { console.error('[DoraSubscriber] crm.deal.won handler error:', err); }
  });

  eventBus.on('crm.deal.stage_changed', async (payload) => {
    try {
      const staleResult = await query<{
        title: string;
        owner_id: string;
        days_since_activity: string;
      }>(
        `SELECT
           d.title,
           d.owner_id::text AS owner_id,
           COALESCE(
             FLOOR(EXTRACT(EPOCH FROM (NOW() - COALESCE(MAX(a.created_at), d.updated_at))) / 86400),
             0
           )::int::text AS days_since_activity
         FROM crm_deals d
         LEFT JOIN crm_activities a ON a.deal_id = d.id
         WHERE d.id = $1
         GROUP BY d.id`,
        [payload.dealId],
      );
      const stale = staleResult.rows[0];
      const daysSinceActivity = parseInt(stale?.days_since_activity ?? '0', 10);
      if (stale && daysSinceActivity >= 10) {
        await doraInsightsQueue.add('crm_deal_stale', {
          type: 'crm_deal_stale',
          payload: {
            dealId: payload.dealId,
            title: stale.title,
            ownerId: stale.owner_id,
            daysSinceActivity,
          },
        });
      }
    } catch (err) { console.error('[DoraSubscriber] crm.deal.stage_changed handler error:', err); }
  });

  console.log('[Subscriber] Dora subscriber registered');
}
