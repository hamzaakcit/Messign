/**
 * marketing_content_calendar — scheduled slots for approved content.
 */
import type { PoolClient } from 'pg';
import { withTenantQuery } from '../../middleware/tenantContext.js';
import type { CallerContext } from '../types.js';

export interface ContentCalendarRow {
  id: string;
  workspace_id: string;
  content_id: string;
  campaign_id: string | null;
  scheduled_at: string;
  channel: string;
  status: string;
  created_at: string;
  updated_at: string;
}

function mapRow(row: Record<string, unknown>): ContentCalendarRow {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    content_id: String(row.content_id),
    campaign_id: row.campaign_id ? String(row.campaign_id) : null,
    scheduled_at: String(row.scheduled_at),
    channel: String(row.channel),
    status: String(row.status),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function upsertContentCalendar(
  client: PoolClient,
  workspaceId: string,
  contentId: string,
  campaignId: string | null,
  scheduledAtIso: string,
  channel: string,
  status: 'planned' | 'scheduled' | 'processing' | 'published' | 'failed' | 'paused' = 'scheduled',
): Promise<ContentCalendarRow> {
  const r = await client.query(
    `INSERT INTO marketing_content_calendar (
       workspace_id, content_id, campaign_id, scheduled_at, channel, status, updated_at
     )
     VALUES ($1, $2, $3, $4::timestamptz, $5, $6, NOW())
     ON CONFLICT (workspace_id, content_id)
     DO UPDATE SET
       campaign_id = EXCLUDED.campaign_id,
       scheduled_at = EXCLUDED.scheduled_at,
       channel = EXCLUDED.channel,
       status = EXCLUDED.status,
       updated_at = NOW()
     RETURNING *`,
    [workspaceId, contentId, campaignId, scheduledAtIso, channel, status],
  );
  return mapRow(r.rows[0] as Record<string, unknown>);
}

export async function getCalendarRowForContent(
  ctx: CallerContext,
  contentId: string,
): Promise<ContentCalendarRow | null> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required');

  return withTenantQuery(tenantId, async (client: PoolClient) => {
    const r = await client.query(
      `SELECT * FROM marketing_content_calendar WHERE workspace_id = $1 AND content_id = $2 LIMIT 1`,
      [tenantId, contentId],
    );
    return r.rows[0] ? mapRow(r.rows[0] as Record<string, unknown>) : null;
  });
}
