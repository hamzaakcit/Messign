import type { PoolClient } from 'pg';
import { withTenantQuery } from '../../../middleware/tenantContext.js';
import { eventBus } from '../../../events/index.js';
import type { CallerContext, PaginatedResult } from '../../../dal/types.js';
import { paginationClause } from '../../../dal/helpers.js';
import type { Deal } from './deals.js';

async function runInTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTenantQuery(tenantId, fn);
}

// ── Interfaces ──

export interface Activity {
  id: string;
  organization_id: string;
  deal_id: string | null;
  contact_id: string | null;
  user_id: string;
  type: string;
  subject: string | null;
  description: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  duration_minutes: number | null;
  outcome: string | null;
  created_at: string;
  user_name?: string;
  deal_title?: string;
  contact_name?: string;
}

export interface CreateActivityInput {
  deal_id?: string;
  contact_id?: string;
  type: 'call' | 'email' | 'meeting' | 'note' | 'task';
  subject?: string;
  description?: string;
  scheduled_at?: string;
  completed_at?: string;
  duration_minutes?: number;
  outcome?: string;
}

export interface ActivityFilters {
  deal_id?: string;
  contact_id?: string;
  user_id?: string;
  type?: string;
  date_from?: string;
  date_to?: string;
}

// ── Functions ──

export async function listActivities(
  ctx: CallerContext,
  filters?: ActivityFilters,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResult<Activity>> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for listActivities');

  return runInTenant(tenantId, async (client) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

      if (filters?.deal_id) {
      conditions.push(`a.deal_id = $${idx++}`);
      params.push(filters.deal_id);
    }
    if (filters?.contact_id) {
      conditions.push(`a.contact_id = $${idx++}`);
      params.push(filters.contact_id);
    }
    if (filters?.user_id) {
      conditions.push(`a.user_id = $${idx++}`);
      params.push(filters.user_id);
    }
    if (filters?.type) {
      conditions.push(`a.type = $${idx++}`);
      params.push(filters.type);
    }
    if (filters?.date_from) {
      conditions.push(`a.created_at >= $${idx++}`);
      params.push(filters.date_from);
    }
    if (filters?.date_to) {
      conditions.push(`a.created_at <= $${idx++}`);
      params.push(filters.date_to);
    }

    const whereSQL = conditions.length > 0 ? conditions.join(' AND ') : '1=1';

    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM crm_activities a WHERE ${whereSQL}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const pg = paginationClause(page, pageSize, idx);
    const dataResult = await client.query(
      `SELECT a.*,
              u.full_name as user_name,
              d.title as deal_title,
              CONCAT(ct.first_name, ' ', ct.last_name) as contact_name
       FROM crm_activities a
       LEFT JOIN reimbursement_users u ON u.id = a.user_id
       LEFT JOIN crm_deals d ON d.id = a.deal_id
       LEFT JOIN crm_contacts ct ON ct.id = a.contact_id
       WHERE ${whereSQL}
       ORDER BY a.created_at DESC
       ${pg.clause}`,
      [...params, ...pg.params],
    );

    return { data: dataResult.rows as Activity[], total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  });
}

export async function createActivity(ctx: CallerContext, data: CreateActivityInput): Promise<Activity> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for createActivity');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `INSERT INTO crm_activities
       (organization_id, deal_id, contact_id, user_id, type, subject, description,
        scheduled_at, completed_at, duration_minutes, outcome)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        tenantId, data.deal_id ?? null, data.contact_id ?? null,
        ctx.userId, data.type, data.subject ?? null, data.description ?? null,
        data.scheduled_at ?? null, data.completed_at ?? null,
        data.duration_minutes ?? null, data.outcome ?? null,
      ],
    );
    const activity = result.rows[0] as Activity;

    if (data.contact_id) {
      await client.query('UPDATE crm_contacts SET last_contacted_at = NOW() WHERE id = $1', [data.contact_id]);
    }

    const notes = [data.description, data.subject].filter(Boolean).join('\n').trim();

    eventBus.emit('crm.activity.logged', {
      activityId: activity.id,
      dealId: activity.deal_id ?? undefined,
      contactId: activity.contact_id ?? undefined,
      userId: ctx.userId,
      type: data.type as 'call' | 'email' | 'meeting' | 'note',
      tenantId,
      notes: notes || undefined,
    });

    return activity;
  });
}

