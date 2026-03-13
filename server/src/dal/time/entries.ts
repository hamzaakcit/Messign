import type { PoolClient } from 'pg';
import { withTenantQuery } from '../../middleware/tenantContext.js';
import { eventBus } from '../../events/index.js';
import { paginationClause } from '../helpers.js';
import type { CallerContext, DateRange, PaginatedResult, SortOptions } from '../types.js';

async function runInTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTenantQuery(tenantId, fn);
}

export interface TimeEntry {
  id: string;
  organization_id: string;
  user_id: string;
  user_name?: string | null;
  project_id: string | null;
  project_name?: string | null;
  task_id: string | null;
  task_title?: string | null;
  category_id: string | null;
  category_name?: string | null;
  date: string;
  hours: number;
  minutes: number;
  description: string | null;
  is_billable: boolean;
  billing_rate: number | null;
  billable_amount: number;
  client_id: string | null;
  client_name?: string | null;
  source: 'manual' | 'timer' | 'import' | 'suggestion';
  timer_id: string | null;
  timesheet_id: string | null;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface TimeEntryFilters {
  userId?: string;
  projectId?: string;
  taskId?: string;
  categoryId?: string;
  dateRange?: DateRange;
  billableOnly?: boolean;
  status?: 'draft' | 'submitted' | 'approved' | 'rejected';
  search?: string;
}

export interface CreateEntryInput {
  userId?: string;
  projectId?: string;
  taskId?: string;
  categoryId?: string;
  date: string;
  hours: number;
  description?: string;
  isBillable?: boolean;
  billingRate?: number;
  clientId?: string;
  source?: 'manual' | 'timer' | 'import' | 'suggestion';
  timerId?: string;
}

export interface UpdateEntryInput {
  projectId?: string | null;
  taskId?: string | null;
  categoryId?: string | null;
  date?: string;
  hours?: number;
  description?: string | null;
  isBillable?: boolean;
  billingRate?: number | null;
  clientId?: string | null;
  status?: 'draft' | 'submitted' | 'approved' | 'rejected';
}

export interface WeeklyGridRow {
  project: { id: string | null; name: string };
  task: { id: string | null; title: string };
  entries: { mon: number; tue: number; wed: number; thu: number; fri: number; sat: number; sun: number };
  total: number;
  billable: boolean;
}

export interface WeeklyGrid {
  rows: WeeklyGridRow[];
  totalByDay: { mon: number; tue: number; wed: number; thu: number; fri: number; sat: number; sun: number };
  grandTotal: number;
}

interface RateLookup {
  rate: number | null;
}

function n(value: unknown): number {
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapEntry(row: Record<string, unknown>): TimeEntry {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    user_id: String(row.user_id),
    user_name: row.user_name ? String(row.user_name) : null,
    project_id: row.project_id ? String(row.project_id) : null,
    project_name: row.project_name ? String(row.project_name) : null,
    task_id: row.task_id ? String(row.task_id) : null,
    task_title: row.task_title ? String(row.task_title) : null,
    category_id: row.category_id ? String(row.category_id) : null,
    category_name: row.category_name ? String(row.category_name) : null,
    date: String(row.date),
    hours: n(row.hours),
    minutes: n(row.minutes),
    description: row.description ? String(row.description) : null,
    is_billable: Boolean(row.is_billable),
    billing_rate: row.billing_rate == null ? null : n(row.billing_rate),
    billable_amount: n(row.billable_amount),
    client_id: row.client_id ? String(row.client_id) : null,
    client_name: row.client_name ? String(row.client_name) : null,
    source: String(row.source) as TimeEntry['source'],
    timer_id: row.timer_id ? String(row.timer_id) : null,
    timesheet_id: row.timesheet_id ? String(row.timesheet_id) : null,
    status: String(row.status) as TimeEntry['status'],
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function visibilityClause(ctx: CallerContext, alias: string, indexStart: number): { clause: string; params: unknown[] } {
  const role = String(ctx.role);
  if (role === 'finance_admin' || role === 'system_admin' || role === 'admin' || role === 'finance') {
    return { clause: '1=1', params: [] };
  }
  if (role === 'manager' || role === 'dept_head') {
    return {
      clause: `(${alias}.user_id = $${indexStart}
        OR ${alias}.user_id IN (
          SELECT teammate.id
          FROM reimbursement_users me
          JOIN performance_team_members my_membership
            ON my_membership.employee_id = me.auth_user_id
           AND my_membership.is_active = TRUE
          JOIN performance_team_members teammate_membership
            ON teammate_membership.team_id = my_membership.team_id
           AND teammate_membership.is_active = TRUE
          JOIN reimbursement_users teammate
            ON teammate.auth_user_id = teammate_membership.employee_id
           AND teammate.organization_id = ${alias}.organization_id
          WHERE me.id = $${indexStart}
        ))`,
      params: [ctx.userId],
    };
  }
  return { clause: `${alias}.user_id = $${indexStart}`, params: [ctx.userId] };
}

async function resolveBillingRate(
  client: PoolClient,
  userId: string,
  projectId?: string,
  categoryId?: string,
  explicitRate?: number,
): Promise<number | null> {
  if (explicitRate != null) return explicitRate;
  if (projectId) {
    const rate = await client.query<RateLookup>(
      `SELECT rate::float AS rate
       FROM time_billing_rates
       WHERE user_id = $1
         AND project_id = $2
         AND is_active = TRUE
         AND effective_from <= CURRENT_DATE
         AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
       ORDER BY effective_from DESC
       LIMIT 1`,
      [userId, projectId],
    );
    if (rate.rows[0]?.rate != null) return n(rate.rows[0].rate);
  }
  if (categoryId) {
    const categoryRate = await client.query<RateLookup>(
      `SELECT hourly_rate::float AS rate
       FROM time_categories
       WHERE id = $1`,
      [categoryId],
    );
    if (categoryRate.rows[0]?.rate != null) return n(categoryRate.rows[0].rate);
  }
  return null;
}

const ENTRY_SELECT = `
  SELECT
    te.id::text AS id,
    te.organization_id::text AS organization_id,
    te.user_id::text AS user_id,
    ru.full_name AS user_name,
    te.project_id,
    p.name AS project_name,
    te.task_id,
    t.title AS task_title,
    te.category_id::text AS category_id,
    tc.name AS category_name,
    te.date::text AS date,
    te.hours::float AS hours,
    te.minutes,
    te.description,
    te.is_billable,
    te.billing_rate::float AS billing_rate,
    te.billable_amount::float AS billable_amount,
    te.client_id::text AS client_id,
    cc.name AS client_name,
    te.source,
    te.timer_id::text AS timer_id,
    te.timesheet_id::text AS timesheet_id,
    te.status,
    te.created_at::text AS created_at,
    te.updated_at::text AS updated_at
  FROM time_entries te
  LEFT JOIN reimbursement_users ru ON ru.id = te.user_id
  LEFT JOIN projects p ON p.id = te.project_id
  LEFT JOIN tasks t ON t.id = te.task_id
  LEFT JOIN time_categories tc ON tc.id = te.category_id
  LEFT JOIN crm_companies cc ON cc.id = te.client_id
`;

export async function listEntries(
  ctx: CallerContext,
  filters: TimeEntryFilters = {},
  sort: SortOptions = { field: 'te.date', direction: 'desc' },
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResult<TimeEntry>> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for listEntries');

  const where: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  const visibility = visibilityClause(ctx, 'te', idx);
  where.push(visibility.clause);
  params.push(...visibility.params);
  idx += visibility.params.length;

  if (filters.userId) {
    where.push(`te.user_id = $${idx++}`);
    params.push(filters.userId);
  }
  if (filters.projectId) {
    where.push(`te.project_id = $${idx++}`);
    params.push(filters.projectId);
  }
  if (filters.taskId) {
    where.push(`te.task_id = $${idx++}`);
    params.push(filters.taskId);
  }
  if (filters.categoryId) {
    where.push(`te.category_id = $${idx++}`);
    params.push(filters.categoryId);
  }
  if (filters.billableOnly) {
    where.push(`te.is_billable = TRUE`);
  }
  if (filters.status) {
    where.push(`te.status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters.dateRange?.from) {
    where.push(`te.date >= $${idx++}::date`);
    params.push(filters.dateRange.from);
  }
  if (filters.dateRange?.to) {
    where.push(`te.date <= $${idx++}::date`);
    params.push(filters.dateRange.to);
  }
  if (filters.search) {
    where.push(`(COALESCE(te.description, '') ILIKE $${idx} OR COALESCE(t.title, '') ILIKE $${idx} OR COALESCE(p.name, '') ILIKE $${idx})`);
    params.push(`%${filters.search}%`);
    idx += 1;
  }

  const whereSql = where.length > 0 ? where.join(' AND ') : '1=1';
  const allowedSortFields = new Set(['te.date', 'te.hours', 'te.created_at', 'te.updated_at', 'te.status', 'te.project_id']);
  const sortField = allowedSortFields.has(sort.field) ? sort.field : 'te.date';
  const sortDir = sort.direction === 'asc' ? 'ASC' : 'DESC';

  return runInTenant(tenantId, async (client) => {
    const countResult = await client.query<{ total: string }>(`SELECT COUNT(*)::int AS total FROM time_entries te LEFT JOIN tasks t ON t.id = te.task_id LEFT JOIN projects p ON p.id = te.project_id WHERE ${whereSql}`, params);
    const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

    const pagination = paginationClause(page, pageSize, idx);
    const rows = await client.query<Record<string, unknown>>(
      `${ENTRY_SELECT}
       WHERE ${whereSql}
       ORDER BY ${sortField} ${sortDir}
       ${pagination.clause}`,
      [...params, ...pagination.params],
    );

    return {
      data: rows.rows.map(mapEntry),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  });
}

export async function getEntryById(ctx: CallerContext, entryId: string): Promise<TimeEntry | null> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getEntryById');

  const params: unknown[] = [entryId];
  const where: string[] = ['te.id = $1::uuid'];
  let idx = 2;

  const visibility = visibilityClause(ctx, 'te', idx);
  where.push(visibility.clause);
  params.push(...visibility.params);

  return runInTenant(tenantId, async (client) => {
    const result = await client.query<Record<string, unknown>>(
      `${ENTRY_SELECT}
       WHERE ${where.join(' AND ')}
       LIMIT 1`,
      params,
    );
    return result.rows[0] ? mapEntry(result.rows[0]) : null;
  });
}

export async function createEntry(ctx: CallerContext, data: CreateEntryInput): Promise<TimeEntry> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('organizationId is required');

  const userId = data.userId ?? ctx.userId;
  const isBillable = Boolean(data.isBillable);

  return runInTenant(tenantId, async (client) => {
    const billingRate = await resolveBillingRate(client, userId, data.projectId, data.categoryId, data.billingRate);

    const inserted = await client.query<Record<string, unknown>>(
      `INSERT INTO time_entries (
        organization_id, user_id, project_id, task_id, category_id, date, hours, description,
        is_billable, billing_rate, client_id, source, timer_id, status
      )
      VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10, $11, $12, $13, 'draft')
      RETURNING id::text AS id`,
      [
        tenantId,
        userId,
        data.projectId ?? null,
        data.taskId ?? null,
        data.categoryId ?? null,
        data.date,
        data.hours,
        data.description ?? null,
        isBillable,
        isBillable ? billingRate : null,
        data.clientId ?? null,
        data.source ?? 'manual',
        data.timerId ?? null,
      ],
    );

    const entryId = String(inserted.rows[0].id);
    const result = await client.query<Record<string, unknown>>(
      `${ENTRY_SELECT}
       WHERE te.id = $1::uuid
       LIMIT 1`,
      [entryId],
    );
    const entry = result.rows[0] ? mapEntry(result.rows[0]) : null;
    if (!entry) throw new Error('Failed to load created time entry');

    eventBus.emit('time.entry.created', {
      entryId: entry.id,
      userId: entry.user_id,
      projectId: entry.project_id ?? undefined,
      taskId: entry.task_id ?? undefined,
      hours: entry.hours,
      billable: entry.is_billable,
      date: entry.date,
    });
    return entry;
  });
}

export async function updateEntry(ctx: CallerContext, entryId: string, data: UpdateEntryInput): Promise<TimeEntry> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for updateEntry');

  const existing = await getEntryById(ctx, entryId);
  if (!existing) throw new Error('Time entry not found');
  if (existing.user_id !== ctx.userId && ctx.role !== 'system_admin' && ctx.role !== 'finance_admin') {
    throw new Error('You can only edit your own entries');
  }
  if (existing.status !== 'draft') {
    throw new Error('Only draft entries can be edited');
  }

  const isBillable = data.isBillable ?? existing.is_billable;

  return runInTenant(tenantId, async (client) => {
    const billingRate = await resolveBillingRate(
      client,
      existing.user_id,
      data.projectId ?? existing.project_id ?? undefined,
      data.categoryId ?? existing.category_id ?? undefined,
      data.billingRate ?? existing.billing_rate ?? undefined,
    );

    await client.query(
      `UPDATE time_entries
       SET project_id = COALESCE($2, project_id),
           task_id = COALESCE($3, task_id),
           category_id = COALESCE($4::uuid, category_id),
           date = COALESCE($5::date, date),
           hours = COALESCE($6, hours),
           description = COALESCE($7, description),
           is_billable = $8,
           billing_rate = $9,
           client_id = COALESCE($10::uuid, client_id),
           status = COALESCE($11, status),
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [
        entryId,
        data.projectId ?? null,
        data.taskId ?? null,
        data.categoryId ?? null,
        data.date ?? null,
        data.hours ?? null,
        data.description ?? null,
        isBillable,
        isBillable ? billingRate : null,
        data.clientId ?? null,
        data.status ?? null,
      ],
    );

    const result = await client.query<Record<string, unknown>>(
      `${ENTRY_SELECT}
       WHERE te.id = $1::uuid
       LIMIT 1`,
      [entryId],
    );
    const updated = result.rows[0] ? mapEntry(result.rows[0]) : null;
    if (!updated) throw new Error('Time entry not found after update');

    eventBus.emit('time.entry.updated', {
      entryId: updated.id,
      userId: updated.user_id,
      oldHours: existing.hours,
      newHours: updated.hours,
    });
    return updated;
  });
}

export async function deleteEntry(ctx: CallerContext, entryId: string): Promise<void> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for deleteEntry');

