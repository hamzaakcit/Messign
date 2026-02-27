import { query } from '../../db/index.js';
import { slaService } from './slaService.js';
import { notificationService } from './notificationService.js';
import { auditService } from './auditService.js';

async function logJobRun(orgId: string, jobName: string, fn: () => Promise<unknown>) {
  const start = await query(
    `INSERT INTO finance_dora_job_runs (organization_id, job_name) VALUES ($1, $2) RETURNING id`,
    [orgId, jobName],
  );
  const runId = start.rows[0]?.id;
  try {
    const result = await fn();
    if (runId) {
      await query(
        `UPDATE finance_dora_job_runs SET status = 'completed', completed_at = NOW(), result = $1 WHERE id = $2`,
        [JSON.stringify(result ?? {}), runId],
      );
    }
    return result;
  } catch (err) {
    if (runId) {
      await query(
        `UPDATE finance_dora_job_runs SET status = 'failed', completed_at = NOW(), error_message = $1 WHERE id = $2`,
        [err instanceof Error ? err.message : 'Unknown error', runId],
      );
    }
    console.error(`[doraScheduler/${jobName}]`, err);
  }
}

async function getOrganizations(): Promise<string[]> {
  const result = await query('SELECT DISTINCT id FROM organizations LIMIT 100');
  return (result.rows as Array<{ id: string }>).map((r) => r.id);
}

