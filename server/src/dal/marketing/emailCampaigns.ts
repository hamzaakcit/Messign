import { query } from '../../db/index.js';
import { eventBus } from '../../events/index.js';
import type { CallerContext, PaginatedResult } from '../types.js';
import { paginationClause } from '../helpers.js';

export interface EmailCampaign {
  id: string;
  campaign_id: string | null;
  name: string;
  subject: string;
  body_html: string;
  body_text: string | null;
  from_name: string | null;
  from_email: string | null;
  status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  recipient_count: number;
  audience_filter: Record<string, unknown>;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  open_rate: number | null;
  click_rate: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  campaign_name?: string | null;
}

export interface EmailCampaignFilters {
  status?: string;
  campaignId?: string;
}

export interface CreateEmailCampaignInput {
  campaign_id?: string;
  name: string;
  subject: string;
  body_html: string;
  body_text?: string;
  from_name?: string;
  from_email?: string;
  status?: string;
  scheduled_at?: string;
  recipient_count?: number;
  audience_filter?: Record<string, unknown>;
}

export type UpdateEmailCampaignInput = Partial<CreateEmailCampaignInput>;

export interface EmailMetricsInput {
  opens: number;
  clicks: number;
  bounces: number;
  unsubscribes: number;
  delivered?: number;
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapEmailCampaign(row: Record<string, unknown>): EmailCampaign {
  return {
    id: String(row.id),
    campaign_id: row.campaign_id ? String(row.campaign_id) : null,
    name: String(row.name),
    subject: String(row.subject),
    body_html: String(row.body_html),
    body_text: row.body_text ? String(row.body_text) : null,
    from_name: row.from_name ? String(row.from_name) : null,
    from_email: row.from_email ? String(row.from_email) : null,
    status: String(row.status),
    scheduled_at: row.scheduled_at ? String(row.scheduled_at) : null,
    sent_at: row.sent_at ? String(row.sent_at) : null,
    recipient_count: toNumber(row.recipient_count),
    audience_filter:
      row.audience_filter && typeof row.audience_filter === 'object'
        ? (row.audience_filter as Record<string, unknown>)
        : {},
    delivered: toNumber(row.delivered),
    opened: toNumber(row.opened),
    clicked: toNumber(row.clicked),
    bounced: toNumber(row.bounced),
    unsubscribed: toNumber(row.unsubscribed),
    open_rate: row.open_rate == null ? null : toNumber(row.open_rate),
    click_rate: row.click_rate == null ? null : toNumber(row.click_rate),
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    campaign_name: row.campaign_name ? String(row.campaign_name) : null,
  };
}

export async function listEmailCampaigns(
  ctx: CallerContext,
  filters?: EmailCampaignFilters,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResult<EmailCampaign>> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (ctx.organizationId) {
    conditions.push(`c.organization_id = $${idx++}`);
    params.push(ctx.organizationId);
  }
  if (filters?.status) {
    conditions.push(`mec.status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters?.campaignId) {
    conditions.push(`mec.campaign_id = $${idx++}`);
    params.push(filters.campaignId);
  }

  const whereSQL = conditions.length > 0 ? conditions.join(' AND ') : '1=1';
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*)::int AS count
     FROM marketing_email_campaigns mec
     LEFT JOIN marketing_campaigns c ON c.id = mec.campaign_id
     WHERE ${whereSQL}`,
    params,
  );
  const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

  const pg = paginationClause(page, pageSize, idx);
  const result = await query(
    `SELECT mec.*, c.name AS campaign_name
     FROM marketing_email_campaigns mec
     LEFT JOIN marketing_campaigns c ON c.id = mec.campaign_id
     WHERE ${whereSQL}
     ORDER BY mec.created_at DESC
     ${pg.clause}`,
    [...params, ...pg.params],
  );

  return {
    data: result.rows.map((row) => mapEmailCampaign(row as Record<string, unknown>)),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getEmailCampaignById(ctx: CallerContext, id: string): Promise<EmailCampaign | null> {
  const result = await query(
    `SELECT mec.*, c.name AS campaign_name
     FROM marketing_email_campaigns mec
     LEFT JOIN marketing_campaigns c ON c.id = mec.campaign_id
     WHERE mec.id = $1
       AND ($2::uuid IS NULL OR c.organization_id = $2::uuid OR mec.campaign_id IS NULL)
     LIMIT 1`,
    [id, ctx.organizationId ?? null],
  );
  return result.rows[0] ? mapEmailCampaign(result.rows[0] as Record<string, unknown>) : null;
}

export async function createEmailCampaign(ctx: CallerContext, data: CreateEmailCampaignInput): Promise<EmailCampaign> {
  const result = await query(
    `INSERT INTO marketing_email_campaigns (
       campaign_id, name, subject, body_html, body_text, from_name, from_email,
       status, scheduled_at, recipient_count, audience_filter, created_by
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      data.campaign_id ?? null,
      data.name,
      data.subject,
      data.body_html,
      data.body_text ?? null,
      data.from_name ?? null,
      data.from_email ?? null,
      data.status ?? 'draft',
      data.scheduled_at ?? null,
      data.recipient_count ?? 0,
      JSON.stringify(data.audience_filter ?? {}),
      ctx.userId,
    ],
  );
  return (await getEmailCampaignById(ctx, String(result.rows[0].id))) ?? mapEmailCampaign(result.rows[0] as Record<string, unknown>);
}

export async function updateEmailCampaign(
  ctx: CallerContext,
  id: string,
  data: UpdateEmailCampaignInput,
): Promise<EmailCampaign> {
  const fields: Array<[string, unknown]> = [
    ['campaign_id', data.campaign_id],
    ['name', data.name],
    ['subject', data.subject],
    ['body_html', data.body_html],
    ['body_text', data.body_text],
    ['from_name', data.from_name],
    ['from_email', data.from_email],
    ['status', data.status],
    ['scheduled_at', data.scheduled_at],
    ['recipient_count', data.recipient_count],
  ];
  if (data.audience_filter !== undefined) {
    fields.push(['audience_filter', JSON.stringify(data.audience_filter)]);
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  for (const [field, value] of fields) {
    if (value !== undefined) {
      sets.push(`${field} = $${idx++}`);
      params.push(value);
    }
  }
  sets.push('updated_at = NOW()');
  params.push(id);

  const result = await query(
    `UPDATE marketing_email_campaigns
     SET ${sets.join(', ')}
     WHERE id = $${idx}
     RETURNING *`,
    params,
  );
  if (!result.rows[0]) {
    throw new Error('Email campaign not found');
  }
  return (await getEmailCampaignById(ctx, id)) ?? mapEmailCampaign(result.rows[0] as Record<string, unknown>);
}

export async function sendEmailCampaign(ctx: CallerContext, id: string): Promise<EmailCampaign> {
  const emailCampaign = await updateEmailCampaign(ctx, id, {
    status: 'sent',
  });

  await query(
    `UPDATE marketing_email_campaigns
     SET sent_at = NOW(),
         delivered = recipient_count,
         updated_at = NOW()
     WHERE id = $1`,
    [id],
  );

  const updated = await getEmailCampaignById(ctx, id);
  const resolved = updated ?? emailCampaign;
  eventBus.emit('marketing.email.sent', {
    emailCampaignId: resolved.id,
    recipientCount: resolved.recipient_count,
    subject: resolved.subject,
  });
  return resolved;
}

export async function updateEmailMetrics(
  ctx: CallerContext,
  id: string,
  metrics: EmailMetricsInput,
): Promise<EmailCampaign> {
  const current = await getEmailCampaignById(ctx, id);
  if (!current) {
    throw new Error('Email campaign not found');
  }

  const delivered = metrics.delivered ?? current.recipient_count;
  const openRate = delivered > 0 ? Number(((metrics.opens / delivered) * 100).toFixed(2)) : 0;
  const clickRate = delivered > 0 ? Number(((metrics.clicks / delivered) * 100).toFixed(2)) : 0;

  await query(
    `UPDATE marketing_email_campaigns
     SET delivered = $2,
         opened = $3,
         clicked = $4,
         bounced = $5,
         unsubscribed = $6,
         open_rate = $7,
         click_rate = $8,
         updated_at = NOW()
     WHERE id = $1`,
    [id, delivered, metrics.opens, metrics.clicks, metrics.bounces, metrics.unsubscribes, openRate, clickRate],
  );

  eventBus.emit('marketing.email.metrics_updated', {
    emailCampaignId: id,
    opens: metrics.opens,
    clicks: metrics.clicks,
    bounces: metrics.bounces,
    unsubscribes: metrics.unsubscribes,
  });

  const updated = await getEmailCampaignById(ctx, id);
  if (!updated) {
    throw new Error('Email campaign not found after metrics update');
  }
  return updated;
}
