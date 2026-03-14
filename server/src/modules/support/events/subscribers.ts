import type { EventBus } from '../../../platform/eventBus.js';
import { doraInsightsQueue, doraSchedulerQueue, gamificationQueue, notificationQueue, embeddingsQueue } from '../../../queue/index.js';
import { query } from '../../../db/index.js';
import * as doraInsights from '../../../dal/doraInsights.js';

interface TicketMeta {
  id: string;
  organization_id: string;
  ticket_number: string;
  subject: string;
  reporter_email: string;
  assignee_id: string | null;
  crm_company_id: string | null;
  crm_contact_id: string | null;
  resolution_time_hours: string | null;
  created_at: string;
  sla_resolution_due: string | null;
}

async function getTicketMeta(ticketId: string): Promise<TicketMeta | null> {
  const result = await query<TicketMeta>(
    `SELECT
       id::text,
       organization_id::text,
       ticket_number::text,
       subject,
       reporter_email,
       assignee_id::text,
       crm_company_id::text,
       crm_contact_id::text,
       resolution_time_hours::text,
       created_at::text,
       sla_resolution_due::text
     FROM support_tickets
     WHERE id = $1
     LIMIT 1`,
    [ticketId],
  );
  return result.rows[0] ?? null;
}

async function linkTicketToCrm(ticket: TicketMeta): Promise<TicketMeta> {
  if (ticket.crm_company_id || ticket.crm_contact_id) {
    return ticket;
  }

  const contactResult = await query<{ contact_id: string; company_id: string | null }>(
    `SELECT ct.id::text AS contact_id, ct.company_id::text AS company_id
     FROM crm_contacts ct
     JOIN crm_companies co ON co.id = ct.company_id
     WHERE co.organization_id = $1
       AND LOWER(ct.email) = LOWER($2)
     LIMIT 1`,
    [ticket.organization_id, ticket.reporter_email],
  );

  const contact = contactResult.rows[0];
  if (!contact) {
    return ticket;
  }

  await query(
    `UPDATE support_tickets
     SET crm_contact_id = COALESCE(crm_contact_id, $2::uuid),
         crm_company_id = COALESCE(crm_company_id, $3::uuid),
         updated_at = NOW()
     WHERE id = $1`,
    [ticket.id, contact.contact_id, contact.company_id],
  );

  return {
    ...ticket,
    crm_contact_id: ticket.crm_contact_id ?? contact.contact_id,
    crm_company_id: ticket.crm_company_id ?? contact.company_id,
  };
}

async function maybeEmitVolumeSpike(eventBus: EventBus, organizationId: string): Promise<void> {
  const counts = await query<{ current_count: string; average_count: string }>(
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
    [organizationId],
  );

  const currentCount = Number(counts.rows[0]?.current_count ?? 0);
  const averageCount = Number(counts.rows[0]?.average_count ?? 0);
  if (averageCount > 0 && currentCount > averageCount * 1.5) {
    eventBus.emit('support.volume.spike', {
      currentCount,
      averageCount,
      percentAboveAverage: Number((((currentCount - averageCount) / averageCount) * 100).toFixed(2)),
      timeWindow: '24h',
      organizationId,
    });
  }
}

async function notifySlaBreachUsers(ticketId: string, assigneeId?: string) {
  if (!assigneeId) {
    return;
  }

  await notificationQueue.add('support_sla_breach_assignee', {
    userId: assigneeId,
    type: 'support_sla_breach',
    title: 'Support SLA breached',
    message: `Ticket ${ticketId} has breached its SLA and needs immediate attention.`,
    link: `/support?detail=${ticketId}`,
    channel: 'in_app',
  });

  const managerResult = await query<{ manager_id: string | null }>(
    `SELECT manager_id::text AS manager_id
     FROM reimbursement_users
     WHERE id = $1
     LIMIT 1`,
    [assigneeId],
  );
  const managerId = managerResult.rows[0]?.manager_id;
  if (managerId) {
    await notificationQueue.add('support_sla_breach_manager', {
      userId: managerId,
      type: 'support_sla_breach',
      title: 'Escalated support SLA breach',
      message: `A ticket assigned to your team has breached its SLA.`,
      link: `/support?detail=${ticketId}`,
      channel: 'in_app',
    });
  }
}