export const doraScheduler = {
  async checkBudgetHealth(orgId: string) {
    const budgets = await query(
      `SELECT b.*, COALESCE(
        (SELECT SUM(r.original_amount) FROM reimbursement_requests r
         WHERE r.budget_id = b.id AND r.is_deleted = FALSE
         AND r.status IN ('approved', 'ai_approved', 'manager_approved', 'finance_approved', 'paid', 'reimbursed')
        ), 0) as actual_spent
       FROM budgets b WHERE b.organization_id = $1 AND b.is_active = TRUE`,
      [orgId],
    );

    let alerts = 0;
    for (const budget of budgets.rows) {
      const spent = parseFloat(budget.actual_spent);
      const allocated = parseFloat(budget.allocated_amount);
      if (allocated <= 0) continue;
      const pct = spent / allocated;

      await query('UPDATE budgets SET spent_amount = $1 WHERE id = $2', [spent, budget.id]);

      const threshold = budget.alert_threshold || 0.8;
      if (pct >= threshold) {
        const admins = await query(
          `SELECT id FROM reimbursement_users WHERE organization_id = $1 AND role IN ('admin', 'finance') LIMIT 5`,
          [orgId],
        );
        for (const admin of admins.rows) {
          await notificationService.create({
            organization_id: orgId,
            recipient_id: admin.id,
            type: 'budget_alert',
            title: `Budget Alert: ${budget.department}`,
            message: `${budget.department} budget is at ${(pct * 100).toFixed(1)}% — $${(allocated - spent).toFixed(0)} remaining.`,
            entity_type: 'budget',
            entity_id: budget.id,
            priority: pct >= 1 ? 'urgent' : 'high',
            ai_generated: true,
          });
        }
        alerts++;
      }
    }
    return { budgets_checked: budgets.rows.length, alerts };
  },

  async checkApprovalSLAs(orgId: string) {
    return slaService.checkAndEscalate(orgId);
  },

  async checkOverdueInvoices(orgId: string) {
    const overdue = await query(
      `UPDATE invoices SET status = 'overdue'
       WHERE organization_id = $1 AND status = 'sent'
         AND due_date < CURRENT_DATE AND (is_deleted IS NULL OR is_deleted = FALSE)
       RETURNING id, invoice_number, to_name, grand_total, due_date`,
      [orgId],
    );

    for (const inv of overdue.rows) {
      const daysPast = Math.ceil((Date.now() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24));
      const admins = await query(
        `SELECT id FROM reimbursement_users WHERE organization_id = $1 AND role IN ('admin', 'finance') LIMIT 3`,
        [orgId],
      );
      for (const admin of admins.rows) {
        await notificationService.create({
          organization_id: orgId,
          recipient_id: admin.id,
          type: 'invoice_overdue',
          title: 'Invoice Overdue',
          message: `${inv.invoice_number} (${inv.to_name}) — $${parseFloat(inv.grand_total).toFixed(0)} is ${daysPast} day${daysPast === 1 ? '' : 's'} overdue.`,
          entity_type: 'invoice',
          entity_id: inv.id,
          priority: daysPast > 21 ? 'urgent' : 'high',
          ai_generated: true,
        });
      }
      await auditService.log({
        organization_id: orgId,
        event_type: 'invoice.overdue',
        event_category: 'invoice',
        actor_type: 'system',
        entity_type: 'invoice',
        entity_id: inv.id,
        changes: { days_overdue: daysPast },
      });
    }
    return { marked_overdue: overdue.rows.length };
  },

  async generateRecurringInvoices(orgId: string) {
    const templates = await query(
      `SELECT * FROM invoices
       WHERE organization_id = $1 AND is_recurring = TRUE
         AND (is_deleted IS NULL OR is_deleted = FALSE)
         AND (recurring_config->>'paused')::boolean IS NOT TRUE`,
      [orgId],
    );

    let generated = 0;
    for (const t of templates.rows) {
      const config = t.recurring_config || {};
      const nextDate = config.next_date;
      if (!nextDate || new Date(nextDate) > new Date()) continue;

      const nextDue = computeNextDate(nextDate, config.frequency || 'monthly');
      const seqResult = await query(
        `SELECT COUNT(*) + 1 as seq FROM invoices WHERE organization_id = $1 AND parent_recurring_id = $2`,
        [orgId, t.id],
      );
      const seq = seqResult.rows[0]?.seq || 1;
      const invNumber = `${t.invoice_number}-R${String(seq).padStart(3, '0')}`;

      await query(
        `INSERT INTO invoices (organization_id, invoice_number, invoice_type, status,
          from_name, from_email, from_address, to_name, to_email, to_address, to_tax_id,
          client_id, vendor_id, currency, subtotal, tax_amount, discount_amount, grand_total,
          total_amount, amount_paid, payment_terms, notes, internal_notes, parent_recurring_id, due_date, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,0,$20,$21,$22,$23,$24,$25)`,
        [
          orgId, invNumber, t.invoice_type, config.auto_send ? 'sent' : 'draft',
          t.from_name, t.from_email, t.from_address, t.to_name, t.to_email, t.to_address, t.to_tax_id,
          t.client_id, t.vendor_id, t.currency, t.subtotal, t.tax_amount, t.discount_amount, t.grand_total,
          t.total_amount, t.payment_terms, t.notes, t.internal_notes, t.id, nextDate, t.created_by,
        ],
      );

      await query(
        `UPDATE invoices SET recurring_config = jsonb_set(COALESCE(recurring_config, '{}'), '{next_date}', $1::jsonb) WHERE id = $2`,
        [JSON.stringify(nextDue), t.id],
      );
      generated++;
    }
    return { generated };
  },

  async monthlyCloseReminder(orgId: string) {
    const now = new Date();
    if (now.getDate() > 3) return { skipped: true };

    const admins = await query(
      `SELECT id FROM reimbursement_users WHERE organization_id = $1 AND role IN ('admin', 'finance') LIMIT 5`,
      [orgId],
    );
    for (const admin of admins.rows) {
      await notificationService.create({
        organization_id: orgId,
        recipient_id: admin.id,
        type: 'period_close_reminder',
        title: 'Monthly Close Reminder',
        message: `The previous month's period close is due. Please complete the close checklist.`,
        priority: 'high',
        ai_generated: true,
      });
    }
    return { reminders_sent: admins.rows.length };
  },

  startScheduler() {
    console.log('[doraScheduler] Starting scheduled jobs...');

    const runForAllOrgs = async (jobName: string, fn: (orgId: string) => Promise<unknown>) => {
      try {
        const orgs = await getOrganizations();
        for (const orgId of orgs) {
          await logJobRun(orgId, jobName, () => fn(orgId));
        }
      } catch (err) {
        console.error(`[doraScheduler/${jobName}] top-level error`, err);
      }
    };

    setInterval(() => runForAllOrgs('checkApprovalSLAs', this.checkApprovalSLAs), 60 * 60 * 1000);
    setInterval(() => runForAllOrgs('checkBudgetHealth', this.checkBudgetHealth), 6 * 60 * 60 * 1000);
    setInterval(() => runForAllOrgs('checkOverdueInvoices', this.checkOverdueInvoices), 24 * 60 * 60 * 1000);
    setInterval(() => runForAllOrgs('generateRecurringInvoices', this.generateRecurringInvoices), 24 * 60 * 60 * 1000);
    setInterval(() => runForAllOrgs('monthlyCloseReminder', this.monthlyCloseReminder), 24 * 60 * 60 * 1000);

    setTimeout(() => runForAllOrgs('checkApprovalSLAs', this.checkApprovalSLAs), 30000);
    setTimeout(() => runForAllOrgs('checkBudgetHealth', this.checkBudgetHealth), 60000);
  },
};

function computeNextDate(current: string, frequency: string): string {
  const d = new Date(current);
  switch (frequency) {
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toISOString().split('T')[0];
}
