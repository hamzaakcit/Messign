import { eventBus } from '../eventBus.js';
import { notificationQueue } from '../../queue/index.js';
import { query } from '../../db/index.js';

async function getOrgAdminIdsByInvoice(invoiceId: string): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `SELECT ru.id::text
     FROM reimbursement_users ru
     JOIN invoices i ON i.organization_id = ru.organization_id
     WHERE i.id = $1::uuid
       AND ru.role IN ('admin', 'finance', 'finance_admin', 'system_admin')`,
    [invoiceId],
  );
  return rows.rows.map((r) => r.id);
}

async function getDealRecipients(dealId: string): Promise<string[]> {
  const rows = await query<{ owner_id: string; manager_id: string | null }>(
    `SELECT
       d.owner_id::text AS owner_id,
       m.id::text AS manager_id
     FROM crm_deals d
     LEFT JOIN reimbursement_users o ON o.id = d.owner_id
     LEFT JOIN reimbursement_users m ON m.id = o.manager_id
     WHERE d.id = $1::uuid
     LIMIT 1`,
    [dealId],
  );
  const owner = rows.rows[0]?.owner_id;
  const manager = rows.rows[0]?.manager_id;
  return [owner, manager].filter(Boolean) as string[];
}

async function getOfferAcceptedRecipients(offerId: string): Promise<string[]> {
  const rows = await query<{ hiring_manager_id: string | null; recruiter_id: string | null }>(
    `SELECT
       j.hiring_manager_id::text,
       j.recruiter_id::text
     FROM recruitment_offers o
     JOIN recruitment_applications a ON a.id = o.application_id
     JOIN recruitment_jobs j ON j.id = a.job_id
     WHERE o.id = $1::uuid
     LIMIT 1`,
    [offerId],
  );
  const manager = rows.rows[0]?.hiring_manager_id;
  const recruiter = rows.rows[0]?.recruiter_id;
  return [manager, recruiter].filter(Boolean) as string[];
}

async function getLeadQualifiedRecipients(leadId: string): Promise<string[]> {
  const owner = await query<{ owner_id: string | null; organization_id: string }>(
    `SELECT converted_by::text AS owner_id, organization_id::text
     FROM marketing_leads
     WHERE id = $1::uuid
     LIMIT 1`,
    [leadId],
  );
  const orgId = owner.rows[0]?.organization_id;
  if (!orgId) return [];
  const leads = await query<{ id: string }>(
    `SELECT id::text
     FROM reimbursement_users
     WHERE organization_id = $1::uuid
       AND role IN ('admin', 'manager', 'dept_head', 'system_admin')`,
    [orgId],
  );
  const result = new Set<string>(leads.rows.map((r) => r.id));
  if (owner.rows[0]?.owner_id) result.add(owner.rows[0].owner_id);
  return Array.from(result);
}

async function getPolicyCreator(policyId?: string): Promise<string[]> {
  if (!policyId) return [];
  const rows = await query<{ created_by: string }>(
    `SELECT created_by::text
     FROM dora_automation_policies
     WHERE id = $1::uuid
     LIMIT 1`,
    [policyId],
  );
  return rows.rows[0]?.created_by ? [rows.rows[0].created_by] : [];
}

