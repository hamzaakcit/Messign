import { query } from '../../../db/index.js';
import * as doraInsights from '../../../dal/doraInsights.js';

async function getDealOrg(dealId: string): Promise<string | undefined> {
  const result = await query<{ organization_id: string }>(
    `SELECT organization_id::text AS organization_id
     FROM crm_deals
     WHERE id = $1
     LIMIT 1`,
    [dealId],
  );
  return result.rows[0]?.organization_id;
}

export async function onDealStale(payload: {
  dealId: string;
  title: string;
  daysSinceActivity: number;
  ownerId: string;
}) {
  const organizationId = await getDealOrg(payload.dealId);

  return doraInsights.createInsight({
    organizationId,
    module: 'sales',
    severity: 'warning',
    title: 'Deal needs attention',
    message: `"${payload.title}" has had no activity for ${payload.daysSinceActivity} days. Consider following up.`,
    actionUrl: `/crm?detail=${payload.dealId}`,
    actionLabel: 'View Deal',
    sourceEvent: 'crm.deal.stale',
    sourceEntityType: 'deal',
    sourceEntityId: payload.dealId,
    targetUserId: payload.ownerId,
    metadata: {
      daysSinceActivity: payload.daysSinceActivity,
    },
  });
}

export async function onDealWon(payload: { dealId: string; amount: number; ownerId: string }) {
  const organizationId = await getDealOrg(payload.dealId);

  return doraInsights.createInsight({
    organizationId,
    module: 'sales',
    severity: 'success',
    title: 'Deal closed!',
    message: `Deal worth €${payload.amount.toLocaleString()} has been won. Invoice draft has been auto-created.`,
    actionUrl: `/crm?detail=${payload.dealId}`,
    actionLabel: 'View Deal',
    sourceEvent: 'crm.deal.won',
    sourceEntityType: 'deal',
    sourceEntityId: payload.dealId,
    targetUserId: payload.ownerId,
  });
}
