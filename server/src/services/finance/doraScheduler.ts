import { query } from '../../db/index.js';
import { doraSchedulerQueue } from '../../queue/index.js';
import type { CallerContext } from '../../dal/types.js';
import * as support from '../../modules/support/dal/index.js';
import { eventBus } from '../../events/index.js';
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

export async function getOrganizations(): Promise<string[]> {
  const result = await query('SELECT DISTINCT id FROM organizations LIMIT 100');
  return (result.rows as Array<{ id: string }>).map((r) => r.id);
}

/** Run a scheduler job for all orgs and log each run to finance_dora_job_runs. Used by doraSchedulerWorker. */
export async function runSchedulerJobForAllOrgs(
  jobName: string,
  fn: (orgId: string) => Promise<unknown>,
): Promise<void> {
  try {
    const orgs = await getOrganizations();
    for (const orgId of orgs) {
      await logJobRun(orgId, jobName, () => fn(orgId));
    }
  } catch (err) {
    console.error(`[doraScheduler/${jobName}] top-level error`, err);
  }
}

function buildSystemCtx(orgId: string): CallerContext {
  return {
    userId: `system:${orgId}`,
    role: 'system_admin',
    organizationId: orgId,
  };
}

function getActiveSlaWindow(ticket: support.sla.TicketSLAItem): {
  slaType: 'first_response' | 'resolution';
  percentElapsed: number;
  hoursRemaining: number;
} {
  const useFirstResponse = !ticket.firstResponse.isMet && ticket.firstResponse.dueAt !== null;
  const active = useFirstResponse ? ticket.firstResponse : ticket.resolution;
  return {
    slaType: useFirstResponse ? 'first_response' : 'resolution',
    percentElapsed: active.percentElapsed,
    hoursRemaining: Math.max(0, Number((active.totalHours - active.elapsedHours).toFixed(2))),
  };
}

async function resolveEscalationTarget(orgId: string, excludeAssigneeId?: string | null): Promise<string | null> {
  const result = await query<{ id: string }>(
    `SELECT id::text AS id
     FROM reimbursement_users
     WHERE organization_id = $1
       AND role IN ('manager', 'admin', 'finance')
       AND ($2::uuid IS NULL OR id != $2::uuid)
     ORDER BY CASE role
       WHEN 'manager' THEN 1
       WHEN 'admin' THEN 2
       ELSE 3
     END, created_at ASC
     LIMIT 1`,
    [orgId, excludeAssigneeId ?? null],
  );
  return result.rows[0]?.id ?? null;
}

