/**
 * Aggregated operational metrics for a campaign (budget allocations + content + approvals).
 */
import type { PoolClient } from 'pg';
import { withTenantQuery } from '../../middleware/tenantContext.js';
import type { CallerContext } from '../types.js';
import { sumAllocationsByCampaign } from './budgetAllocations.js';

export interface CampaignOperationsMetrics {
  campaign_id: string;
  total_allocated: number;
  total_spent: number;
  published_content_count: number;
  pending_approval_count: number;
}

export async function fetchCampaignOperationsMetrics(
  ctx: CallerContext,
  campaignId: string,
): Promise<CampaignOperationsMetrics> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required');

  return withTenantQuery(tenantId, async (client: PoolClient) => {
    const sums = await sumAllocationsByCampaign(client, tenantId, campaignId);

    const pub = await client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM marketing_content
       WHERE organization_id = $1 AND campaign_id = $2 AND status = 'published'`,
      [tenantId, campaignId],
    );

    const pend = await client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c
       FROM marketing_approval_queue aq
       INNER JOIN marketing_content mc ON mc.id = aq.content_id
       WHERE aq.organization_id = $1 AND mc.campaign_id = $2 AND aq.status = 'pending'`,
      [tenantId, campaignId],
    );

    return {
      campaign_id: campaignId,
      total_allocated: sums.total_allocated,
      total_spent: sums.total_spent,
      published_content_count: Number(pub.rows[0]?.c ?? 0),
      pending_approval_count: Number(pend.rows[0]?.c ?? 0),
    };
  });
}
