import { eventBus } from '../eventBus.js';
import { notificationQueue } from '../../queue/index.js';

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
    await notificationQueue.add('invoice_overdue', {
      eventType: 'finance.invoice.overdue',
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
    await notificationQueue.add('crm_deal_won', {
      userId: payload.ownerId,
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
    await notificationQueue.add('crm_stage_changed', {
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

  eventBus.on('recruitment.offer.accepted', async (_payload) => {
    await notificationQueue.add('recruitment_offer_accepted', {
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
    await notificationQueue.add('lead_qualified', {
      eventType: 'marketing.lead.qualified',
      title: 'Lead qualified',
      message: `Lead ${payload.leadId} has been qualified.`,
      link: `/marketing/leads`,
      module: 'marketing',
      severity: 'info',
      channel: 'in_app',
    });
  });

  eventBus.on('dora.action.executed', async (_payload) => {
    await notificationQueue.add('dora_action_executed', {
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
