/**
 * Background marketing publisher: claims due `marketing_content_calendar` rows with SKIP LOCKED,
 * routes to channel adapters, updates published/failed state + optional `marketing_content` publish fields.
 *
 * `marketing_content` is RLS-protected (`tenant_id`); loads and content updates run inside
 * {@link withTenantQuery}. Calendar rows are claimed with the global pool (no per-tenant claim).
 *
 * Stuck `processing` rows (crash mid-flight) are not auto-reset here — ops can requeue with SQL or a future sweeper.
 */
import { query, withTenantQuery } from '../../db/index.js';
import type { QueryResult } from 'pg';
import type { CalendarRecordForPublish, ContentPayloadForPublish } from './publishing/types.js';
import { publishContent } from './publishing/publishRouter.js';

const DEFAULT_BATCH = 50;

/** Same signature as `query` from `db/index.js` — injectable for tests (claim step only). */
export type MarketingPublisherQueryFn = <T extends import('pg').QueryResultRow = import('pg').QueryResultRow>(
  text: string,
  params?: unknown[],
) => Promise<QueryResult<T>>;

export interface MarketingPublisherDeps {
  query?: MarketingPublisherQueryFn;
  publishContent?: typeof publishContent;
}

function rowToCalendar(row: Record<string, unknown>): CalendarRecordForPublish {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    content_id: String(row.content_id),
    campaign_id: row.campaign_id ? String(row.campaign_id) : null,
    scheduled_at: String(row.scheduled_at),
    channel: String(row.channel),
    status: String(row.status),
  };
}

/**
 * Atomically moves due rows from `scheduled` → `processing` so overlapping cron ticks cannot double-publish.
 * Uses `FOR UPDATE SKIP LOCKED` so concurrent workers claim disjoint sets without blocking.
 */
export async function claimDueCalendarRows(
  limit: number = DEFAULT_BATCH,
  q: MarketingPublisherQueryFn = query,
): Promise<CalendarRecordForPublish[]> {
  const r = await q<Record<string, unknown>>(
    `UPDATE marketing_content_calendar AS m
     SET status = 'processing', updated_at = NOW()
     FROM (
       SELECT id FROM marketing_content_calendar
       WHERE status = 'scheduled' AND scheduled_at <= NOW()
       ORDER BY scheduled_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT $1
     ) AS sub
     WHERE m.id = sub.id
     RETURNING m.*`,
    [limit],
  );
  return r.rows.map(rowToCalendar);
}

async function loadContentPayload(workspaceId: string, contentId: string): Promise<ContentPayloadForPublish | null> {
  return withTenantQuery(workspaceId, async (client) => {
    const r = await client.query<Record<string, unknown>>(
      `SELECT title, body, body_html, content_type, channel,
              image_url, image_prompt, visual_description
       FROM marketing_content
       WHERE id = $1 AND organization_id = $2
       LIMIT 1`,
      [contentId, workspaceId],
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      title: String(row.title),
      body: row.body ? String(row.body) : null,
      body_html: row.body_html ? String(row.body_html) : null,
      content_type: String(row.content_type),
      channel: row.channel ? String(row.channel) : null,
      image_url: row.image_url != null ? String(row.image_url) : null,
      image_prompt: row.image_prompt != null ? String(row.image_prompt) : null,
      visual_description: row.visual_description != null ? String(row.visual_description) : null,
    };
  });
}

async function markCalendarPublished(
  workspaceId: string,
  calendarId: string,
  publishedUrl?: string,
  externalPostId?: string,
): Promise<void> {
  await query(
    `UPDATE marketing_content_calendar
     SET status = 'published',
         published_url = $2,
         external_post_id = $3,
         last_error = NULL,
         updated_at = NOW()
     WHERE id = $1 AND workspace_id = $4`,
    [calendarId, publishedUrl ?? null, externalPostId ?? null, workspaceId],
  );
}

async function markCalendarFailed(workspaceId: string, calendarId: string, message: string): Promise<void> {
  await query(
    `UPDATE marketing_content_calendar
     SET status = 'failed',
         last_error = $2,
         updated_at = NOW()
     WHERE id = $1 AND workspace_id = $3`,
    [calendarId, message.slice(0, 8000), workspaceId],
  );
}

async function markContentPublished(workspaceId: string, contentId: string): Promise<void> {
  await withTenantQuery(workspaceId, async (client) => {
    await client.query(
      `UPDATE marketing_content
       SET status = 'published',
           published_at = COALESCE(published_at, NOW()),
           updated_at = NOW()
       WHERE id = $1`,
      [contentId],
    );
  });
}

export interface PublisherTickResult {
  claimed: number;
  published: number;
  failed: number;
  errors: string[];
}

/**
 * Single cron invocation: claim → publish → persist outcome per row.
 * Prefer this name in new code; {@link runMarketingPublisherTick} is an alias for the cron job.
 */
export async function pollAndPublish(
  batchSize: number = DEFAULT_BATCH,
  deps: MarketingPublisherDeps = {},
): Promise<PublisherTickResult> {
  const q = deps.query ?? query;
  const publishFn = deps.publishContent ?? publishContent;

  const rows = await claimDueCalendarRows(batchSize, q);
  const errors: string[] = [];
  let published = 0;
  let failed = 0;

  for (const cal of rows) {
    const ws = cal.workspace_id;
    try {
      const payload = await loadContentPayload(ws, cal.content_id);
      if (!payload) {
        const msg = 'Content row missing or wrong workspace';
        await markCalendarFailed(ws, cal.id, msg);
        failed++;
        errors.push(`${cal.id}: ${msg}`);
        continue;
      }

      const result = await publishFn(cal, payload);
      await markCalendarPublished(ws, cal.id, result.publishedUrl, result.externalPostId);
      await markContentPublished(ws, cal.content_id);
      published++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await markCalendarFailed(ws, cal.id, msg);
      failed++;
      errors.push(`${cal.id}: ${msg}`);
      console.error('[marketingPublisherService] publish failed', { calendarId: cal.id, error: msg });
    }
  }

  if (rows.length > 0) {
    console.log('[marketingPublisherService] tick', {
      claimed: rows.length,
      published,
      failed,
    });
  }

  return { claimed: rows.length, published, failed, errors };
}

/** @deprecated Prefer {@link pollAndPublish} — kept for existing cron import. */
export const runMarketingPublisherTick = pollAndPublish;

/** Channel router used by the publisher (strategy / switch). */
export { publishContent } from './publishing/publishRouter.js';
export { publishLinkedInOrganicShare as linkedinAdapter } from './publishing/adapters/linkedinAdapter.js';
export { publishEmailCampaign as emailAdapter } from './publishing/adapters/emailAdapter.js';
