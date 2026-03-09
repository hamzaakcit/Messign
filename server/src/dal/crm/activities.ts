import { query } from '../../db/index.js';
import { eventBus } from '../../events/index.js';
import type { CallerContext, PaginatedResult } from '../types.js';
import { paginationClause } from '../helpers.js';
import type { Deal } from './deals.js';

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
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (ctx.organizationId) {
    conditions.push(`a.organization_id = $${idx++}`);
    params.push(ctx.organizationId);
  }
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

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM crm_activities a WHERE ${whereSQL}`,
    params,
  );
  const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

  const pg = paginationClause(page, pageSize, idx);
  const dataResult = await query(
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
}

export async function createActivity(ctx: CallerContext, data: CreateActivityInput): Promise<Activity> {
  const result = await query(
    `INSERT INTO crm_activities
     (organization_id, deal_id, contact_id, user_id, type, subject, description,
      scheduled_at, completed_at, duration_minutes, outcome)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      ctx.organizationId ?? null, data.deal_id ?? null, data.contact_id ?? null,
      ctx.userId, data.type, data.subject ?? null, data.description ?? null,
      data.scheduled_at ?? null, data.completed_at ?? null,
      data.duration_minutes ?? null, data.outcome ?? null,
    ],
  );
  const activity = result.rows[0] as Activity;

  if (data.contact_id) {
    await query('UPDATE crm_contacts SET last_contacted_at = NOW() WHERE id = $1', [data.contact_id]);
  }

  eventBus.emit('crm.activity.logged', {
    activityId: activity.id, dealId: activity.deal_id ?? undefined,
    contactId: activity.contact_id ?? undefined, userId: ctx.userId,
    type: data.type as 'call' | 'email' | 'meeting' | 'note',
  });

  return activity;
}

export async function updateActivity(
  activityId: string,
  data: Partial<CreateActivityInput>,
): Promise<Activity> {
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

  const result = await query(
    `UPDATE crm_activities SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    params,
  );
  if (!result.rows[0]) throw new Error('Activity not found');
  return result.rows[0] as Activity;
}

export async function deleteActivity(activityId: string): Promise<void> {
  await query('DELETE FROM crm_activities WHERE id = $1', [activityId]);
}

export async function completeActivity(ctx: CallerContext, activityId: string): Promise<Activity> {
  const result = await query(
    `UPDATE crm_activities SET completed_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *`,
    [activityId, ctx.userId],
  );
  if (!result.rows[0]) throw new Error('Activity not found or not owned by user');
  return result.rows[0] as Activity;
}

export async function getActivityGaps(ctx: CallerContext): Promise<Deal[]> {
  const conditions = ['s.is_won = false', 's.is_lost = false'];
  const params: unknown[] = [];
  let idx = 1;

  if (ctx.organizationId) {
    conditions.push(`d.organization_id = $${idx++}`);
    params.push(ctx.organizationId);
  }

  const result = await query(
    `SELECT d.*,
            s.name as stage_name,
            co.name as company_name,
            u.full_name as owner_name
     FROM crm_deals d
     JOIN crm_deal_stages s ON s.id = d.stage_id
     LEFT JOIN crm_companies co ON co.id = d.company_id
     LEFT JOIN reimbursement_users u ON u.id = d.owner_id
     WHERE ${conditions.join(' AND ')}
       AND d.id NOT IN (
         SELECT deal_id FROM crm_activities
         WHERE deal_id IS NOT NULL AND created_at > NOW() - INTERVAL '10 days'
       )
     ORDER BY d.amount DESC`,
    params,
  );
  return result.rows as Deal[];
}
