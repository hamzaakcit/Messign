import type { PoolClient } from 'pg';
import { withTenantQuery } from '../../../middleware/tenantContext.js';
import { eventBus } from '../../../events/index.js';
import type { CallerContext } from '../../../dal/types.js';

async function runInTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTenantQuery(tenantId, fn);
}

// ── Interfaces ──

export interface ForecastSummary {
  pipeline_id: string;
  pipeline_name: string;
  total_deals: number;
  total_value: number;
  weighted_value: number;
  stages: {
    stage_id: string;
    stage_name: string;
    deal_count: number;
    total_value: number;
    weighted_value: number;
  }[];
}

export interface OwnerForecast {
  owner_id: string;
  owner_name: string;
  deal_count: number;
  total_value: number;
  weighted_value: number;
}

// ── Functions ──

export async function getPipelineForecast(ctx: CallerContext, pipelineId: string): Promise<ForecastSummary> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getPipelineForecast');

  return runInTenant(tenantId, async (client) => {
    const pipelineResult = await client.query('SELECT name FROM crm_pipelines WHERE id = $1', [pipelineId]);
    if (!pipelineResult.rows[0]) throw new Error('Pipeline not found');

    const conditions = ['s.pipeline_id = $1', 's.is_won = false', 's.is_lost = false'];
    const dealConditions = ['d.stage_id = s.id'];
    const params: unknown[] = [pipelineId];

    const dealJoinCondition = dealConditions.join(' AND ');

    const stagesResult = await client.query(
      `SELECT s.id as stage_id, s.name as stage_name,
              COUNT(d.id)::int as deal_count,
              COALESCE(SUM(d.amount), 0)::numeric as total_value,
              COALESCE(SUM(d.amount * d.probability / 100.0), 0)::numeric as weighted_value
       FROM crm_deal_stages s
       LEFT JOIN crm_deals d ON ${dealJoinCondition}
       WHERE ${conditions.join(' AND ')}
       GROUP BY s.id, s.name, s.position
       ORDER BY s.position`,
      params,
    );

    const stages = stagesResult.rows as ForecastSummary['stages'];
    const totalDeals = stages.reduce((sum, s) => sum + s.deal_count, 0);
    const totalValue = stages.reduce((sum, s) => sum + Number(s.total_value), 0);
    const weightedValue = stages.reduce((sum, s) => sum + Number(s.weighted_value), 0);

    const forecast: ForecastSummary = {
      pipeline_id: pipelineId,
      pipeline_name: pipelineResult.rows[0].name,
      total_deals: totalDeals,
      total_value: totalValue,
      weighted_value: weightedValue,
      stages,
    };

    eventBus.emit('crm.forecast.updated', {
      pipelineId, totalValue, weightedValue, period: new Date().toISOString().slice(0, 7),
    });

    return forecast;
  });
}

export async function getForecastByOwner(
  ctx: CallerContext,
  pipelineId?: string,
): Promise<OwnerForecast[]> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getForecastByOwner');

  return runInTenant(tenantId, async (client) => {
    const conditions = ['s.is_won = false', 's.is_lost = false'];
    const params: unknown[] = [];
    let idx = 1;

    if (pipelineId) {
      conditions.push(`d.pipeline_id = $${idx++}`);
      params.push(pipelineId);
    }

    const result = await client.query(
      `SELECT
         d.owner_id,
         u.full_name as owner_name,
         COUNT(d.id)::int as deal_count,
         COALESCE(SUM(d.amount), 0)::numeric as total_value,
         COALESCE(SUM(d.amount * d.probability / 100.0), 0)::numeric as weighted_value
       FROM crm_deals d
       JOIN crm_deal_stages s ON s.id = d.stage_id
       LEFT JOIN reimbursement_users u ON u.id = d.owner_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY d.owner_id, u.full_name
       ORDER BY total_value DESC`,
      params,
    );

    return result.rows as OwnerForecast[];
  });
}
