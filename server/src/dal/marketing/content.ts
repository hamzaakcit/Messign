import type { PoolClient } from 'pg';
import { withTenantQuery } from '../../middleware/tenantContext.js';
import { eventBus } from '../../events/index.js';
import type { CallerContext, DateRange, PaginatedResult, SortOptions } from '../types.js';
import { paginationClause } from '../helpers.js';
import type { ImageGenerationFields, ImageGenerationMetadata } from './instagramTypes.js';

async function runInTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTenantQuery(tenantId, fn);
}

export interface Content extends ImageGenerationFields {
  id: string;
  organization_id: string | null;
  campaign_id: string | null;
  title: string;
  content_type: string;
  channel: string | null;
  status: string;
  body: string | null;
  body_html: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  published_at: string | null;
  author_id: string | null;
  reviewer_id: string | null;
  tags: string[];
  views: number;
  engagement: number;
  click_throughs: number;
  leads_attributed: number;
  knowledge_doc_id: string | null;
  created_at: string;
  updated_at: string;
  campaign_name?: string | null;
  author_name?: string | null;
  reviewer_name?: string | null;
  truth_validation?: Record<string, unknown> | null;
  truth_validated_at?: string | null;
  brand_voice_check?: Record<string, unknown> | null;
  brand_voice_checked_at?: string | null;
  user_brief?: string | null;
  revision_history?: unknown[];
  /** Meta Graph media id after Instagram publish */
  instagram_media_id?: string | null;
}

export interface ContentFilters {
  status?: string;
  contentType?: string;
  channel?: string;
  campaignId?: string;
  scheduledDateRange?: DateRange;
  authorId?: string;
}

export interface CreateContentInput {
  campaign_id?: string;
  title: string;
  content_type: string;
  channel?: string;
  status?: string;
  body?: string;
  body_html?: string;
  scheduled_date?: string;
  scheduled_time?: string;
  author_id?: string;
  reviewer_id?: string;
  tags?: string[];
  /** Stored JSON from Product Truth Validator when submitting for review */
  truth_validation?: Record<string, unknown> | null;
  truth_validated_at?: string | null;
  /** Stored JSON from Brand Voice Checker when submitting for review (after truth PASS) */
  brand_voice_check?: Record<string, unknown> | null;
  brand_voice_checked_at?: string | null;
  user_brief?: string | null;
  revision_history?: unknown[];
  image_prompt?: string | null;
  image_url?: string | null;
  visual_description?: string | null;
  image_generation_metadata?: ImageGenerationMetadata | null;
  instagram_media_id?: string | null;
}

export type UpdateContentInput = Partial<CreateContentInput> & {
  published_at?: string | null;
  views?: number;
  engagement?: number;
  click_throughs?: number;
  leads_attributed?: number;
};