  const existing = await getEntryById(ctx, entryId);
  if (!existing) throw new Error('Time entry not found');
  if (existing.user_id !== ctx.userId && ctx.role !== 'system_admin' && ctx.role !== 'finance_admin') {
    throw new Error('You can only delete your own entries');
  }
  if (existing.status !== 'draft') {
    throw new Error('Only draft entries can be deleted');
  }
  await runInTenant(tenantId, async (client) => {
    await client.query('DELETE FROM time_entries WHERE id = $1::uuid', [entryId]);
  });
  eventBus.emit('time.entry.deleted', {
    entryId,
    userId: existing.user_id,
    hours: existing.hours,
  });
}

export async function getEntriesForTimesheet(
  ctx: CallerContext,
  userId: string,
  weekStartDate: string,
): Promise<TimeEntry[]> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getEntriesForTimesheet');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query<Record<string, unknown>>(
      `${ENTRY_SELECT}
       WHERE te.user_id = $1::uuid
         AND te.date >= $2::date
         AND te.date < ($2::date + INTERVAL '7 days')
       ORDER BY te.date ASC, te.created_at ASC`,
      [userId, weekStartDate],
    );
    return result.rows.map(mapEntry);
  });
}

export async function getWeeklyGrid(
  ctx: CallerContext,
  userId: string,
  weekStartDate: string,
): Promise<WeeklyGrid> {
  const entries = await getEntriesForTimesheet(ctx, userId, weekStartDate);
  const byKey = new Map<string, WeeklyGridRow>();
  const totalByDay: WeeklyGrid['totalByDay'] = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };

  for (const entry of entries) {
    const key = `${entry.project_id ?? 'none'}:${entry.task_id ?? 'none'}:${entry.is_billable ? 'billable' : 'nonbillable'}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        project: { id: entry.project_id, name: entry.project_name ?? 'No Project' },
        task: { id: entry.task_id, title: entry.task_title ?? 'No Task' },
        entries: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 },
        total: 0,
        billable: entry.is_billable,
      });
    }

    const date = new Date(`${entry.date}T00:00:00Z`);
    const day = date.getUTCDay();
    const dayKey = (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][day] ?? 'mon') as keyof WeeklyGrid['totalByDay'];
    const row = byKey.get(key)!;
    row.entries[dayKey] += entry.hours;
    row.total += entry.hours;
    totalByDay[dayKey] += entry.hours;
  }

  const rows = Array.from(byKey.values()).map((row) => ({
    ...row,
    entries: {
      mon: Number(row.entries.mon.toFixed(2)),
      tue: Number(row.entries.tue.toFixed(2)),
      wed: Number(row.entries.wed.toFixed(2)),
      thu: Number(row.entries.thu.toFixed(2)),
      fri: Number(row.entries.fri.toFixed(2)),
      sat: Number(row.entries.sat.toFixed(2)),
      sun: Number(row.entries.sun.toFixed(2)),
    },
    total: Number(row.total.toFixed(2)),
  }));

  const grandTotal = Number(
    (totalByDay.mon + totalByDay.tue + totalByDay.wed + totalByDay.thu + totalByDay.fri + totalByDay.sat + totalByDay.sun).toFixed(2),
  );

  return {
    rows,
    totalByDay: {
      mon: Number(totalByDay.mon.toFixed(2)),
      tue: Number(totalByDay.tue.toFixed(2)),
      wed: Number(totalByDay.wed.toFixed(2)),
      thu: Number(totalByDay.thu.toFixed(2)),
      fri: Number(totalByDay.fri.toFixed(2)),
      sat: Number(totalByDay.sat.toFixed(2)),
      sun: Number(totalByDay.sun.toFixed(2)),
    },
    grandTotal,
  };
}
