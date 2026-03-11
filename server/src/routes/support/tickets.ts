import { Router } from 'express';
import type { Response } from 'express';
import * as support from '../../dal/support/index.js';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import { buildCtx, parsePositiveInt, parseSort } from './common.js';

const router = Router();

function buildFilters(req: ReimbursementRequest): support.tickets.TicketFilters {
  return {
    status: req.query.status as string | undefined,
    priority: req.query.priority as string | undefined,
    assigneeId: (req.query.assigneeId as string | undefined) ?? (req.query.assignee_id as string | undefined),
    categoryId: (req.query.categoryId as string | undefined) ?? (req.query.category_id as string | undefined),
    crmCompanyId: (req.query.crmCompanyId as string | undefined) ?? (req.query.crm_company_id as string | undefined),
    slaStatus: req.query.slaStatus as support.tickets.TicketFilters['slaStatus'],
    search: req.query.search as string | undefined,
    dateRange: (req.query.from || req.query.to)
      ? {
          from: req.query.from as string | undefined,
          to: req.query.to as string | undefined,
        }
      : undefined,
  };
}

function mapUpdateInput(body: Record<string, unknown>): support.tickets.UpdateTicketInput {
  return {
    subject: body.subject as string | undefined,
    description: body.description as string | undefined,
    status: body.status as string | undefined,
    priority: body.priority as support.tickets.UpdateTicketInput['priority'],
    category_id: (body.category_id as string | null | undefined) ?? (body.categoryId as string | null | undefined),
    assignee_id: (body.assignee_id as string | null | undefined) ?? (body.assigneeId as string | null | undefined),
    reporter_email: (body.reporter_email as string | undefined) ?? (body.reporterEmail as string | undefined),
    reporter_name: (body.reporter_name as string | null | undefined) ?? (body.reporterName as string | null | undefined),
    crm_contact_id: (body.crm_contact_id as string | null | undefined) ?? (body.crmContactId as string | null | undefined),
    crm_company_id: (body.crm_company_id as string | null | undefined) ?? (body.crmCompanyId as string | null | undefined),
    tags: body.tags as string[] | undefined,
    source: body.source as support.tickets.UpdateTicketInput['source'],
    dora_category_suggestion: (body.dora_category_suggestion as string | null | undefined) ?? (body.doraCategorySuggestion as string | null | undefined),
    dora_priority_suggestion: (body.dora_priority_suggestion as string | null | undefined) ?? (body.doraPrioritySuggestion as string | null | undefined),
    dora_sentiment: (body.dora_sentiment as string | null | undefined) ?? (body.doraSentiment as string | null | undefined),
  };
}

router.post('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    if (!body.subject || !(body.reporter_email || body.reporterEmail)) {
      res.status(400).json({ error: 'subject and reporterEmail are required' });
      return;
    }

    const ticket = await support.tickets.createTicket(buildCtx(req), {
      subject: String(body.subject),
      description: body.description as string | undefined,
      priority: body.priority as support.tickets.CreateTicketInput['priority'],
      category_id: (body.category_id as string | undefined) ?? (body.categoryId as string | undefined),
      assignee_id: (body.assignee_id as string | undefined) ?? (body.assigneeId as string | undefined),
      reporter_email: String((body.reporter_email as string | undefined) ?? body.reporterEmail),
      reporter_name: (body.reporter_name as string | undefined) ?? (body.reporterName as string | undefined),
      crm_contact_id: (body.crm_contact_id as string | undefined) ?? (body.crmContactId as string | undefined),
      crm_company_id: (body.crm_company_id as string | undefined) ?? (body.crmCompanyId as string | undefined),
      tags: body.tags as string[] | undefined,
      source: body.source as support.tickets.CreateTicketInput['source'],
      dora_category_suggestion: (body.dora_category_suggestion as string | undefined) ?? (body.doraCategorySuggestion as string | undefined),
      dora_priority_suggestion: (body.dora_priority_suggestion as string | undefined) ?? (body.doraPrioritySuggestion as string | undefined),
      dora_sentiment: (body.dora_sentiment as string | undefined) ?? (body.doraSentiment as string | undefined),
    });

    res.status(201).json(ticket);
  } catch (err) {
    console.error('[support/tickets POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create ticket' });
  }
});

router.get('/my', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    const filters = buildFilters(req);
    filters.assigneeId = ctx.userId;
    const result = await support.tickets.listTickets(
      ctx,
      filters,
      parseSort(req.query.sortBy, req.query.sortDir, {
        ticketNumber: 'ticket_number',
        slaDue: 'sla_due',
      }),
      parsePositiveInt(req.query.page, 1),
      parsePositiveInt(req.query.pageSize, 50),
    );
    res.json(result);
  } catch (err) {
    console.error('[support/tickets/my GET]', err);
    res.status(500).json({ error: 'Failed to list my tickets' });
  }
});