export interface ContentCalendarDay {
  date: string;
  items: Content[];
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseRevisionHistory(raw: unknown): unknown[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown;
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseImageGenerationMetadata(raw: unknown): ImageGenerationMetadata | null {
  if (raw == null) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as ImageGenerationMetadata;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown;
      return typeof p === 'object' && p != null ? (p as ImageGenerationMetadata) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function mapContent(row: Record<string, unknown>): Content {
  return {
    id: String(row.id),
    organization_id: row.organization_id ? String(row.organization_id) : null,
    campaign_id: row.campaign_id ? String(row.campaign_id) : null,
    title: String(row.title),
    content_type: String(row.content_type),
    channel: row.channel ? String(row.channel) : null,
    status: String(row.status),
    body: row.body ? String(row.body) : null,
    body_html: row.body_html ? String(row.body_html) : null,
    scheduled_date: row.scheduled_date ? String(row.scheduled_date) : null,
    scheduled_time: row.scheduled_time ? String(row.scheduled_time) : null,
    published_at: row.published_at ? String(row.published_at) : null,
    author_id: row.author_id ? String(row.author_id) : null,
    reviewer_id: row.reviewer_id ? String(row.reviewer_id) : null,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    views: toNumber(row.views),
    engagement: toNumber(row.engagement),
    click_throughs: toNumber(row.click_throughs),
    leads_attributed: toNumber(row.leads_attributed),
    knowledge_doc_id: row.knowledge_doc_id ? String(row.knowledge_doc_id) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    campaign_name: row.campaign_name ? String(row.campaign_name) : null,
    author_name: row.author_name ? String(row.author_name) : null,
    reviewer_name: row.reviewer_name ? String(row.reviewer_name) : null,
    truth_validation: (() => {
      const v = row.truth_validation;
      if (v == null) return null;
      if (typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
      try {
        return JSON.parse(String(v)) as Record<string, unknown>;
      } catch {
        return null;
      }
    })(),
    truth_validated_at: row.truth_validated_at ? String(row.truth_validated_at) : null,
    brand_voice_check: (() => {
      const v = row.brand_voice_check;
      if (v == null) return null;
      if (typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
      try {
        return JSON.parse(String(v)) as Record<string, unknown>;
      } catch {
        return null;
      }
    })(),
    brand_voice_checked_at: row.brand_voice_checked_at ? String(row.brand_voice_checked_at) : null,
    user_brief: row.user_brief != null ? String(row.user_brief) : null,
    revision_history: parseRevisionHistory(row.revision_history),
    image_prompt: row.image_prompt != null ? String(row.image_prompt) : null,
    image_url: row.image_url != null ? String(row.image_url) : null,
    visual_description: row.visual_description != null ? String(row.visual_description) : null,
    image_generation_metadata: parseImageGenerationMetadata(row.image_generation_metadata),
    instagram_media_id: row.instagram_media_id != null ? String(row.instagram_media_id) : null,
  };
}

export async function listContent(
  ctx: CallerContext,
  filters?: ContentFilters,
  sort?: SortOptions,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResult<Content>> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for listContent');

  return runInTenant(tenantId, async (client) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

      if (filters?.status) {
      conditions.push(`mc.status = $${idx++}`);
      params.push(filters.status);
    }
    if (filters?.contentType) {
      conditions.push(`mc.content_type = $${idx++}`);
      params.push(filters.contentType);
    }
    if (filters?.channel) {
      conditions.push(`mc.channel = $${idx++}`);
      params.push(filters.channel);
    }
    if (filters?.campaignId) {
      conditions.push(`mc.campaign_id = $${idx++}`);
      params.push(filters.campaignId);
    }
    if (filters?.authorId) {
      conditions.push(`mc.author_id = $${idx++}`);
      params.push(filters.authorId);
    }
    if (filters?.scheduledDateRange?.from) {
      conditions.push(`mc.scheduled_date >= $${idx++}::date`);
      params.push(filters.scheduledDateRange.from);
    }
    if (filters?.scheduledDateRange?.to) {
      conditions.push(`mc.scheduled_date <= $${idx++}::date`);
      params.push(filters.scheduledDateRange.to);
    }

    const whereSQL = conditions.length > 0 ? conditions.join(' AND ') : '1=1';
    const sortColumns: Record<string, string> = {
      title: 'mc.title',
      status: 'mc.status',
      content_type: 'mc.content_type',
      channel: 'mc.channel',
      scheduled_date: 'mc.scheduled_date',
      created: 'mc.created_at',
      engagement: 'mc.engagement',
    };
    const orderBy = sortColumns[sort?.field ?? 'scheduled_date'] ?? 'mc.scheduled_date';
    const direction = sort?.direction === 'asc' ? 'ASC' : 'DESC';

    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count
       FROM marketing_content mc
       WHERE ${whereSQL}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const pg = paginationClause(page, pageSize, idx);
    const result = await client.query(
      `SELECT
         mc.*,
         c.name AS campaign_name,
         au.full_name AS author_name,
         rv.full_name AS reviewer_name
       FROM marketing_content mc
       LEFT JOIN marketing_campaigns c ON c.id = mc.campaign_id
       LEFT JOIN reimbursement_users au ON au.id = mc.author_id
       LEFT JOIN reimbursement_users rv ON rv.id = mc.reviewer_id
       WHERE ${whereSQL}
       ORDER BY ${orderBy} ${direction} NULLS LAST, mc.created_at DESC
       ${pg.clause}`,
      [...params, ...pg.params],
    );

    return {
      data: result.rows.map((row) => mapContent(row as Record<string, unknown>)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  });
}

export async function getContentById(ctx: CallerContext, contentId: string): Promise<Content | null> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getContentById');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `SELECT
         mc.*,
         c.name AS campaign_name,
         au.full_name AS author_name,
         rv.full_name AS reviewer_name
       FROM marketing_content mc
       LEFT JOIN marketing_campaigns c ON c.id = mc.campaign_id
       LEFT JOIN reimbursement_users au ON au.id = mc.author_id
       LEFT JOIN reimbursement_users rv ON rv.id = mc.reviewer_id
       WHERE mc.id = $1
       LIMIT 1`,
      [contentId],
    );
    return result.rows[0] ? mapContent(result.rows[0] as Record<string, unknown>) : null;
  });
}

export async function createContent(ctx: CallerContext, data: CreateContentInput): Promise<Content> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for createContent');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `INSERT INTO marketing_content (
         organization_id, campaign_id, title, content_type, channel, status, body,
         body_html, scheduled_date, scheduled_time, author_id, reviewer_id, tags,
         truth_validation, truth_validated_at, brand_voice_check, brand_voice_checked_at,
         user_brief, revision_history,
         image_prompt, image_url, visual_description, image_generation_metadata, instagram_media_id
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       RETURNING *`,
      [
        tenantId,
        data.campaign_id ?? null,
        data.title,
        data.content_type,
        data.channel ?? null,
        data.status ?? 'idea',
        data.body ?? null,
        data.body_html ?? null,
        data.scheduled_date ?? null,
        data.scheduled_time ?? null,
        data.author_id ?? ctx.userId,
        data.reviewer_id ?? null,
        JSON.stringify(data.tags ?? []),
        data.truth_validation ?? null,
        data.truth_validated_at ?? null,
        data.brand_voice_check ?? null,
        data.brand_voice_checked_at ?? null,
        data.user_brief ?? null,
        data.revision_history != null ? JSON.stringify(data.revision_history) : '[]',
        data.image_prompt ?? null,
        data.image_url ?? null,
        data.visual_description ?? null,
        data.image_generation_metadata ?? null,
        data.instagram_media_id ?? null,
      ],
    );
    return (await getContentById(ctx, String(result.rows[0].id))) ?? mapContent(result.rows[0] as Record<string, unknown>);
  });
}

export async function updateContent(
  ctx: CallerContext,
  contentId: string,
  data: UpdateContentInput,
): Promise<Content> {
  const fields: Array<[string, unknown]> = [
    ['campaign_id', data.campaign_id],
    ['title', data.title],
    ['content_type', data.content_type],
    ['channel', data.channel],
    ['status', data.status],
    ['body', data.body],
    ['body_html', data.body_html],
    ['scheduled_date', data.scheduled_date],
    ['scheduled_time', data.scheduled_time],
    ['author_id', data.author_id],
    ['reviewer_id', data.reviewer_id],
    ['published_at', data.published_at],
    ['views', data.views],
    ['engagement', data.engagement],
    ['click_throughs', data.click_throughs],
    ['leads_attributed', data.leads_attributed],
  ];
  if (data.tags !== undefined) {
    fields.push(['tags', JSON.stringify(data.tags)]);
  }
  if (data.truth_validation !== undefined) {
    fields.push(['truth_validation', data.truth_validation ?? null]);
  }
  if (data.truth_validated_at !== undefined) {
    fields.push(['truth_validated_at', data.truth_validated_at]);
  }
  if (data.brand_voice_check !== undefined) {
    fields.push(['brand_voice_check', data.brand_voice_check ?? null]);
  }
  if (data.brand_voice_checked_at !== undefined) {
    fields.push(['brand_voice_checked_at', data.brand_voice_checked_at]);
  }
  if (data.user_brief !== undefined) {
    fields.push(['user_brief', data.user_brief ?? null]);
  }
  if (data.revision_history !== undefined) {
    fields.push(['revision_history', JSON.stringify(data.revision_history ?? [])]);
  }
  if (data.image_prompt !== undefined) {
    fields.push(['image_prompt', data.image_prompt ?? null]);
  }
  if (data.image_url !== undefined) {
    fields.push(['image_url', data.image_url ?? null]);
  }
  if (data.visual_description !== undefined) {
    fields.push(['visual_description', data.visual_description ?? null]);
  }
  if (data.image_generation_metadata !== undefined) {
    fields.push(['image_generation_metadata', data.image_generation_metadata ?? null]);
  }
  if (data.instagram_media_id !== undefined) {
    fields.push(['instagram_media_id', data.instagram_media_id ?? null]);
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
  params.push(contentId);

  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for updateContent');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `UPDATE marketing_content
       SET ${sets.join(', ')}
       WHERE id = $${idx}
       RETURNING *`,
      params,
    );
    if (!result.rows[0]) throw new Error('Content not found');
    return (await getContentById(ctx, contentId)) ?? mapContent(result.rows[0] as Record<string, unknown>);
  });
}

export async function publishContent(ctx: CallerContext, contentId: string): Promise<Content> {
  const content = await updateContent(ctx, contentId, {
    status: 'published',
    published_at: new Date().toISOString(),
  });
  eventBus.emit('marketing.content.published', {
    contentId: content.id,
    title: content.title,
    type: content.content_type,
    channel: content.channel ?? 'unknown',
    publishedBy: ctx.userId,
  });
  return content;
}

export async function scheduleContent(
  ctx: CallerContext,
  contentId: string,
  date: string,
  time?: string,
): Promise<Content> {
  const content = await updateContent(ctx, contentId, {
    status: 'scheduled',
    scheduled_date: date,
    scheduled_time: time,
  });
  eventBus.emit('marketing.content.scheduled', {
    contentId: content.id,
    title: content.title,
    scheduledFor: time ? `${date}T${time}` : date,
  });
  return content;
}

export async function getCalendarView(
  ctx: CallerContext,
  month: number,
  year: number,
): Promise<ContentCalendarDay[]> {
  const monthValue = String(month).padStart(2, '0');
  const startDate = `${year}-${monthValue}-01`;
  const endDate = new Date(year, month, 0).toISOString().slice(0, 10);
  const content = await listContent(
    ctx,
    { scheduledDateRange: { from: startDate, to: endDate } },
    { field: 'scheduled_date', direction: 'asc' },
    1,
    500,
  );

  const grouped = new Map<string, Content[]>();
  for (const item of content.data) {
    const key = item.scheduled_date ?? startDate;
    const list = grouped.get(key) ?? [];
    list.push(item);
    grouped.set(key, list);
  }

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, items]) => ({ date, items }));
}