export const doraScheduler = {
  async checkBudgetHealth(orgId: string) {
    const budgets = await query(
      `SELECT b.*, COALESCE(
        (SELECT SUM(r.original_amount) FROM reimbursement_requests r
         WHERE r.budget_id = b.id AND r.is_deleted = FALSE
         AND r.status IN ('approved', 'ai_approved', 'manager_approved', 'finance_approved', 'paid', 'reimbursed')
        ), 0) as actual_spent
       FROM finance_budgets b WHERE b.organization_id = $1 AND (b.is_active = TRUE OR b.status = 'active')`,
      [orgId],
    );

    let alerts = 0;
    for (const budget of budgets.rows) {
      const spent = parseFloat(budget.actual_spent);
      const allocated = parseFloat(budget.allocated_amount);
      if (allocated <= 0) continue;
      const pct = spent / allocated;

      await query('UPDATE finance_budgets SET spent_amount = $1 WHERE id = $2', [spent, budget.id]);

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

  async checkSupportSLAs(orgId: string) {
    const systemCtx = buildSystemCtx(orgId);
    const report = await support.sla.checkSLACompliance(systemCtx);

    let escalated = 0;
    for (const ticket of report.atRisk) {
      const activeWindow = getActiveSlaWindow(ticket);
      eventBus.emit('support.sla.warning', {
        ticketId: ticket.ticketId,
        slaType: activeWindow.slaType,
        percentElapsed: activeWindow.percentElapsed,
        hoursRemaining: activeWindow.hoursRemaining,
      });
    }

    for (const ticket of report.breached) {
      const activeWindow = getActiveSlaWindow(ticket);
      eventBus.emit('support.sla.breached', {
        ticketId: ticket.ticketId,
        slaType: activeWindow.slaType,
        breachedAt: new Date().toISOString(),
        assigneeId: ticket.assigneeId ?? undefined,
      });

      const escalationTarget = await resolveEscalationTarget(orgId, ticket.assigneeId);
      if (escalationTarget) {
        await support.tickets.escalateTicket(
          systemCtx,
          ticket.ticketId,
          escalationTarget,
          'SLA breached - auto-escalated by Dora',
        );
        escalated++;
      }
    }

    return {
      on_track: report.onTrack.length,
      at_risk: report.atRisk.length,
      breached: report.breached.length,
      escalated,
    };
  },

  async recalculateCustomerHealth(orgId: string) {
    const companies = await query<{ crm_company_id: string }>(
      `SELECT DISTINCT crm_company_id::text AS crm_company_id
       FROM support_tickets
       WHERE organization_id = $1
         AND crm_company_id IS NOT NULL
         AND created_at >= NOW() - INTERVAL '7 days'`,
      [orgId],
    );

    let updated = 0;
    for (const row of companies.rows) {
      await support.customerHealth.updateCustomerHealth(row.crm_company_id);
      updated++;
    }

    return { companies_updated: updated };
  },

  async detectSupportPatterns(orgId: string) {
    const patterns = await query<{
      pattern: string;
      ticket_ids: string[];
      frequency: string;
    }>(
      `SELECT LOWER(TRIM(subject)) AS pattern,
              ARRAY_AGG(id::text ORDER BY created_at DESC) AS ticket_ids,
              COUNT(*)::int AS frequency
       FROM support_tickets
       WHERE organization_id = $1
         AND created_at >= NOW() - INTERVAL '7 days'
       GROUP BY LOWER(TRIM(subject))
       HAVING COUNT(*) >= 3
       ORDER BY COUNT(*) DESC
       LIMIT 10`,
      [orgId],
    );

    for (const row of patterns.rows) {
      eventBus.emit('support.pattern.detected', {
        pattern: row.pattern,
        ticketIds: row.ticket_ids,
        frequency: parseInt(row.frequency, 10),
        suggestedAction: 'Review repeated issue and prepare a standard response or product fix.',
        organizationId: orgId,
      });
    }

    const volumeResult = await query<{ current_count: string; average_count: string }>(
      `WITH current_window AS (
         SELECT COUNT(*)::numeric AS current_count
         FROM support_tickets
         WHERE organization_id = $1
           AND created_at >= NOW() - INTERVAL '24 hours'
       ),
       previous_days AS (
         SELECT DATE(created_at) AS day, COUNT(*)::numeric AS daily_count
         FROM support_tickets
         WHERE organization_id = $1
           AND created_at >= NOW() - INTERVAL '8 days'
           AND created_at < NOW() - INTERVAL '24 hours'
         GROUP BY DATE(created_at)
       )
       SELECT
         COALESCE((SELECT current_count FROM current_window), 0)::text AS current_count,
         COALESCE((SELECT AVG(daily_count) FROM previous_days), 0)::text AS average_count`,
      [orgId],
    );

    const currentCount = Number(volumeResult.rows[0]?.current_count ?? 0);
    const averageCount = Number(volumeResult.rows[0]?.average_count ?? 0);
    if (averageCount > 0 && currentCount >= averageCount * 1.5 && currentCount - averageCount >= 3) {
      eventBus.emit('support.volume.spike', {
        currentCount,
        averageCount,
        percentAboveAverage: Number((((currentCount - averageCount) / averageCount) * 100).toFixed(2)),
        timeWindow: '24h',
        organizationId: orgId,
      });
    }

    return {
      patterns_detected: patterns.rows.length,
      volume_spike: averageCount > 0 && currentCount >= averageCount * 1.5 && currentCount - averageCount >= 3,
    };
  },

  async checkAssetWarranties(orgId: string) {
    const assets = await query<{
      id: string;
      name: string;
      warranty_end: string;
      days_remaining: string;
    }>(
      `SELECT
         id::text AS id,
         name,
         warranty_end::text AS warranty_end,
         (warranty_end - CURRENT_DATE)::int::text AS days_remaining
       FROM assets
       WHERE organization_id = $1::uuid
         AND warranty_end IS NOT NULL
         AND warranty_end >= CURRENT_DATE
         AND warranty_end <= CURRENT_DATE + INTERVAL '30 days'`,
      [orgId],
    );
    for (const asset of assets.rows) {
      eventBus.emit('asset.warranty_expiring', {
        assetId: asset.id,
        assetName: asset.name,
        warrantyEnd: asset.warranty_end,
        daysRemaining: Number(asset.days_remaining ?? 0),
      });
    }
    return { flagged: assets.rows.length };
  },

  async checkLicenseUtilization(orgId: string) {
    const licenses = await query<{
      license_id: string;
      software_name: string;
      expires_at: string | null;
      days_remaining: string | null;
      seats_used: number;
      seats_purchased: number;
      utilization_percent: string;
      total_monthly_cost: string | null;
      is_underutilized: boolean;
    }>(
      `SELECT
         l.id::text AS license_id,
         l.software_name,
         l.expiry_date::text AS expires_at,
         CASE WHEN l.expiry_date IS NULL THEN NULL ELSE (l.expiry_date - CURRENT_DATE)::int::text END AS days_remaining,
         l.seats_used,
         l.seats_purchased,
         mv.utilization_percent::text,
         l.total_monthly_cost::text,
         mv.is_underutilized
       FROM licenses l
       JOIN mv_license_utilization mv ON mv.license_id = l.id
       WHERE l.organization_id = $1::uuid`,
      [orgId],
    );

    let underutilized = 0;
    let expiring = 0;
    for (const license of licenses.rows) {
      const daysRemaining = Number(license.days_remaining ?? 9999);
      if (license.is_underutilized) {
        underutilized++;
        eventBus.emit('asset.license.underutilized', {
          licenseId: license.license_id,
          softwareName: license.software_name,
          utilizationPercent: Number(license.utilization_percent ?? 0),
          seatsUsed: Number(license.seats_used ?? 0),
          seatsPurchased: Number(license.seats_purchased ?? 0),
          monthlyCost: Number(license.total_monthly_cost ?? 0),
        });
      }
      if (daysRemaining >= 0 && daysRemaining <= 30) {
        expiring++;
        eventBus.emit('asset.license.expiring', {
          licenseId: license.license_id,
          softwareName: license.software_name,
          expiresAt: license.expires_at ?? '',
          daysRemaining,
          seatsUsed: Number(license.seats_used ?? 0),
          seatsPurchased: Number(license.seats_purchased ?? 0),
        });
      }
    }
    return { underutilized, expiring };
  },

  async checkContractRenewals(orgId: string) {
    const reminders = await query<{
      reminder_id: string;
      contract_id: string;
      title: string;
      counterparty_name: string;
      end_date: string;
      days_remaining: string;
      auto_renew: boolean;
    }>(
      `SELECT
         cr.id::text AS reminder_id,
         c.id::text AS contract_id,
         c.title,
         c.counterparty_name,
         c.end_date::text AS end_date,
         (c.end_date - CURRENT_DATE)::int::text AS days_remaining,
         c.auto_renew
       FROM contract_reminders cr
       JOIN contracts c ON c.id = cr.contract_id
       WHERE c.organization_id = $1::uuid
         AND cr.sent = FALSE
         AND cr.reminder_date <= CURRENT_DATE`,
      [orgId],
    );
    for (const reminder of reminders.rows) {
      eventBus.emit('contract.expiring', {
        contractId: reminder.contract_id,
        title: reminder.title,
        counterparty: reminder.counterparty_name,
        expiresAt: reminder.end_date,
        daysRemaining: Number(reminder.days_remaining ?? 0),
        autoRenew: reminder.auto_renew,
      });
      await query(
        `UPDATE contract_reminders SET sent = TRUE, sent_at = NOW() WHERE id = $1::uuid`,
        [reminder.reminder_id],
      );
    }
    return { reminders_sent: reminders.rows.length };
  },

  async checkContractObligations(orgId: string) {
    const dueSoon = await query<{
      obligation_id: string;
      contract_id: string;
      description: string;
      due_date: string;
      days_remaining: string;
    }>(
      `SELECT
         co.id::text AS obligation_id,
         co.contract_id::text AS contract_id,
         co.description,
         co.due_date::text AS due_date,
         (co.due_date - CURRENT_DATE)::int::text AS days_remaining
       FROM contract_obligations co
       JOIN contracts c ON c.id = co.contract_id
       WHERE c.organization_id = $1::uuid
         AND co.status = 'pending'
         AND co.due_date IS NOT NULL
         AND co.due_date <= CURRENT_DATE + INTERVAL '7 days'
         AND co.due_date >= CURRENT_DATE`,
      [orgId],
    );
    for (const row of dueSoon.rows) {
      eventBus.emit('contract.compliance_due', {
        contractId: row.contract_id,
        obligationId: row.obligation_id,
        description: row.description,
        dueDate: row.due_date,
        daysRemaining: Number(row.days_remaining ?? 0),
      });
    }

    const overdueUpdate = await query(
      `UPDATE contract_obligations co
       SET status = 'overdue'
       FROM contracts c
       WHERE c.id = co.contract_id
         AND c.organization_id = $1::uuid
         AND co.status = 'pending'
         AND co.due_date < CURRENT_DATE`,
      [orgId],
    );
    return { compliance_due: dueSoon.rows.length, overdue_marked: overdueUpdate.rowCount ?? 0 };
  },

  async checkUtilization(orgId: string) {
    const underUtilized = await query<{ user_id: string; utilization_percent: string }>(
      `SELECT mv.user_id::text AS user_id, mv.utilization_percent::text AS utilization_percent
       FROM mv_time_utilization mv
       JOIN reimbursement_users ru ON ru.id = mv.user_id
       WHERE ru.organization_id = $1
         AND mv.utilization_percent < 75`,
      [orgId],
    );

    for (const row of underUtilized.rows) {
      eventBus.emit('time.utilization.threshold', {
        userId: row.user_id,
        currentUtilization: Number(row.utilization_percent),
        targetUtilization: 75,
        period: 'week',
        isBelow: true,
      });
    }

    const overtime = await query<{ user_id: string; weekly_hours: string }>(
      `SELECT
         te.user_id::text AS user_id,
         COALESCE(SUM(te.hours), 0)::float::text AS weekly_hours
       FROM time_entries te
       WHERE te.organization_id = $1
         AND te.date >= DATE_TRUNC('week', CURRENT_DATE)::date
         AND te.status != 'rejected'
       GROUP BY te.user_id
       HAVING COALESCE(SUM(te.hours), 0) > 45`,
      [orgId],
    );

    const weekStart = await query<{ week_start: string }>(
      `SELECT DATE_TRUNC('week', CURRENT_DATE)::date::text AS week_start`,
    );
    const weekStartDate = weekStart.rows[0]?.week_start ?? new Date().toISOString().slice(0, 10);

    for (const row of overtime.rows) {
      eventBus.emit('time.overtime.detected', {
        userId: row.user_id,
        weeklyHours: Number(row.weekly_hours),
        threshold: 45,
        weekStartDate,
      });
    }

    return {
      under_utilized: underUtilized.rows.length,
      overtime: overtime.rows.length,
    };
  },
};

export async function initDoraScheduler(): Promise<void> {
  console.log('[DoraScheduler] Initializing scheduled jobs via BullMQ...');

  const existingJobs = await doraSchedulerQueue.getRepeatableJobs();
  for (const job of existingJobs) {
    await doraSchedulerQueue.removeRepeatableByKey(job.key);
  }

  await doraSchedulerQueue.add(
    'budget-health-check',
    { type: 'budget_health_check' },
    { repeat: { every: 6 * 60 * 60 * 1000 }, jobId: 'budget-health-check' },
  );

  await doraSchedulerQueue.add(
    'sla-check',
    { type: 'sla_check' },
    { repeat: { every: 60 * 60 * 1000 }, jobId: 'sla-check' },
  );

  await doraSchedulerQueue.add(
    'overdue-invoice-check',
    { type: 'overdue_invoice_check' },
    { repeat: { pattern: '0 8 * * *' }, jobId: 'overdue-invoice-check' },
  );

  await doraSchedulerQueue.add(
    'recurring-invoice-gen',
    { type: 'recurring_invoice_generation' },
    { repeat: { pattern: '0 6 * * *' }, jobId: 'recurring-invoice-gen' },
  );

  await doraSchedulerQueue.add(
    'refresh-materialized-views',
    { type: 'refresh_materialized_views' },
    { repeat: { every: 15 * 60 * 1000 }, jobId: 'refresh-mv' },
  );

  await doraSchedulerQueue.add(
    'support-sla-check',
    { type: 'support_sla_check' },
    { repeat: { every: 30 * 60 * 1000 }, jobId: 'support-sla-check' },
  );

  await doraSchedulerQueue.add(
    'customer-health-recalc',
    { type: 'customer_health_recalc' },
    { repeat: { every: 2 * 60 * 60 * 1000 }, jobId: 'customer-health-recalc' },
  );

  await doraSchedulerQueue.add(
    'support-pattern-detection',
    { type: 'support_pattern_detection' },
    { repeat: { every: 6 * 60 * 60 * 1000 }, jobId: 'support-pattern-detection' },
  );

  await doraSchedulerQueue.add(
    'utilization-check',
    { type: 'utilization_check' },
    { repeat: { pattern: '0 9 * * 1' }, jobId: 'utilization-check' },
  );

  await doraSchedulerQueue.add(
    'asset-warranty-check',
    { type: 'asset_warranty_check' },
    { repeat: { pattern: '0 9 * * *' }, jobId: 'asset-warranty-check' },
  );

  await doraSchedulerQueue.add(
    'license-utilization-check',
    { type: 'license_utilization_check' },
    { repeat: { pattern: '0 10 * * 1' }, jobId: 'license-utilization-check' },
  );

  await doraSchedulerQueue.add(
    'contract-renewal-check',
    { type: 'contract_renewal_check' },
    { repeat: { pattern: '0 8 * * *' }, jobId: 'contract-renewal-check' },
  );

  await doraSchedulerQueue.add(
    'contract-obligation-check',
    { type: 'contract_obligation_check' },
    { repeat: { pattern: '0 9 * * *' }, jobId: 'contract-obligation-check' },
  );

  await doraSchedulerQueue.add(
    'generate-daily-briefings',
    { type: 'generate_daily_briefings' },
    { repeat: { pattern: '0 7 * * 1-5' }, jobId: 'daily-briefings' },
  );

  // ── Dora Heart jobs ──
  await doraSchedulerQueue.add(
    'burnout-assessment',
    { type: 'burnout_assessment' },
    { repeat: { pattern: '0 8 * * 1' }, jobId: 'burnout-assessment' },
  );
  await doraSchedulerQueue.add(
    'team-health-calc',
    { type: 'team_health_calculation' },
    { repeat: { pattern: '0 9 * * 1' }, jobId: 'team-health-calc' },
  );
  await doraSchedulerQueue.add(
    'weekly-sentiment-composite',
    { type: 'weekly_sentiment_composite' },
    { repeat: { pattern: '0 0 * * 0' }, jobId: 'weekly-sentiment-composite' },
  );
  await doraSchedulerQueue.add(
    'auto-pulse-survey',
    { type: 'auto_pulse_survey' },
    { repeat: { pattern: '0 10 * * 3' }, jobId: 'auto-pulse-survey' },
  );
  await doraSchedulerQueue.add(
    'onboarding-milestone-check',
    { type: 'onboarding_milestone_check' },
    { repeat: { pattern: '0 9 * * *' }, jobId: 'onboarding-milestone-check' },
  );

  console.log('[DoraScheduler] Registered support jobs: support-sla-check, customer-health-recalc, support-pattern-detection');
  console.log('[DoraScheduler] Registered time jobs: utilization-check');
  console.log('[DoraScheduler] Registered asset/contracts jobs: asset-warranty-check, license-utilization-check, contract-renewal-check, contract-obligation-check');
  console.log('[DoraScheduler] Registered Heart jobs: burnout-assessment, team-health-calc, weekly-sentiment-composite, auto-pulse-survey, onboarding-milestone-check');
  console.log('[DoraScheduler] 19 scheduled jobs registered');
}

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