export async function updateActivity(
  ctx: CallerContext,
  activityId: string,
  data: Partial<CreateActivityInput>,
): Promise<Activity> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for updateActivity');

  return runInTenant(tenantId, async (client) => {
    const fields: [string, unknown][] = [
      ['subject', data.subject], ['description', data.description], ['type', data.type],
      ['scheduled_at', data.scheduled_at], ['completed_at', data.completed_at],
      ['duration_minutes', data.duration_minutes], ['outcome', data.outcome],
    ];
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const [col, val] of fields) {
      if (val !== undefined) {
        sets.push(`${col} = $${idx++}`);
        params.push(val);
      }
    }
    if (sets.length === 0) throw new Error('No fields to update');
    params.push(activityId);

    const result = await client.query(
      `UPDATE crm_activities SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params,
    );
    if (!result.rows[0]) throw new Error('Activity not found');
    return result.rows[0] as Activity;
  });
}

export async function deleteActivity(ctx: CallerContext, activityId: string): Promise<void> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for deleteActivity');

  return runInTenant(tenantId, async (client) => {
    await client.query('DELETE FROM crm_activities WHERE id = $1', [activityId]);
  });
}

export async function completeActivity(ctx: CallerContext, activityId: string): Promise<Activity> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for completeActivity');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `UPDATE crm_activities SET completed_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *`,
      [activityId, ctx.userId],
    );
    if (!result.rows[0]) throw new Error('Activity not found or not owned by user');
    return result.rows[0] as Activity;
  });
}

export interface WeeklyActivityRow {
  weekLabel: string;
  weekStart: string;
  calls: number;
  emails: number;
  meetings: number;
  notes: number;
}

/**
 * Aggregates CRM activities by Postgres week boundaries for the last `weekCount` weeks (oldest first).
 */
export async function getActivityCountsByWeek(
  ctx: CallerContext,
  weekCount: number,
): Promise<WeeklyActivityRow[]> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getActivityCountsByWeek');
  const n = Math.min(Math.max(weekCount, 1), 52);

  return runInTenant(tenantId, async (client) => {
    const result = await client.query<{
      week_start: string;
      calls: string;
      emails: string;
      meetings: string;
      notes: string;
      iso_week: string;
    }>(
      `WITH weeks AS (
         SELECT generate_series(
           date_trunc('week', NOW()::timestamp)::date - (($1::int - 1) * INTERVAL '1 week'),
           date_trunc('week', NOW()::timestamp)::date,
           INTERVAL '1 week'
         )::date AS week_start
       ),
       agg AS (
         SELECT
           date_trunc('week', a.created_at)::date AS week_start,
           SUM(CASE WHEN a.type = 'call' THEN 1 ELSE 0 END)::int AS calls,
           SUM(CASE WHEN a.type = 'email' THEN 1 ELSE 0 END)::int AS emails,
           SUM(CASE WHEN a.type = 'meeting' THEN 1 ELSE 0 END)::int AS meetings,
           SUM(CASE WHEN a.type NOT IN ('call', 'email', 'meeting') THEN 1 ELSE 0 END)::int AS notes
         FROM crm_activities a
         WHERE a.created_at >= (SELECT MIN(week_start) FROM weeks)
         GROUP BY 1
       )
       SELECT
         w.week_start::text AS week_start,
         COALESCE(a.calls, 0)::text AS calls,
         COALESCE(a.emails, 0)::text AS emails,
         COALESCE(a.meetings, 0)::text AS meetings,
         COALESCE(a.notes, 0)::text AS notes,
         EXTRACT(week FROM w.week_start)::text AS iso_week
       FROM weeks w
       LEFT JOIN agg a ON a.week_start = w.week_start
       ORDER BY w.week_start`,
      [n],
    );

    return result.rows.map((row) => ({
      weekLabel: `W${row.iso_week}`,
      weekStart: row.week_start,
      calls: parseInt(row.calls, 10) || 0,
      emails: parseInt(row.emails, 10) || 0,
      meetings: parseInt(row.meetings, 10) || 0,
      notes: parseInt(row.notes, 10) || 0,
    }));
  });
}

export async function getActivityGaps(ctx: CallerContext): Promise<Deal[]> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getActivityGaps');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `SELECT d.*,
              s.name as stage_name,
              co.name as company_name,
              u.full_name as owner_name
       FROM crm_deals d
       JOIN crm_deal_stages s ON s.id = d.stage_id
       LEFT JOIN crm_companies co ON co.id = d.company_id
       LEFT JOIN reimbursement_users u ON u.id = d.owner_id
       WHERE s.is_won = false AND s.is_lost = false
         AND d.id NOT IN (
           SELECT deal_id FROM crm_activities
           WHERE deal_id IS NOT NULL AND created_at > NOW() - INTERVAL '10 days'
         )
       ORDER BY d.amount DESC`,
    );
    return result.rows as Deal[];
  });
}
