import { query } from '../../db/index.js';
import { eventBus } from '../../events/index.js';
import { paginationClause } from '../helpers.js';
import type { CallerContext, DateRange, PaginatedResult } from '../types.js';
import { getEntriesForTimesheet, type TimeEntry } from './entries.js';

export interface Timesheet {
  id: string;
  organization_id: string;
  user_id: string;
  user_name?: string | null;
  week_start_date: string;
  week_end_date: string;
  total_hours: number;
  billable_hours: number;
  non_billable_hours: number;
  billable_amount: number;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  entries?: TimeEntry[];
}

export interface TimesheetFilters {
  userId?: string;
  status?: Timesheet['status'];
  weekStartDate?: string;
  dateRange?: DateRange;
}

function num(value: unknown): number {
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapTimesheet(row: Record<string, unknown>): Timesheet {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    user_id: String(row.user_id),
    user_name: row.user_name ? String(row.user_name) : null,
    week_start_date: String(row.week_start_date),
    week_end_date: String(row.week_end_date),
    total_hours: num(row.total_hours),
    billable_hours: num(row.billable_hours),
    non_billable_hours: num(row.non_billable_hours),
    billable_amount: num(row.billable_amount),
    status: String(row.status) as Timesheet['status'],
    submitted_at: row.submitted_at ? String(row.submitted_at) : null,
    approved_at: row.approved_at ? String(row.approved_at) : null,
    approved_by: row.approved_by ? String(row.approved_by) : null,
    rejected_at: row.rejected_at ? String(row.rejected_at) : null,
    rejected_by: row.rejected_by ? String(row.rejected_by) : null,
    rejection_reason: row.rejection_reason ? String(row.rejection_reason) : null,
    notes: row.notes ? String(row.notes) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function timesheetVisibilityClause(ctx: CallerContext, alias: string, indexStart: number): { clause: string; params: unknown[] } {
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

function weekEndFromStart(weekStartDate: string): string {
  const start = new Date(`${weekStartDate}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return end.toISOString().slice(0, 10);
}

async function recomputeTotals(timesheetId: string): Promise<void> {
  await query(
    `UPDATE time_timesheets ts
     SET total_hours = COALESCE(agg.total_hours, 0),
         billable_hours = COALESCE(agg.billable_hours, 0),
         non_billable_hours = COALESCE(agg.non_billable_hours, 0),
         billable_amount = COALESCE(agg.billable_amount, 0),
         updated_at = NOW()
     FROM (
       SELECT
         te.timesheet_id,
         SUM(te.hours)::numeric AS total_hours,
         SUM(te.hours) FILTER (WHERE te.is_billable)::numeric AS billable_hours,
         SUM(te.hours) FILTER (WHERE NOT te.is_billable)::numeric AS non_billable_hours,
         SUM(te.billable_amount)::numeric AS billable_amount
       FROM time_entries te
       WHERE te.timesheet_id = $1::uuid
       GROUP BY te.timesheet_id
     ) agg
     WHERE ts.id = $1::uuid
       AND ts.id = agg.timesheet_id`,
    [timesheetId],
  );

  await query(
    `UPDATE time_timesheets
     SET total_hours = 0,
         billable_hours = 0,
         non_billable_hours = 0,
         billable_amount = 0,
         updated_at = NOW()
     WHERE id = $1::uuid
       AND NOT EXISTS (SELECT 1 FROM time_entries te WHERE te.timesheet_id = $1::uuid)`,
    [timesheetId],
  );
}

export async function listTimesheets(
  ctx: CallerContext,
  filters: TimesheetFilters = {},
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResult<Timesheet>> {
  const params: unknown[] = [];
  const where: string[] = [];
  let idx = 1;

  if (ctx.organizationId) {
    where.push(`ts.organization_id = $${idx++}`);
    params.push(ctx.organizationId);
  }

  const visibility = timesheetVisibilityClause(ctx, 'ts', idx);
  where.push(visibility.clause);
  params.push(...visibility.params);
  idx += visibility.params.length;

  if (filters.userId) {
    where.push(`ts.user_id = $${idx++}`);
    params.push(filters.userId);
  }
  if (filters.status) {
    where.push(`ts.status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters.weekStartDate) {
    where.push(`ts.week_start_date = $${idx++}::date`);
    params.push(filters.weekStartDate);
  }
  if (filters.dateRange?.from) {
    where.push(`ts.week_start_date >= $${idx++}::date`);
    params.push(filters.dateRange.from);
  }
  if (filters.dateRange?.to) {
    where.push(`ts.week_start_date <= $${idx++}::date`);
    params.push(filters.dateRange.to);
  }
  const whereSql = where.length ? where.join(' AND ') : '1=1';

  const count = await query<{ total: string }>(`SELECT COUNT(*)::int AS total FROM time_timesheets ts WHERE ${whereSql}`, params);
  const total = parseInt(count.rows[0]?.total ?? '0', 10);
  const paging = paginationClause(page, pageSize, idx);

  const result = await query<Record<string, unknown>>(
    `SELECT
       ts.id::text AS id,
       ts.organization_id::text AS organization_id,
       ts.user_id::text AS user_id,
       ru.full_name AS user_name,
       ts.week_start_date::text AS week_start_date,
       ts.week_end_date::text AS week_end_date,
       ts.total_hours::float AS total_hours,
       ts.billable_hours::float AS billable_hours,
       ts.non_billable_hours::float AS non_billable_hours,
       ts.billable_amount::float AS billable_amount,
       ts.status,
       ts.submitted_at::text AS submitted_at,
       ts.approved_at::text AS approved_at,
       ts.approved_by::text AS approved_by,
       ts.rejected_at::text AS rejected_at,
       ts.rejected_by::text AS rejected_by,
       ts.rejection_reason,
       ts.notes,
       ts.created_at::text AS created_at,
       ts.updated_at::text AS updated_at
     FROM time_timesheets ts
     LEFT JOIN reimbursement_users ru ON ru.id = ts.user_id
     WHERE ${whereSql}
     ORDER BY ts.week_start_date DESC, ts.created_at DESC
     ${paging.clause}`,
    [...params, ...paging.params],
  );

  return {
    data: result.rows.map(mapTimesheet),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getTimesheetById(ctx: CallerContext, timesheetId: string): Promise<Timesheet | null> {
  const result = await query<Record<string, unknown>>(
    `SELECT
       ts.id::text AS id,
       ts.organization_id::text AS organization_id,
       ts.user_id::text AS user_id,
       ru.full_name AS user_name,
       ts.week_start_date::text AS week_start_date,
       ts.week_end_date::text AS week_end_date,
       ts.total_hours::float AS total_hours,
       ts.billable_hours::float AS billable_hours,
       ts.non_billable_hours::float AS non_billable_hours,
       ts.billable_amount::float AS billable_amount,
       ts.status,
       ts.submitted_at::text AS submitted_at,
       ts.approved_at::text AS approved_at,
       ts.approved_by::text AS approved_by,
       ts.rejected_at::text AS rejected_at,
       ts.rejected_by::text AS rejected_by,
       ts.rejection_reason,
       ts.notes,
       ts.created_at::text AS created_at,
       ts.updated_at::text AS updated_at
     FROM time_timesheets ts
     LEFT JOIN reimbursement_users ru ON ru.id = ts.user_id
     WHERE ts.id = $1::uuid
       AND ts.organization_id = $2::uuid
       AND (${timesheetVisibilityClause(ctx, 'ts', 3).clause})
     LIMIT 1`,
    [timesheetId, ctx.organizationId, ...timesheetVisibilityClause(ctx, 'ts', 3).params],
  );
  if (!result.rows[0]) return null;
  const timesheet = mapTimesheet(result.rows[0]);
  timesheet.entries = await getEntriesForTimesheet(ctx, timesheet.user_id, timesheet.week_start_date);
  return timesheet;
}

export async function getOrCreateTimesheet(ctx: CallerContext, userId: string, weekStartDate: string): Promise<Timesheet> {
  if (!ctx.organizationId) throw new Error('organizationId is required');
  const existing = await query<Record<string, unknown>>(
    `SELECT
       id::text AS id,
       organization_id::text AS organization_id,
       user_id::text AS user_id,
       week_start_date::text AS week_start_date,
       week_end_date::text AS week_end_date,
       total_hours::float AS total_hours,
       billable_hours::float AS billable_hours,
       non_billable_hours::float AS non_billable_hours,
       billable_amount::float AS billable_amount,
       status,
       submitted_at::text AS submitted_at,
       approved_at::text AS approved_at,
       approved_by::text AS approved_by,
       rejected_at::text AS rejected_at,
       rejected_by::text AS rejected_by,
       rejection_reason,
       notes,
       created_at::text AS created_at,
       updated_at::text AS updated_at
     FROM time_timesheets
     WHERE organization_id = $1::uuid AND user_id = $2::uuid AND week_start_date = $3::date
     LIMIT 1`,
    [ctx.organizationId, userId, weekStartDate],
  );
  if (existing.rows[0]) return mapTimesheet(existing.rows[0]);

  const created = await query<Record<string, unknown>>(
    `INSERT INTO time_timesheets (
      organization_id, user_id, week_start_date, week_end_date, status
    )
    VALUES ($1::uuid, $2::uuid, $3::date, $4::date, 'draft')
    RETURNING
      id::text AS id,
      organization_id::text AS organization_id,
      user_id::text AS user_id,
      week_start_date::text AS week_start_date,
      week_end_date::text AS week_end_date,
      total_hours::float AS total_hours,
      billable_hours::float AS billable_hours,
      non_billable_hours::float AS non_billable_hours,
      billable_amount::float AS billable_amount,
      status,
      submitted_at::text AS submitted_at,
      approved_at::text AS approved_at,
      approved_by::text AS approved_by,
      rejected_at::text AS rejected_at,
      rejected_by::text AS rejected_by,
      rejection_reason,
      notes,
      created_at::text AS created_at,
      updated_at::text AS updated_at`,
    [ctx.organizationId, userId, weekStartDate, weekEndFromStart(weekStartDate)],
  );
  return mapTimesheet(created.rows[0]);
}

export async function submitTimesheet(ctx: CallerContext, timesheetId: string): Promise<Timesheet> {
  const timesheet = await getTimesheetById(ctx, timesheetId);
  if (!timesheet) throw new Error('Timesheet not found');
  if (timesheet.user_id !== ctx.userId && ctx.role !== 'system_admin' && ctx.role !== 'finance_admin') {
    throw new Error('You can only submit your own timesheet');
  }
  if (timesheet.status !== 'draft' && timesheet.status !== 'rejected') {
    throw new Error('Only draft or rejected timesheets can be submitted');
  }

  await query(
    `UPDATE time_entries
     SET timesheet_id = $1::uuid,
         status = 'submitted',
         updated_at = NOW()
     WHERE organization_id = $2::uuid
       AND user_id = $3::uuid
       AND date >= $4::date
       AND date <= $5::date
       AND status = 'draft'`,
    [timesheetId, timesheet.organization_id, timesheet.user_id, timesheet.week_start_date, timesheet.week_end_date],
  );

  await recomputeTotals(timesheetId);
  await query(
    `UPDATE time_timesheets
     SET status = 'submitted',
         submitted_at = NOW(),
         updated_at = NOW()
     WHERE id = $1::uuid`,
    [timesheetId],
  );

  const updated = await getTimesheetById(ctx, timesheetId);
  if (!updated) throw new Error('Timesheet not found after submit');
  eventBus.emit('time.timesheet.submitted', {
    timesheetId: updated.id,
    userId: updated.user_id,
    weekStartDate: updated.week_start_date,
    totalHours: updated.total_hours,
    billableHours: updated.billable_hours,
  });
  return updated;
}

export async function approveTimesheet(ctx: CallerContext, timesheetId: string): Promise<Timesheet> {
  if (!['manager', 'dept_head', 'finance_admin', 'system_admin', 'admin', 'finance'].includes(String(ctx.role))) {
    throw new Error('Only manager/admin can approve timesheets');
  }
  const timesheet = await getTimesheetById(ctx, timesheetId);
  if (!timesheet) throw new Error('Timesheet not found');
  if (timesheet.status !== 'submitted') throw new Error('Only submitted timesheets can be approved');

  await query(
    `UPDATE time_entries
     SET status = 'approved',
         updated_at = NOW()
     WHERE timesheet_id = $1::uuid`,
    [timesheetId],
  );

  await query(
    `UPDATE time_timesheets
     SET status = 'approved',
         approved_at = NOW(),
         approved_by = $2::uuid,
         rejection_reason = NULL,
         updated_at = NOW()
     WHERE id = $1::uuid`,
    [timesheetId, ctx.userId],
  );

  const updated = await getTimesheetById(ctx, timesheetId);
  if (!updated) throw new Error('Timesheet not found after approval');
  eventBus.emit('time.timesheet.approved', {
    timesheetId: updated.id,
    approvedBy: ctx.userId,
    userId: updated.user_id,
    totalHours: updated.total_hours,
    billableHours: updated.billable_hours,
  });
  return updated;
}

export async function rejectTimesheet(ctx: CallerContext, timesheetId: string, reason: string): Promise<Timesheet> {
  if (!['manager', 'dept_head', 'finance_admin', 'system_admin', 'admin', 'finance'].includes(String(ctx.role))) {
    throw new Error('Only manager/admin can reject timesheets');
  }
  const timesheet = await getTimesheetById(ctx, timesheetId);
  if (!timesheet) throw new Error('Timesheet not found');
  if (timesheet.status !== 'submitted') throw new Error('Only submitted timesheets can be rejected');

  await query(
    `UPDATE time_entries
     SET status = 'draft',
         timesheet_id = NULL,
         updated_at = NOW()
     WHERE timesheet_id = $1::uuid`,
    [timesheetId],
  );

  await query(
    `UPDATE time_timesheets
     SET status = 'rejected',
         rejected_at = NOW(),
         rejected_by = $2::uuid,
         rejection_reason = $3,
         updated_at = NOW()
     WHERE id = $1::uuid`,
    [timesheetId, ctx.userId, reason],
  );

  await recomputeTotals(timesheetId);
  const updated = await getTimesheetById(ctx, timesheetId);
  if (!updated) throw new Error('Timesheet not found after rejection');
  eventBus.emit('time.timesheet.rejected', {
    timesheetId: updated.id,
    rejectedBy: ctx.userId,
    userId: updated.user_id,
    reason,
  });
  return updated;
}
