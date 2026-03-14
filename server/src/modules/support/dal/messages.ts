import { getClient, query } from '../../../db/index.js';
import type { CallerContext } from '../../../dal/types.js';
import { buildSupportVisibilityClause, canViewInternalNotes, toNumber } from './shared.js';

export interface Message {
  id: string;
  ticket_id: string;
  author_id: string | null;
  author_email: string | null;
  author_name: string | null;
  body: string;
  body_html: string | null;
  is_internal_note: boolean;
  attachments: unknown[];
  created_at: string;
}

export interface CreateMessageInput {
  body: string;
  body_html?: string;
  attachments?: unknown[];
  author_id?: string | null;
  author_email?: string;
  author_name?: string;
  is_internal_note?: boolean;
  is_external?: boolean;
}

function mapMessage(row: Record<string, unknown>): Message {
  return {
    id: String(row.id),
    ticket_id: String(row.ticket_id),
    author_id: row.author_id ? String(row.author_id) : null,
    author_email: row.author_email ? String(row.author_email) : null,
    author_name: row.author_name ? String(row.author_name) : null,
    body: String(row.body ?? ''),
    body_html: row.body_html ? String(row.body_html) : null,
    is_internal_note: Boolean(row.is_internal_note),
    attachments: Array.isArray(row.attachments) ? (row.attachments as unknown[]) : [],
    created_at: String(row.created_at ?? ''),
  };
}

async function ensureTicketAccess(ctx: CallerContext, ticketId: string): Promise<boolean> {
  const conditions = ['t.id = $1'];
  const params: unknown[] = [ticketId];
  let idx = 2;
  if (ctx.organizationId) {
    conditions.push(`t.organization_id = $${idx++}`);
    params.push(ctx.organizationId);
  }
  const visibility = buildSupportVisibilityClause(ctx, 't', idx);
  if (visibility.clause !== '1=1') {
    conditions.push(visibility.clause);
    params.push(...visibility.params);
  }

  const result = await query(
    `SELECT t.id
     FROM support_tickets t
     WHERE ${conditions.join(' AND ')}
     LIMIT 1`,
    params,
  );
  return Boolean(result.rows[0]);
}

export async function getTicketMessages(
  ctx: CallerContext,
  ticketId: string,
  includeInternal: boolean = canViewInternalNotes(ctx),
): Promise<Message[]> {
  const allowed = await ensureTicketAccess(ctx, ticketId);
  if (!allowed) return [];

  const conditions = ['ticket_id = $1'];
  const params: unknown[] = [ticketId];
  if (!includeInternal) {
    conditions.push('is_internal_note = FALSE');
  }

  const result = await query(
    `SELECT id::text AS id, ticket_id::text AS ticket_id, author_id::text AS author_id, author_email, author_name,
            body, body_html, is_internal_note, COALESCE(attachments, '[]'::jsonb) AS attachments,
            created_at::text AS created_at
     FROM support_messages
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at ASC`,
    params,
  );

  return result.rows.map((row) => mapMessage(row as Record<string, unknown>));
}

export async function addMessage(
  ctx: CallerContext,
  ticketId: string,
  data: CreateMessageInput,
): Promise<Message> {
  const orgId = ctx.organizationId ?? '';
  if (!orgId) throw new Error('Organization context is required');

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const visibility = buildSupportVisibilityClause(ctx, 't', 3);
    const conditions = ['t.id = $1', 't.organization_id = $2'];
    const params: unknown[] = [ticketId, orgId];
    if (visibility.clause !== '1=1') {
      conditions.push(visibility.clause);
      params.push(...visibility.params);
    }

    const ticketResult = await client.query<{
      id: string;
      reporter_email: string;
      reporter_name: string | null;
      status: string;
      created_at: string;
      sla_first_response_due: string | null;
      sla_first_response_at: string | null;
    }>(
      `SELECT t.id::text AS id, t.reporter_email, t.reporter_name, t.status, t.created_at::text AS created_at,
              t.sla_first_response_due::text AS sla_first_response_due, t.sla_first_response_at::text AS sla_first_response_at
       FROM support_tickets t
       WHERE ${conditions.join(' AND ')}
       LIMIT 1`,
      params,
    );
    const ticket = ticketResult.rows[0];
    if (!ticket) throw new Error('Ticket not found');

    const authorId = data.is_external ? null : (data.author_id ?? ctx.userId);
    const isInternalNote = Boolean(data.is_internal_note);
    const authorEmail = data.author_email ?? (authorId ? null : ticket.reporter_email);
    const authorName = data.author_name ?? (authorId ? null : ticket.reporter_name);

    const insertResult = await client.query(
      `INSERT INTO support_messages (
        ticket_id, author_id, author_email, author_name, body, body_html, is_internal_note, attachments
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      RETURNING id::text AS id, ticket_id::text AS ticket_id, author_id::text AS author_id, author_email, author_name,
                body, body_html, is_internal_note, COALESCE(attachments, '[]'::jsonb) AS attachments,
                created_at::text AS created_at`,
      [
        ticketId,
        authorId,
        authorEmail,
        authorName,
        data.body,
        data.body_html ?? null,
        isInternalNote,
        JSON.stringify(data.attachments ?? []),
      ],
    );

    const now = new Date();
    const ticketUpdates: string[] = ['updated_at = NOW()'];
    const ticketUpdateParams: unknown[] = [];
    let idx = 1;

    if (!isInternalNote) {
      const isAgentResponse = Boolean(authorId);
      ticketUpdates.push(`status = $${idx++}`);
      ticketUpdateParams.push(isAgentResponse ? 'awaiting_customer' : 'awaiting_agent');

      if (isAgentResponse && !ticket.sla_first_response_at) {
        const firstResponseHours = (now.getTime() - new Date(ticket.created_at).getTime()) / 3600000;
        ticketUpdates.push(`sla_first_response_at = NOW()`);
        ticketUpdates.push(`first_response_time_hours = $${idx++}`);
        ticketUpdates.push(`sla_first_response_breached = $${idx++}`);
        ticketUpdateParams.push(
          Number(firstResponseHours.toFixed(2)),
          ticket.sla_first_response_due ? now > new Date(ticket.sla_first_response_due) : false,
        );
      }
    }

    ticketUpdateParams.push(ticketId);
    await client.query(
      `UPDATE support_tickets
       SET ${ticketUpdates.join(', ')}
       WHERE id = $${idx}`,
      ticketUpdateParams,
    );

    await client.query('COMMIT');

    return mapMessage(insertResult.rows[0] as Record<string, unknown>);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function addInternalNote(
  ctx: CallerContext,
  ticketId: string,
  body: string,
): Promise<Message> {
  return addMessage(ctx, ticketId, {
    body,
    is_internal_note: true,
    author_id: ctx.userId,
  });
}
