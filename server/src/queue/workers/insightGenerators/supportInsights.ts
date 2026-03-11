import { query } from '../../../db/index.js';
import * as doraInsights from '../../../dal/doraInsights.js';

async function getTicketMeta(ticketId: string) {
  const result = await query<{
    organization_id: string;
    ticket_number: string;
    subject: string;
    assignee_id: string | null;
  }>(
    `SELECT
       organization_id::text AS organization_id,
       ticket_number::text AS ticket_number,
       subject,
       assignee_id::text AS assignee_id
     FROM support_tickets
     WHERE id = $1
     LIMIT 1`,
    [ticketId],
  );
  return result.rows[0];
}

export async function onSLABreached(payload: { ticketId: string; slaType: string; assigneeId?: string }) {
  const ticket = await getTicketMeta(payload.ticketId);
  const ticketLabel = ticket?.ticket_number ? `#${ticket.ticket_number}` : payload.ticketId;

  return doraInsights.createInsight({
    organizationId: ticket?.organization_id,
    module: 'support',
    severity: 'critical',
    title: 'SLA breached',
    message: `Ticket ${ticketLabel} has breached its ${payload.slaType} SLA. Immediate attention required.`,
    actionUrl: `/support?detail=${payload.ticketId}`,
    actionLabel: 'View Ticket',
    sourceEvent: 'support.sla.breached',
    sourceEntityType: 'ticket',
    sourceEntityId: payload.ticketId,
    targetUserId: payload.assigneeId ?? ticket?.assignee_id ?? undefined,
    targetRole: 'manager',
    metadata: {
      ticketNumber: ticket?.ticket_number,
      subject: ticket?.subject,
      slaType: payload.slaType,
    },
  });
}

export async function onPatternDetected(payload: {
  pattern: string;
  ticketIds: string[];
  frequency: number;
  suggestedAction: string;
  organizationId?: string;
}) {
  const organizationId = payload.organizationId ?? (
    await query<{ organization_id: string }>(
      `SELECT organization_id::text AS organization_id
       FROM support_tickets
       WHERE id = ANY($1::uuid[])
       LIMIT 1`,
      [payload.ticketIds],
    )
  ).rows[0]?.organization_id;

  return doraInsights.createInsight({
    organizationId,
    module: 'support',
    severity: 'warning',
    title: 'Recurring issue pattern detected',
    message: `${payload.frequency} tickets this week mention "${payload.pattern}". ${payload.suggestedAction}`,
    actionUrl: '/support?filter=pattern',
    actionLabel: 'View Tickets',
    sourceEvent: 'support.pattern.detected',
    sourceEntityType: 'ticket',
    sourceEntityId: payload.ticketIds[0],
    targetRole: 'manager',
    metadata: {
      ticketIds: payload.ticketIds,
      pattern: payload.pattern,
      frequency: payload.frequency,
    },
  });
}

export async function onTicketVolumeSpike(payload: {
  currentCount: number;
  averageCount: number;
  percentAboveAverage: number;
  organizationId?: string;
}) {
  return doraInsights.createInsight({
    organizationId: payload.organizationId,
    module: 'support',
    severity: 'warning',
    title: 'Ticket volume spike',
    message: `${payload.currentCount} tickets in the last 24h — ${payload.percentAboveAverage.toFixed(1)}% above the 7-day average.`,
    actionUrl: '/support/dashboard',
    actionLabel: 'View Dashboard',
    sourceEvent: 'support.volume.spike',
    targetRole: 'manager',
    metadata: {
      currentCount: payload.currentCount,
      averageCount: payload.averageCount,
      percentAboveAverage: payload.percentAboveAverage,
    },
  });
}

export async function onTicketCreated(payload: {
  ticketId: string;
  subject: string;
  reporterEmail: string;
  category?: string;
  assigneeId?: string;
}) {
  const ticket = await getTicketMeta(payload.ticketId);

  return doraInsights.createInsight({
    organizationId: ticket?.organization_id,
    module: 'support',
    severity: 'info',
    title: 'New support ticket needs review',
    message: `New ticket "${payload.subject}" was created${payload.category ? ` in ${payload.category}` : ''}. Dora can help triage and suggest next steps.`,
    actionUrl: `/support?detail=${payload.ticketId}`,
    actionLabel: 'Open Ticket',
    sourceEvent: 'support.ticket.created',
    sourceEntityType: 'ticket',
    sourceEntityId: payload.ticketId,
    targetUserId: payload.assigneeId,
    targetRole: payload.assigneeId ? undefined : 'manager',
    metadata: {
      reporterEmail: payload.reporterEmail,
      category: payload.category,
      ticketNumber: ticket?.ticket_number,
    },
  });
}
