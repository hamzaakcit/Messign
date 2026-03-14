import type { PoolClient, QueryResultRow } from 'pg';
import { withTenantQuery } from '../../../middleware/tenantContext.js';
import { eventBus } from '../../../events/index.js';
import { paginationClause } from '../../../dal/helpers.js';
import type { CallerContext, DateRange, PaginatedResult, SortOptions } from '../../../dal/types.js';
import {
  buildSupportVisibilityClause,
  computeSLAStatus,
  toNumber,
  type SLAStatusDetail,
  type SupportSLAState,
} from './shared.js';

/** Run query within tenant context. RLS enforces tenant isolation. */
async function runInTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTenantQuery(tenantId, fn);
}

export interface TicketMessage {
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

export interface TicketHistoryEntry {
  id: string;
  ticket_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  changed_by_name?: string | null;
  changed_at: string;
}

export interface TicketCSATRating {
  id: string;
  ticket_id: string;
  rating: number;
  comment: string | null;
  submitted_at: string;
}

export interface Ticket {
  id: string;
  organization_id: string;
  ticket_number: string;
  subject: string;
  description: string | null;
  status: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  category_id: string | null;
  category_name?: string | null;
  assignee_id: string | null;
  assignee_name?: string | null;
  reporter_email: string;
  reporter_name: string | null;
  crm_contact_id: string | null;
  crm_company_id: string | null;
  company_name?: string | null;
  sla_policy_id: string | null;
  sla_first_response_due: string | null;
  sla_resolution_due: string | null;
  sla_first_response_at: string | null;
  sla_first_response_breached: boolean;
  sla_resolution_breached: boolean;
  first_response_time_hours: number | null;
  resolution_time_hours: number | null;
  tags: string[];
  source: 'web' | 'email' | 'chat' | 'phone' | 'api';
  dora_category_suggestion: string | null;
  dora_priority_suggestion: string | null;
  dora_sentiment: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  sla_status?: SupportSLAState;
  sla_details?: {
    firstResponse: SLAStatusDetail;
    resolution: SLAStatusDetail;
  };
  messages?: TicketMessage[];
  history?: TicketHistoryEntry[];
  csat_rating?: TicketCSATRating | null;
}

export interface TicketFilters {
  status?: string;
  priority?: string;
  assigneeId?: string;
  categoryId?: string;
  crmCompanyId?: string;
  slaStatus?: SupportSLAState;
  dateRange?: DateRange;
  search?: string;
}

export interface CreateTicketInput {
  subject: string;
  description?: string;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  category_id?: string;
  assignee_id?: string;
  reporter_email: string;
  reporter_name?: string;
  crm_contact_id?: string;
  crm_company_id?: string;
  tags?: string[];
  source?: 'web' | 'email' | 'chat' | 'phone' | 'api';
  dora_category_suggestion?: string;
  dora_priority_suggestion?: string;
  dora_sentiment?: string;
}

export interface UpdateTicketInput {
  subject?: string;
  description?: string;
  status?: string;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  category_id?: string | null;
  assignee_id?: string | null;
  reporter_email?: string;
  reporter_name?: string | null;
  crm_contact_id?: string | null;
  crm_company_id?: string | null;
  tags?: string[];
  source?: 'web' | 'email' | 'chat' | 'phone' | 'api';
  dora_category_suggestion?: string | null;
  dora_priority_suggestion?: string | null;
  dora_sentiment?: string | null;
}

interface TicketRow extends QueryResultRow {
  id: string;
  organization_id: string;
  ticket_number: string;
  subject: string;
  description: string | null;
  status: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  category_id: string | null;
  category_name: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  reporter_email: string;
  reporter_name: string | null;
  crm_contact_id: string | null;
  crm_company_id: string | null;
  company_name: string | null;
  sla_policy_id: string | null;
  sla_first_response_due: string | null;
  sla_resolution_due: string | null;
  sla_first_response_at: string | null;
  sla_first_response_breached: boolean;
  sla_resolution_breached: boolean;
  first_response_time_hours: string | null;
  resolution_time_hours: string | null;
  tags: unknown;
  source: 'web' | 'email' | 'chat' | 'phone' | 'api';
  dora_category_suggestion: string | null;
  dora_priority_suggestion: string | null;
  dora_sentiment: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  sla_status: SupportSLAState;
}

interface SLAComputation {
  firstResponse: SLAStatusDetail;
  resolution: SLAStatusDetail;
}

interface SlaPolicyRow extends QueryResultRow {
  id: string;
  first_response_hours: string;
  resolution_hours: string;
}

interface CategoryRow extends QueryResultRow {
  id: string;
  name: string;
  default_priority: 'critical' | 'high' | 'medium' | 'low';
  auto_assign_to: string | null;
}

const BASE_TICKET_SELECT = `
  SELECT
    t.id::text AS id,
    t.organization_id::text AS organization_id,
    t.ticket_number::text AS ticket_number,
    t.subject,
    t.description,
    t.status,
    t.priority,
    t.category_id::text AS category_id,
    sc.name AS category_name,
    t.assignee_id::text AS assignee_id,
    ru.full_name AS assignee_name,
    t.reporter_email,
    t.reporter_name,
    t.crm_contact_id::text AS crm_contact_id,
    t.crm_company_id::text AS crm_company_id,
    co.name AS company_name,
    t.sla_policy_id::text AS sla_policy_id,
    t.sla_first_response_due::text AS sla_first_response_due,
    t.sla_resolution_due::text AS sla_resolution_due,
    t.sla_first_response_at::text AS sla_first_response_at,
    COALESCE(t.sla_first_response_breached, FALSE) AS sla_first_response_breached,
    COALESCE(t.sla_resolution_breached, FALSE) AS sla_resolution_breached,
    t.first_response_time_hours::text AS first_response_time_hours,
    t.resolution_time_hours::text AS resolution_time_hours,
    COALESCE(t.tags, '[]'::jsonb) AS tags,
    t.source,
    t.dora_category_suggestion,
    t.dora_priority_suggestion,
    t.dora_sentiment,
    t.resolved_at::text AS resolved_at,
    t.closed_at::text AS closed_at,
    t.created_at::text AS created_at,
    t.updated_at::text AS updated_at,
    CASE
      WHEN CASE WHEN t.sla_first_response_at IS NULL THEN t.sla_first_response_due ELSE t.sla_resolution_due END IS NULL THEN 'on_track'
      WHEN NOW() > CASE WHEN t.sla_first_response_at IS NULL THEN t.sla_first_response_due ELSE t.sla_resolution_due END THEN 'breached'
      WHEN EXTRACT(EPOCH FROM (NOW() - t.created_at)) / NULLIF(EXTRACT(EPOCH FROM ((CASE WHEN t.sla_first_response_at IS NULL THEN t.sla_first_response_due ELSE t.sla_resolution_due END) - t.created_at)), 0) >= 0.75 THEN 'at_risk'
      ELSE 'on_track'
    END AS sla_status
  FROM support_tickets t
  LEFT JOIN reimbursement_users ru ON ru.id = t.assignee_id
  LEFT JOIN support_categories sc ON sc.id = t.category_id
  LEFT JOIN crm_companies co ON co.id = t.crm_company_id
`;

function addHours(base: Date, hours: number): string {
  return new Date(base.getTime() + hours * 3600000).toISOString();
}

function stringifyChangeValue(value: unknown): string | null {
  if (value == null) return null;
  if (Array.isArray(value) || typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function mapMessageRow(row: Record<string, unknown>): TicketMessage {
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

function mapHistoryRow(row: Record<string, unknown>): TicketHistoryEntry {
  return {
    id: String(row.id),
    ticket_id: String(row.ticket_id),
    field_name: String(row.field_name ?? ''),
    old_value: row.old_value ? String(row.old_value) : null,
    new_value: row.new_value ? String(row.new_value) : null,
    changed_by: row.changed_by ? String(row.changed_by) : null,
    changed_by_name: row.changed_by_name ? String(row.changed_by_name) : null,
    changed_at: String(row.changed_at ?? ''),
  };
}

function mapCsaRow(row: Record<string, unknown>): TicketCSATRating {
  return {
    id: String(row.id),
    ticket_id: String(row.ticket_id),
    rating: toNumber(row.rating),
    comment: row.comment ? String(row.comment) : null,
    submitted_at: String(row.submitted_at ?? ''),
  };
}

function buildSlaDetails(ticket: Pick<
  Ticket,
  'created_at' | 'sla_first_response_due' | 'sla_first_response_at' | 'sla_first_response_breached' | 'sla_resolution_due' | 'resolved_at' | 'sla_resolution_breached'
>): SLAComputation {
  return {
    firstResponse: computeSLAStatus(
      ticket.created_at,
      ticket.sla_first_response_due,
      ticket.sla_first_response_at,
      ticket.sla_first_response_breached,
    ),
    resolution: computeSLAStatus(
      ticket.created_at,
      ticket.sla_resolution_due,
      ticket.resolved_at,
      ticket.sla_resolution_breached,
    ),
  };
}

function mapTicketRow(row: TicketRow): Ticket {
  const ticket: Ticket = {
    id: row.id,
    organization_id: row.organization_id,
    ticket_number: row.ticket_number,
    subject: row.subject,
    description: row.description,
    status: row.status,
    priority: row.priority,
    category_id: row.category_id,
    category_name: row.category_name,
    assignee_id: row.assignee_id,
    assignee_name: row.assignee_name,
    reporter_email: row.reporter_email,
    reporter_name: row.reporter_name,
    crm_contact_id: row.crm_contact_id,
    crm_company_id: row.crm_company_id,
    company_name: row.company_name,
    sla_policy_id: row.sla_policy_id,
    sla_first_response_due: row.sla_first_response_due,
    sla_resolution_due: row.sla_resolution_due,
    sla_first_response_at: row.sla_first_response_at,
    sla_first_response_breached: row.sla_first_response_breached,
    sla_resolution_breached: row.sla_resolution_breached,
    first_response_time_hours: row.first_response_time_hours == null ? null : toNumber(row.first_response_time_hours),
    resolution_time_hours: row.resolution_time_hours == null ? null : toNumber(row.resolution_time_hours),
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    source: row.source,
    dora_category_suggestion: row.dora_category_suggestion,
    dora_priority_suggestion: row.dora_priority_suggestion,
    dora_sentiment: row.dora_sentiment,
    resolved_at: row.resolved_at,
    closed_at: row.closed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    sla_status: row.sla_status,
  };
  ticket.sla_details = buildSlaDetails(ticket);
  return ticket;
}

async function resolveCategory(
  categoryId: string | null | undefined,
  client: PoolClient,
): Promise<CategoryRow | null> {
  if (!categoryId) return null;
  const result = await client.query<CategoryRow>(
    `SELECT id::text AS id, name, default_priority, auto_assign_to::text AS auto_assign_to
     FROM support_categories
     WHERE id = $1
     LIMIT 1`,
    [categoryId],
  );
  return result.rows[0] ?? null;
}

async function resolveSlaPolicy(priority: Ticket['priority'], client: PoolClient): Promise<SlaPolicyRow> {
  const result = await client.query<SlaPolicyRow>(
    `SELECT id::text AS id, first_response_hours::text AS first_response_hours, resolution_hours::text AS resolution_hours
     FROM support_sla_policies
     WHERE priority = $1 AND is_active = TRUE
     ORDER BY updated_at DESC, created_at DESC
     LIMIT 1`,
    [priority],
  );
  const policy = result.rows[0];
  if (!policy) throw new Error(`No active SLA policy found for priority "${priority}"`);
  return policy;
}

async function resolveCrmLinks(
  reporterEmail: string,
  client: PoolClient,
): Promise<{ crm_contact_id: string | null; crm_company_id: string | null }> {
  const result = await client.query<{ crm_contact_id: string | null; crm_company_id: string | null }>(
    `SELECT c.id::text AS crm_contact_id, c.company_id::text AS crm_company_id
     FROM crm_contacts c
     WHERE LOWER(c.email) = LOWER($1)
     ORDER BY c.created_at DESC
     LIMIT 1`,
    [reporterEmail],
  );
  return result.rows[0] ?? { crm_contact_id: null, crm_company_id: null };
}

async function fetchTicketRow(
  ctx: CallerContext | null,
  ticketId: string,
  client: PoolClient,
  options: { enforceVisibility?: boolean } = {},
): Promise<TicketRow | null> {
  const conditions = ['t.id = $1'];
  const params: unknown[] = [ticketId];
  let idx = 2;
  if (ctx && options.enforceVisibility !== false) {
    const visibility = buildSupportVisibilityClause(ctx, 't', idx);
    if (visibility.clause !== '1=1') {
      conditions.push(visibility.clause);
      params.push(...visibility.params);
    }
  }
  const result = await client.query<TicketRow>(
    `${BASE_TICKET_SELECT} WHERE ${conditions.join(' AND ')} LIMIT 1`,
    params,
  );
  return result.rows[0] ?? null;
}

async function loadTicketRelations(
  ticketId: string,
  client: PoolClient,
): Promise<Pick<Ticket, 'messages' | 'history' | 'csat_rating'>> {
  const [messagesResult, historyResult, csatResult] = await Promise.all([
    client.query(
      `SELECT id::text AS id, ticket_id::text AS ticket_id, author_id::text AS author_id, author_email, author_name,
              body, body_html, is_internal_note, COALESCE(attachments, '[]'::jsonb) AS attachments,
              created_at::text AS created_at
       FROM support_messages
       WHERE ticket_id = $1
       ORDER BY created_at ASC`,
      [ticketId],
    ),
    client.query(
      `SELECT h.id::text AS id, h.ticket_id::text AS ticket_id, h.field_name, h.old_value, h.new_value,
              h.changed_by::text AS changed_by, u.full_name AS changed_by_name, h.changed_at::text AS changed_at
       FROM support_ticket_history h
       LEFT JOIN reimbursement_users u ON u.id = h.changed_by
       WHERE h.ticket_id = $1
       ORDER BY h.changed_at ASC`,
      [ticketId],
    ),
    client.query(
      `SELECT id::text AS id, ticket_id::text AS ticket_id, rating, comment, submitted_at::text AS submitted_at
       FROM support_csat_ratings
       WHERE ticket_id = $1
       LIMIT 1`,
      [ticketId],
    ),
  ]);

  return {
    messages: messagesResult.rows.map((row) => mapMessageRow(row as Record<string, unknown>)),
    history: historyResult.rows.map((row) => mapHistoryRow(row as Record<string, unknown>)),
    csat_rating: csatResult.rows[0] ? mapCsaRow(csatResult.rows[0] as Record<string, unknown>) : null,
  };
}

async function hydrateTicket(ticketId: string, client: PoolClient): Promise<Ticket | null> {
  const row = await fetchTicketRow(null, ticketId, client, { enforceVisibility: false });
  if (!row) return null;
  const ticket = mapTicketRow(row);
  const relations = await loadTicketRelations(ticketId, client);
  return { ...ticket, ...relations };
}

async function insertHistoryEntries(
  client: PoolClient,
  ticketId: string,
  changedBy: string,
  entries: Array<{ field: string; oldValue: unknown; newValue: unknown }>,
): Promise<void> {
  for (const entry of entries) {
    await client.query(
      `INSERT INTO support_ticket_history (ticket_id, field_name, old_value, new_value, changed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [ticketId, entry.field, stringifyChangeValue(entry.oldValue), stringifyChangeValue(entry.newValue), changedBy],
    );
  }
}

async function performTicketUpdate(
  ctx: CallerContext,
  ticketId: string,
  data: UpdateTicketInput,
  options: { autoClose?: boolean } = {},
): Promise<Ticket> {
  const orgId = ctx.organizationId ?? '';
  if (!orgId) throw new Error('Organization context is required');

  return runInTenant(orgId, async (client) => {
    const existingRow = await fetchTicketRow(ctx, ticketId, client);
    if (!existingRow) throw new Error('Ticket not found');
    const existing = mapTicketRow(existingRow);

    const updates: string[] = [];
    const params: unknown[] = [];
    const historyEntries: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];
    let idx = 1;

    const nextValues: UpdateTicketInput = { ...data };
    if (data.category_id !== undefined && data.category_id !== null) {
      const category = await resolveCategory(data.category_id, client);
      if (!category) throw new Error('Support category not found');
      if (nextValues.priority === undefined) {
        nextValues.priority = category.default_priority;
      }
      if (nextValues.assignee_id === undefined && category.auto_assign_to) {
        nextValues.assignee_id = category.auto_assign_to;
      }
    }

    const writableFields: Array<[keyof UpdateTicketInput, string]> = [
      ['subject', 'subject'],
      ['description', 'description'],
      ['status', 'status'],
      ['priority', 'priority'],
      ['category_id', 'category_id'],
      ['assignee_id', 'assignee_id'],
      ['reporter_email', 'reporter_email'],
      ['reporter_name', 'reporter_name'],
      ['crm_contact_id', 'crm_contact_id'],
      ['crm_company_id', 'crm_company_id'],
      ['source', 'source'],
      ['dora_category_suggestion', 'dora_category_suggestion'],
      ['dora_priority_suggestion', 'dora_priority_suggestion'],
      ['dora_sentiment', 'dora_sentiment'],
    ];

    for (const [inputKey, column] of writableFields) {
      const value = nextValues[inputKey];
      if (value !== undefined) {
        updates.push(`${column} = $${idx++}`);
        params.push(value);
        const oldValue = existing[column as keyof Ticket];
        if (oldValue !== value) {
          historyEntries.push({ field: column, oldValue, newValue: value });
        }
      }
    }

    if (nextValues.tags !== undefined) {
      updates.push(`tags = $${idx++}::jsonb`);
      params.push(JSON.stringify(nextValues.tags));
      historyEntries.push({ field: 'tags', oldValue: existing.tags, newValue: nextValues.tags });
    }

    const nextStatus = nextValues.status ?? existing.status;
    const statusChanged = nextValues.status !== undefined && nextValues.status !== existing.status;
    const assigneeChanged = nextValues.assignee_id !== undefined && nextValues.assignee_id !== existing.assignee_id;

    if (statusChanged && nextStatus === 'resolved') {
      updates.push(`resolved_at = NOW()`);
      updates.push(`resolution_time_hours = ROUND((EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600.0)::numeric, 2)`);
      updates.push(`sla_resolution_breached = COALESCE(sla_resolution_due < NOW(), FALSE)`);
    } else if (statusChanged && nextStatus !== 'resolved') {
      updates.push(`updated_at = NOW()`);
    }

    if (statusChanged && nextStatus === 'closed') {
      updates.push(`closed_at = NOW()`);
    }

    if (statusChanged && nextStatus !== 'closed' && existing.closed_at) {
      updates.push(`closed_at = NULL`);
    }

    if (statusChanged && nextStatus !== 'resolved' && nextStatus !== 'closed' && existing.resolved_at) {
      updates.push(`resolved_at = NULL`);
      updates.push(`resolution_time_hours = NULL`);
      updates.push(`sla_resolution_breached = FALSE`);
    }

    if (!updates.includes('updated_at = NOW()')) {
      updates.push(`updated_at = NOW()`);
    }

    if (updates.length > 0) {
      params.push(ticketId);
      await client.query(
        `UPDATE support_tickets SET ${updates.join(', ')}
         WHERE id = $${idx++}
         RETURNING id`,
        params,
      );
    }

    if (historyEntries.length > 0) {
      await insertHistoryEntries(client, ticketId, ctx.userId, historyEntries);
    }

    const updated = await hydrateTicket(ticketId, client);
    if (!updated) throw new Error('Ticket not found after update');

    if (statusChanged) {
      eventBus.emit('support.ticket.status_changed', {
        ticketId,
        oldStatus: existing.status,
        newStatus: updated.status,
        changedBy: ctx.userId,
      });
    }

    if (assigneeChanged && updated.assignee_id) {
      eventBus.emit('support.ticket.assigned', {
        ticketId,
        assigneeId: updated.assignee_id,
        assignedBy: ctx.userId,
        previousAssigneeId: existing.assignee_id ?? undefined,
      });
    }

    if (statusChanged && updated.status === 'resolved') {
      eventBus.emit('support.ticket.resolved', {
        ticketId,
        resolvedBy: ctx.userId,
        resolutionTimeHours: updated.resolution_time_hours ?? 0,
        firstResponseTimeHours: updated.first_response_time_hours ?? 0,
        organizationId: updated.organization_id ?? undefined,
      });
    }

    if (statusChanged && updated.status === 'closed') {
      eventBus.emit('support.ticket.closed', {
        ticketId,
        closedBy: ctx.userId,
        autoClose: Boolean(options.autoClose),
      });
    }

    return updated;
  });
}

export async function listTickets(
  ctx: CallerContext,
  filters?: TicketFilters,
  sort?: SortOptions,
  page: number = 1,
  pageSize: number = 50,
): Promise<PaginatedResult<Ticket>> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for listTickets');

  return runInTenant(tenantId, async (client) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    const visibility = buildSupportVisibilityClause(ctx, 't', idx);
    if (visibility.clause !== '1=1') {
      conditions.push(visibility.clause);
      params.push(...visibility.params);
      idx += visibility.params.length;
    }

    if (filters?.status) {
      conditions.push(`t.status = $${idx++}`);
      params.push(filters.status);
    }
    if (filters?.priority) {
      conditions.push(`t.priority = $${idx++}`);
      params.push(filters.priority);
    }
    if (filters?.assigneeId) {
      conditions.push(`t.assignee_id = $${idx++}`);
      params.push(filters.assigneeId);
    }
    if (filters?.categoryId) {
      conditions.push(`t.category_id = $${idx++}`);
      params.push(filters.categoryId);
    }
    if (filters?.crmCompanyId) {
      conditions.push(`t.crm_company_id = $${idx++}`);
      params.push(filters.crmCompanyId);
    }
    if (filters?.dateRange?.from) {
      conditions.push(`t.created_at >= $${idx++}::timestamptz`);
      params.push(filters.dateRange.from);
    }
    if (filters?.dateRange?.to) {
      conditions.push(`t.created_at <= $${idx++}::timestamptz`);
      params.push(filters.dateRange.to);
    }
    if (filters?.search) {
      conditions.push(`(t.subject ILIKE $${idx} OR t.ticket_number::text ILIKE $${idx})`);
      params.push(`%${filters.search}%`);
      idx++;
    }
    if (filters?.slaStatus) {
      conditions.push(
        `CASE
           WHEN CASE WHEN t.sla_first_response_at IS NULL THEN t.sla_first_response_due ELSE t.sla_resolution_due END IS NULL THEN 'on_track'
           WHEN NOW() > CASE WHEN t.sla_first_response_at IS NULL THEN t.sla_first_response_due ELSE t.sla_resolution_due END THEN 'breached'
           WHEN EXTRACT(EPOCH FROM (NOW() - t.created_at)) / NULLIF(EXTRACT(EPOCH FROM ((CASE WHEN t.sla_first_response_at IS NULL THEN t.sla_first_response_due ELSE t.sla_resolution_due END) - t.created_at)), 0) >= 0.75 THEN 'at_risk'
           ELSE 'on_track'
         END = $${idx++}`,
      );
      params.push(filters.slaStatus);
    }

    const whereSQL = conditions.length > 0 ? conditions.join(' AND ') : '1=1';
    const sortColumns: Record<string, string> = {
      created: 't.created_at',
      updated: 't.updated_at',
      priority: 't.priority',
      status: 't.status',
      ticket_number: 't.ticket_number',
      subject: 't.subject',
      sla_due: `CASE WHEN t.sla_first_response_at IS NULL THEN t.sla_first_response_due ELSE t.sla_resolution_due END`,
    };
    const orderBy = sortColumns[sort?.field ?? 'created'] ?? 't.created_at';
    const direction = sort?.direction === 'asc' ? 'ASC' : 'DESC';

    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM support_tickets t
       WHERE ${whereSQL}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);
    const pagination = paginationClause(page, pageSize, idx);

    const result = await client.query<TicketRow>(
      `${BASE_TICKET_SELECT}
       WHERE ${whereSQL}
       ORDER BY ${orderBy} ${direction}
       ${pagination.clause}`,
      [...params, ...pagination.params],
    );

    return {
      data: result.rows.map(mapTicketRow),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  });
}

export async function getTicketById(ctx: CallerContext, ticketId: string): Promise<Ticket | null> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getTicketById');

  return runInTenant(tenantId, async (client) => {
    const row = await fetchTicketRow(ctx, ticketId, client);
    if (!row) return null;
    const ticket = mapTicketRow(row);
    const relations = await loadTicketRelations(ticketId, client);
    return { ...ticket, ...relations };
  });
}

export async function createTicket(ctx: CallerContext, data: CreateTicketInput): Promise<Ticket> {
  const orgId = ctx.organizationId ?? '';
  if (!orgId) throw new Error('Organization context is required');

  return runInTenant(orgId, async (client) => {
    const category = await resolveCategory(data.category_id, client);
    const priority = data.priority ?? category?.default_priority ?? 'medium';
    const policy = await resolveSlaPolicy(priority, client);
    const linkedCrm = await resolveCrmLinks(data.reporter_email, client);
    const createdAt = new Date();
    const firstResponseDue = addHours(createdAt, toNumber(policy.first_response_hours));
    const resolutionDue = addHours(createdAt, toNumber(policy.resolution_hours));

    const result = await client.query<{ id: string }>(
      `INSERT INTO support_tickets (
        organization_id,
        subject,
        description,
        priority,
        category_id,
        assignee_id,
        reporter_email,
        reporter_name,
        crm_contact_id,
        crm_company_id,
        sla_policy_id,
        sla_first_response_due,
        sla_resolution_due,
        tags,
        source,
        dora_category_suggestion,
        dora_priority_suggestion,
        dora_sentiment
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12::timestamptz, $13::timestamptz, $14::jsonb, $15, $16, $17, $18
      )
      RETURNING id::text AS id`,
      [
        orgId,
        data.subject,
        data.description ?? null,
        priority,
        data.category_id ?? null,
        data.assignee_id ?? category?.auto_assign_to ?? null,
        data.reporter_email,
        data.reporter_name ?? null,
        data.crm_contact_id ?? linkedCrm.crm_contact_id,
        data.crm_company_id ?? linkedCrm.crm_company_id,
        policy.id,
        firstResponseDue,
        resolutionDue,
        JSON.stringify(data.tags ?? []),
        data.source ?? 'web',
        data.dora_category_suggestion ?? null,
        data.dora_priority_suggestion ?? null,
        data.dora_sentiment ?? null,
      ],
    );

    const ticketId = result.rows[0]?.id;
    if (!ticketId) throw new Error('Failed to create ticket');

    const ticket = await hydrateTicket(ticketId, client);
    if (!ticket) throw new Error('Ticket not found after creation');

    eventBus.emit('support.ticket.created', {
      ticketId: ticket.id,
      subject: ticket.subject,
      reporterEmail: ticket.reporter_email,
      priority: ticket.priority,
      category: category?.name,
      crmCompanyId: ticket.crm_company_id ?? undefined,
      crmContactId: ticket.crm_contact_id ?? undefined,
      assigneeId: ticket.assignee_id ?? undefined,
      organizationId: ticket.organization_id ?? undefined,
      description: ticket.description ?? undefined,
    });

    return ticket;
  });
}

export async function updateTicket(
  ctx: CallerContext,
  ticketId: string,
  data: UpdateTicketInput,
): Promise<Ticket> {
  return performTicketUpdate(ctx, ticketId, data);
}

export async function assignTicket(
  ctx: CallerContext,
  ticketId: string,
  assigneeId: string,
): Promise<Ticket> {
  return performTicketUpdate(ctx, ticketId, { assignee_id: assigneeId });
}

export async function escalateTicket(
  ctx: CallerContext,
  ticketId: string,
  escalateTo: string,
  reason: string,
): Promise<Ticket> {
  const current = await getTicketById(ctx, ticketId);
  if (!current) throw new Error('Ticket not found');

  const priorityOrder: Ticket['priority'][] = ['low', 'medium', 'high', 'critical'];
  const currentIndex = priorityOrder.indexOf(current.priority);
  const nextPriority = priorityOrder[Math.min(currentIndex + 1, priorityOrder.length - 1)];
  const updated = await performTicketUpdate(ctx, ticketId, {
    assignee_id: escalateTo,
    priority: nextPriority,
  });

  const breached = updated.sla_details?.firstResponse.status === 'breached'
    || updated.sla_details?.resolution.status === 'breached';

  eventBus.emit('support.ticket.escalated', {
    ticketId,
    escalatedTo: escalateTo,
    reason,
    slaBreached: Boolean(breached),
  });

  return updated;
}

export async function reopenTicket(
  ctx: CallerContext,
  ticketId: string,
  reason?: string,
): Promise<Ticket> {
  const updated = await performTicketUpdate(ctx, ticketId, { status: 'open' });
  eventBus.emit('support.ticket.reopened', {
    ticketId,
    reopenedBy: ctx.userId,
    reason,
  });
  return updated;
}

export async function bulkAssign(
  ctx: CallerContext,
  ticketIds: string[],
  assigneeId: string,
): Promise<void> {
  for (const ticketId of ticketIds) {
    await assignTicket(ctx, ticketId, assigneeId);
  }
}

export async function bulkClose(ctx: CallerContext, ticketIds: string[]): Promise<void> {
  for (const ticketId of ticketIds) {
    await performTicketUpdate(ctx, ticketId, { status: 'closed' }, { autoClose: true });
  }
}
