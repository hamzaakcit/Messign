/**
 * Per-channel marketing budget allocations (workspace-scoped).
 */
import type { PoolClient } from 'pg';
import { withTenantQuery } from '../../middleware/tenantContext.js';
import type { CallerContext } from '../types.js';

export interface BudgetAllocationRow {
  id: string;
  workspace_id: string;
  campaign_id: string;
  channel: string;
  allocated_amount: number;
  spent_amount: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

function mapRow(row: Record<string, unknown>): BudgetAllocationRow {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    campaign_id: String(row.campaign_id),
    channel: String(row.channel),
    allocated_amount: Number(row.allocated_amount ?? 0),
    spent_amount: Number(row.spent_amount ?? 0),
    currency: String(row.currency ?? 'EUR'),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listAllocationsForCampaign(
  ctx: CallerContext,
  campaignId: string,
): Promise<BudgetAllocationRow[]> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required');

  return withTenantQuery(tenantId, async (client: PoolClient) => {
    const r = await client.query(
      `SELECT * FROM marketing_budget_allocations
       WHERE workspace_id = $1 AND campaign_id = $2
       ORDER BY channel`,
      [tenantId, campaignId],
    );
    return r.rows.map((row) => mapRow(row as Record<string, unknown>));
  });
}

/** Upsert allocation row (used inside a larger transaction from campaignManagerTools). */
export async function upsertBudgetAllocation(
  client: PoolClient,
  workspaceId: string,
  campaignId: string,
  channel: string,
  allocatedAmount: number,
  currency: string,
): Promise<BudgetAllocationRow> {
  const r = await client.query(
    `INSERT INTO marketing_budget_allocations (
       workspace_id, campaign_id, channel, allocated_amount, spent_amount, currency, updated_at
     )
     VALUES ($1, $2, $3, $4, 0, $5, NOW())
     ON CONFLICT (workspace_id, campaign_id, channel)
     DO UPDATE SET
       allocated_amount = EXCLUDED.allocated_amount,
       currency = EXCLUDED.currency,
       updated_at = NOW()
     RETURNING *`,
    [workspaceId, campaignId, channel, allocatedAmount, currency.toUpperCase()],
  );
  return mapRow(r.rows[0] as Record<string, unknown>);
}

export async function sumAllocationsByCampaign(
  client: PoolClient,
  workspaceId: string,
  campaignId: string,
): Promise<{ total_allocated: number; total_spent: number }> {
  const r = await client.query<{ s_alloc: string; s_spent: string }>(
    `SELECT
       COALESCE(SUM(allocated_amount), 0)::numeric AS s_alloc,
       COALESCE(SUM(spent_amount), 0)::numeric AS s_spent
     FROM marketing_budget_allocations
     WHERE workspace_id = $1 AND campaign_id = $2`,
    [workspaceId, campaignId],
  );
  const row = r.rows[0];
  return {
    total_allocated: Number(row?.s_alloc ?? 0),
    total_spent: Number(row?.s_spent ?? 0),
  };
}