export function register(): void {
  eventBus.on('finance.expense.approved', async (payload) => {
    await notificationQueue.add('expense_approved', {
      eventType: 'finance.expense.approved',
      expenseId: payload.expenseId,
      title: 'Expense Approved',
      message: 'Your expense has been approved',
      link: `/finance/expenses?detail=${payload.expenseId}`,
      module: 'finance',
      severity: 'success',
      channel: 'in_app',
    });
  });

  eventBus.on('finance.expense.rejected', async (payload) => {
    await notificationQueue.add('expense_rejected', {
      eventType: 'finance.expense.rejected',
      expenseId: payload.expenseId,
      title: 'Expense Rejected',
      message: payload.reason ? `Your expense was rejected: ${payload.reason}` : 'Your expense was rejected',
      link: `/finance/expenses?detail=${payload.expenseId}`,
      module: 'finance',
      severity: 'warning',
      channel: 'in_app',
    });
  });

  eventBus.on('finance.invoice.overdue', async (payload) => {
    const recipients = await getOrgAdminIdsByInvoice(payload.invoiceId);
    await notificationQueue.add('invoice_overdue', {
      eventType: 'finance.invoice.overdue',
      userIds: recipients,
      title: 'Invoice Overdue',
      message: `Invoice is ${payload.daysOverdue} days overdue (${payload.amount})`,
      link: `/finance/invoices`,
      module: 'finance',
      severity: 'critical',
      channel: 'in_app',
    });
  });

  eventBus.on('support.ticket.assigned', async (payload) => {
    await notificationQueue.add('support_ticket_assigned', {
      userId: payload.assigneeId,
      eventType: 'support.ticket.assigned',
      title: 'New ticket assigned',
      message: `Ticket ${payload.ticketId} has been assigned to you`,
      link: `/support?detail=${payload.ticketId}`,
      module: 'support',
      severity: 'info',
      channel: 'in_app',
    });
  });

  eventBus.on('support.ticket.escalated', async (payload) => {
    await notificationQueue.add('support_ticket_escalated', {
      userId: payload.escalatedTo,
      eventType: 'support.ticket.escalated',
      title: 'Ticket escalated to you',
      message: payload.reason || 'A support ticket has been escalated for your review.',
      link: `/support?detail=${payload.ticketId}`,
      module: 'support',
      severity: 'warning',
      channel: 'in_app',
    });
  });

  eventBus.on('support.sla.breached', async (payload) => {
    await notificationQueue.add('support_sla_breached', {
      userId: payload.assigneeId,
      eventType: 'support.sla.breached',
      title: 'SLA breached',
      message: `Ticket ${payload.ticketId} breached its SLA.`,
      link: `/support?detail=${payload.ticketId}`,
      module: 'support',
      severity: 'critical',
      channel: 'in_app',
    });
  });

  eventBus.on('crm.deal.won', async (payload) => {
    const recipients = await getDealRecipients(payload.dealId);
    await notificationQueue.add('crm_deal_won', {
      userIds: recipients.length ? recipients : [payload.ownerId],
      eventType: 'crm.deal.won',
      title: 'Deal won',
      message: `Great news: deal ${payload.dealId} was marked won.`,
      link: `/crm`,
      module: 'crm',
      severity: 'success',
      channel: 'in_app',
    });
  });

  eventBus.on('crm.deal.stage_changed', async (payload) => {
    const recipients = await getDealRecipients(payload.dealId);
    await notificationQueue.add('crm_stage_changed', {
      userIds: recipients,
      eventType: 'crm.deal.stage_changed',
      title: 'Deal stage updated',
      message: `Deal ${payload.dealId} moved from ${payload.oldStage} to ${payload.newStage}.`,
      link: `/crm`,
      module: 'crm',
      severity: 'info',
      channel: 'in_app',
    });
  });

  eventBus.on('recruitment.interview.scheduled', async (payload) => {
    await notificationQueue.add('recruitment_interview_scheduled', {
      userId: payload.interviewerId,
      eventType: 'recruitment.interview.scheduled',
      title: 'Interview scheduled',
      message: `You have a new interview scheduled.`,
      link: `/recruitment/interviews`,
      module: 'recruitment',
      severity: 'info',
      channel: 'in_app',
    });
  });

  eventBus.on('recruitment.offer.accepted', async (payload) => {
    const recipients = await getOfferAcceptedRecipients(payload.offerId);
    await notificationQueue.add('recruitment_offer_accepted', {
      userIds: recipients,
      eventType: 'recruitment.offer.accepted',
      title: 'Offer accepted',
      message: 'A candidate accepted an offer.',
      link: `/recruitment/dashboard`,
      module: 'recruitment',
      severity: 'success',
      channel: 'in_app',
    });
  });

  eventBus.on('time.timesheet.approved', async (payload) => {
    await notificationQueue.add('timesheet_approved', {
      userId: payload.userId,
      eventType: 'time.timesheet.approved',
      title: 'Timesheet approved',
      message: 'Your timesheet has been approved.',
      link: `/time/timesheets`,
      module: 'time',
      severity: 'success',
      channel: 'in_app',
    });
  });

  eventBus.on('time.timesheet.rejected', async (payload) => {
    await notificationQueue.add('timesheet_rejected', {
      userId: payload.userId,
      eventType: 'time.timesheet.rejected',
      title: 'Timesheet rejected',
      message: payload.reason || 'Your timesheet was rejected.',
      link: `/time/timesheets`,
      module: 'time',
      severity: 'warning',
      channel: 'in_app',
    });
  });

  eventBus.on('marketing.lead.qualified', async (payload) => {
    const recipients = await getLeadQualifiedRecipients(payload.leadId);
    await notificationQueue.add('lead_qualified', {
      userIds: recipients,
      eventType: 'marketing.lead.qualified',
      title: 'Lead qualified',
      message: `Lead ${payload.leadId} has been qualified.`,
      link: `/marketing/leads`,
      module: 'marketing',
      severity: 'info',
      channel: 'in_app',
    });
  });

  eventBus.on('dora.action.executed', async (payload) => {
    const recipients = await getPolicyCreator(payload.policyId);
    await notificationQueue.add('dora_action_executed', {
      userIds: recipients,
      eventType: 'dora.action.executed',
      title: 'Dora action executed',
      message: 'One of your automated Dora actions has executed.',
      link: `/dora/automations/log`,
      module: 'dora',
      severity: 'info',
      channel: 'in_app',
    });
  });

  console.log('[Subscriber] Notification subscriber registered');
}