export function registerSupportEventHandlers(eventBus: EventBus): void {
  eventBus.on('support.ticket.created', async (payload) => {
    let ticket = await getTicketMeta(payload.ticketId);
    if (!ticket) {
      return;
    }

    ticket = await linkTicketToCrm(ticket);

    await doraInsightsQueue.add('support_ticket_created', {
      type: 'support_ticket_created',
      payload,
    });

    if (ticket.crm_company_id) {
      const companyHealth = await query<{
        health_score: string;
        trend: string;
        company_name: string;
        owner_id: string | null;
      }>(
        `SELECT
           h.health_score::text AS health_score,
           h.trend,
           c.name AS company_name,
           (
             SELECT d.owner_id::text
             FROM crm_deals d
             WHERE d.company_id = c.id
             ORDER BY d.updated_at DESC
             LIMIT 1
           ) AS owner_id
         FROM crm_companies c
         LEFT JOIN support_customer_health h ON h.crm_company_id = c.id
         WHERE c.id = $1
         LIMIT 1`,
        [ticket.crm_company_id],
      );

      const health = companyHealth.rows[0];
      if (health?.owner_id && Number(health.health_score ?? 100) < 60) {
        await doraInsights.createInsight({
          organizationId: ticket.organization_id,
          module: 'sales',
          severity: 'critical',
          title: 'At-risk customer opened a support ticket',
          message: `${health.company_name} just submitted a support ticket and their health score is ${health.health_score} (${health.trend}).`,
          actionUrl: `/support?detail=${ticket.id}`,
          actionLabel: 'View Ticket',
          sourceEvent: 'support.ticket.created',
          sourceEntityType: 'ticket',
          sourceEntityId: ticket.id,
          targetUserId: health.owner_id,
        });
      }
    }

    await maybeEmitVolumeSpike(eventBus, ticket.organization_id);

    const orgId = payload.organizationId ?? ticket.organization_id;
    if (orgId && (payload.subject || payload.description)) {
      const text = `${payload.subject ?? ''}. ${payload.description ?? ''}`.trim();
      if (text) {
        await embeddingsQueue.add('embed', {
          type: 'embed',
          payload: {
            tenantId: orgId,
            sourceModule: 'support',
            sourceType: 'ticket_description',
            sourceId: payload.ticketId,
            text,
            metadata: { ticket_id: payload.ticketId, priority: payload.priority, category: payload.category },
            accessRoles: ['support', 'manager', 'admin'],
            sensitivity: 'normal',
          },
        }).catch((err) => console.error('[Support Embedding] ticket.created enqueue', err));
      }
    }
  });

  eventBus.on('support.ticket.resolved', async (payload) => {
    const ticket = await getTicketMeta(payload.ticketId);
    if (!ticket) {
      return;
    }

    if (ticket.crm_company_id) {
      await doraSchedulerQueue.add('customer-health-recalc-manual', {
        type: 'customer_health_recalc',
      });
    }

    if (ticket.assignee_id) {
      await gamificationQueue.add('support_resolution_xp', {
        type: 'award_xp',
        userId: ticket.assignee_id,
        amount: 10,
        reason: 'Resolved support ticket',
      });
    }

    const targetHours = ticket.sla_resolution_due
      ? (new Date(ticket.sla_resolution_due).getTime() - new Date(ticket.created_at).getTime()) / 3_600_000
      : null;
    const resolutionHours = Number(ticket.resolution_time_hours ?? payload.resolutionTimeHours ?? 0);

    if (ticket.assignee_id && targetHours && resolutionHours > 0 && resolutionHours <= targetHours * 0.5) {
      await doraInsights.createInsight({
        organizationId: ticket.organization_id,
        module: 'support',
        severity: 'success',
        title: 'Resolved faster than SLA',
        message: `Great job. Ticket #${ticket.ticket_number} was resolved in ${resolutionHours.toFixed(1)}h, more than 2x faster than SLA.`,
        actionUrl: `/support?detail=${ticket.id}`,
        actionLabel: 'Review Ticket',
        sourceEvent: 'support.ticket.resolved',
        sourceEntityType: 'ticket',
        sourceEntityId: ticket.id,
        targetUserId: ticket.assignee_id,
      });
    }

    await embeddingsQueue.add('embed', {
      type: 'fetch_support_ticket',
      ticketId: payload.ticketId,
      organizationId: payload.organizationId ?? ticket.organization_id,
      sourceType: 'ticket_resolved',
    }).catch((err) => console.error('[Support Embedding] ticket.resolved enqueue', err));
  });

  eventBus.on('support.sla.breached', async (payload) => {
    await notifySlaBreachUsers(payload.ticketId, payload.assigneeId);
  });

  eventBus.on('support.csat.submitted', async (payload) => {
    const ticket = await getTicketMeta(payload.ticketId);
    if (!ticket) {
      return;
    }

    if (ticket.crm_company_id) {
      await doraSchedulerQueue.add('customer-health-recalc-csat', {
        type: 'customer_health_recalc',
      });
    }

    if (payload.rating <= 2) {
      await doraInsights.createInsight({
        organizationId: ticket.organization_id,
        module: 'support',
        severity: 'warning',
        title: 'Low CSAT received',
        message: `Low CSAT (${payload.rating}/5) received on ticket #${ticket.ticket_number}.`,
        actionUrl: `/support?detail=${ticket.id}`,
        actionLabel: 'Review Ticket',
        sourceEvent: 'support.csat.submitted',
        sourceEntityType: 'ticket',
        sourceEntityId: ticket.id,
        targetRole: 'manager',
      });
    }

    if (payload.rating >= 4 && ticket.assignee_id) {
      await gamificationQueue.add('support_csat_xp', {
        type: 'award_xp',
        userId: ticket.assignee_id,
        amount: 5,
        reason: 'High CSAT on support ticket',
      });
    }
  });

  console.log('[Support] Event handlers registered');
}
