import cron from 'node-cron';
import { query } from '../db/index.js';
import { getBudgetsExceedingThreshold, logFinancialAction } from '../db/budgetDb.js';
import { emitToUser } from '../sockets/index.js';

const DEFAULT_ORG_SLUG = 'messign';

async function checkBudgetAlerts(): Promise<void> {
  try {
    const orgResult = await query<{ id: string }>(
      `SELECT id FROM organizations WHERE slug = $1 LIMIT 1`,
      [DEFAULT_ORG_SLUG],
    );
    const orgId = orgResult.rows[0]?.id;
    if (!orgId) return;

    const exceeded = await getBudgetsExceedingThreshold(orgId);
    if (exceeded.length === 0) return;

    const today = new Date().toISOString().split('T')[0];

    for (const budget of exceeded) {
      const alreadySent = await query<{ id: string }>(
        `SELECT id FROM ai_financial_action_log
         WHERE action_type = 'budget_threshold_alert'
           AND related_entity_id = $1
           AND created_at::date = $2::date
         LIMIT 1`,
        [budget.id, today],
      );

      if (alreadySent.rows.length > 0) continue;

      const status = budget.utilizationPct >= 1 ? 'OVER BUDGET' : 'WARNING';
      const pct = (budget.utilizationPct * 100).toFixed(1);
      const message = `[${status}] ${budget.department} budget is at ${pct}% utilization — ` +
        `${budget.currency} ${budget.spent.toFixed(2)} spent of ${budget.currency} ${budget.allocatedAmount.toFixed(2)} allocated ` +
        `(${budget.periodStart} → ${budget.periodEnd})`;

      const admins = await query<{ auth_user_id: string }>(
        `SELECT auth_user_id FROM reimbursement_users
         WHERE organization_id = $1 AND role IN ('admin', 'finance') AND auth_user_id IS NOT NULL`,
        [orgId],
      );

      for (const admin of admins.rows) {
        emitToUser(admin.auth_user_id, 'dora_notification', {
          type: 'budget_alert',
          title: `Budget Alert: ${budget.department}`,
          message,
          budgetId: budget.id,
          department: budget.department,
          utilizationPct: budget.utilizationPct,
          severity: status === 'OVER BUDGET' ? 'critical' : 'warning',
        });
      }

      await logFinancialAction({
        actionType: 'budget_threshold_alert',
        relatedEntityType: 'budget',
        relatedEntityId: budget.id,
        reasoning: message,
        confidence: budget.utilizationPct,
        metadata: {
          department: budget.department,
          spent: budget.spent,
          allocated: budget.allocatedAmount,
          utilizationPct: budget.utilizationPct,
          threshold: budget.alertThreshold,
        },
      });

      console.log(`[BudgetAlertJob] Alert sent for ${budget.department}: ${pct}%`);
    }
  } catch (err) {
    console.error('[BudgetAlertJob] Error:', err);
  }
}

export function startBudgetAlertJob(): void {
  cron.schedule('0 * * * *', () => {
    console.log('[BudgetAlertJob] Running hourly budget check...');
    checkBudgetAlerts();
  });
  console.log('[BudgetAlertJob] Scheduled hourly budget threshold checks');
}