router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const result = await support.tickets.listTickets(
      buildCtx(req),
      buildFilters(req),
      parseSort(req.query.sortBy, req.query.sortDir, {
        ticketNumber: 'ticket_number',
        slaDue: 'sla_due',
      }),
      parsePositiveInt(req.query.page, 1),
      parsePositiveInt(req.query.pageSize, 50),
    );
    res.json(result);
  } catch (err) {
    console.error('[support/tickets GET]', err);
    res.status(500).json({ error: 'Failed to list tickets' });
  }
});

router.post('/bulk-assign', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { ticketIds, assigneeId } = req.body as { ticketIds?: string[]; assigneeId?: string };
    if (!Array.isArray(ticketIds) || ticketIds.length === 0 || !assigneeId) {
      res.status(400).json({ error: 'ticketIds and assigneeId are required' });
      return;
    }
    await support.tickets.bulkAssign(buildCtx(req), ticketIds, assigneeId);
    res.json({ success: true });
  } catch (err) {
    console.error('[support/tickets/bulk-assign POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to bulk assign tickets' });
  }
});

router.post('/bulk-close', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { ticketIds } = req.body as { ticketIds?: string[] };
    if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
      res.status(400).json({ error: 'ticketIds are required' });
      return;
    }
    await support.tickets.bulkClose(buildCtx(req), ticketIds);
    res.json({ success: true });
  } catch (err) {
    console.error('[support/tickets/bulk-close POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to bulk close tickets' });
  }
});

router.get('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ticket = await support.tickets.getTicketById(buildCtx(req), req.params.id);
    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    ticket.sla_details = await support.sla.getTicketSLAStatus(ticket.id);
    res.json(ticket);
  } catch (err) {
    console.error('[support/tickets/:id GET]', err);
    res.status(500).json({ error: 'Failed to get ticket' });
  }
});

router.put('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ticket = await support.tickets.updateTicket(buildCtx(req), req.params.id, mapUpdateInput(req.body as Record<string, unknown>));
    res.json(ticket);
  } catch (err) {
    console.error('[support/tickets/:id PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update ticket' });
  }
});

router.put('/:id/assign', async (req: ReimbursementRequest, res: Response) => {
  try {
    const assigneeId = (req.body.assigneeId ?? req.body.assignee_id) as string | undefined;
    if (!assigneeId) {
      res.status(400).json({ error: 'assigneeId is required' });
      return;
    }
    const ticket = await support.tickets.assignTicket(buildCtx(req), req.params.id, assigneeId);
    res.json(ticket);
  } catch (err) {
    console.error('[support/tickets/:id/assign PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to assign ticket' });
  }
});

router.put('/:id/escalate', async (req: ReimbursementRequest, res: Response) => {
  try {
    const escalateTo = req.body.escalateTo as string | undefined;
    const reason = req.body.reason as string | undefined;
    if (!escalateTo || !reason) {
      res.status(400).json({ error: 'escalateTo and reason are required' });
      return;
    }
    const ticket = await support.tickets.escalateTicket(buildCtx(req), req.params.id, escalateTo, reason);
    res.json(ticket);
  } catch (err) {
    console.error('[support/tickets/:id/escalate PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to escalate ticket' });
  }
});

router.put('/:id/reopen', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ticket = await support.tickets.reopenTicket(buildCtx(req), req.params.id, req.body.reason as string | undefined);
    res.json(ticket);
  } catch (err) {
    console.error('[support/tickets/:id/reopen PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to reopen ticket' });
  }
});

router.post('/:id/messages', async (req: ReimbursementRequest, res: Response) => {
  try {
    if (!req.body.body) {
      res.status(400).json({ error: 'body is required' });
      return;
    }
    const message = await support.messages.addMessage(buildCtx(req), req.params.id, {
      body: req.body.body as string,
      body_html: req.body.body_html as string | undefined,
      attachments: req.body.attachments as unknown[] | undefined,
      author_email: req.body.author_email as string | undefined,
      author_name: req.body.author_name as string | undefined,
      is_external: Boolean(req.body.is_external),
    });
    res.status(201).json(message);
  } catch (err) {
    console.error('[support/tickets/:id/messages POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to add message' });
  }
});

router.post('/:id/internal-notes', async (req: ReimbursementRequest, res: Response) => {
  try {
    const body = req.body.body as string | undefined;
    if (!body) {
      res.status(400).json({ error: 'body is required' });
      return;
    }
    const note = await support.messages.addInternalNote(buildCtx(req), req.params.id, body);
    res.status(201).json(note);
  } catch (err) {
    console.error('[support/tickets/:id/internal-notes POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to add internal note' });
  }
});

export default router;
