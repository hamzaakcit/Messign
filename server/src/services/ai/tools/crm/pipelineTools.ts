import { registerTool } from '../../toolRegistry.js';
import { query } from '../../../../db/index.js';
import * as dealsDal from '../../../../dal/crm/deals.js';
import * as forecastDal from '../../../../dal/crm/forecast.js';
import * as activitiesDal from '../../../../dal/crm/activities.js';
import type { ToolContext, ToolResult } from '../../types.js';
import type { CallerContext } from '../../../../dal/types.js';

function buildCtx(ctx: ToolContext): CallerContext {
  return {
    userId: ctx.userId,
    role: (ctx.userRole ?? 'employee') as CallerContext['role'],
    organizationId: undefined,
  };
}

async function resolveOrgId(): Promise<string | undefined> {
  const res = await query<{ id: string }>('SELECT id FROM organizations WHERE slug = $1', ['messign']);
  return res.rows[0]?.id;
}

async function getDefaultPipelineId(orgId: string): Promise<string | undefined> {
  const res = await query<{ id: string }>(
    'SELECT id FROM crm_pipelines WHERE organization_id = $1 AND is_default = true LIMIT 1',
    [orgId],
  );
  return res.rows[0]?.id;
}

// ─── Tool 1: get_pipeline_status ─────────────────────────────

registerTool({
  name: 'get_pipeline_status',
  category: 'finance',
  description:
    'Get the current status of the sales pipeline including deal counts and values by stage, plus overall sales metrics (total pipeline, weighted pipeline, win rate, avg deal size, avg cycle time).',
  parameters: {
    type: 'object',
    properties: {
      period: {
        type: 'string',
        description: 'Time period for metrics: "month", "quarter", "year". Default: month.',
        enum: ['month', 'quarter', 'year'],
      },
    },
    required: [],
  },
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const orgId = await resolveOrgId();
    if (!orgId) return { success: false, data: null, summary: 'Organization not found.' };

    const pipelineId = await getDefaultPipelineId(orgId);
    if (!pipelineId) return { success: false, data: null, summary: 'No default pipeline found.' };

    const callerCtx = { ...buildCtx(ctx), organizationId: orgId };
    const period = (args.period as string) ?? 'month';

    const [dealsByStage, metrics] = await Promise.all([
      dealsDal.getDealsByStage(callerCtx, pipelineId),
      dealsDal.getSalesMetrics(callerCtx, period),
    ]);

    const stageEntries = Object.entries(dealsByStage).map(([stageId, deals]) => {
      const total = deals.reduce((s, d) => s + Number(d.amount), 0);
      const weighted = deals.reduce((s, d) => s + Number(d.amount) * Number(d.probability) / 100, 0);
      const stageName = deals[0]?.stage_name ?? stageId;
      return { stageName, dealCount: deals.length, totalValue: total, weightedValue: weighted };
    });

    const stageLines = stageEntries
      .map(s => `${s.stageName}: ${s.dealCount} deals, €${s.totalValue.toLocaleString()} (weighted: €${s.weightedValue.toLocaleString()})`)
      .join('\n');

    return {
      success: true,
      data: { stages: stageEntries, metrics },
      summary: `Sales Pipeline Status (${period}):\n${stageLines}\n\nOverall Metrics:\nTotal Pipeline: €${metrics.totalPipeline.toLocaleString()}\nWeighted Pipeline: €${metrics.weightedPipeline.toLocaleString()}\nDeals Won: ${metrics.dealsWon}\nWin Rate: ${metrics.winRate.toFixed(1)}%\nAvg Deal Size: €${metrics.avgDealSize.toLocaleString()}\nAvg Sales Cycle: ${metrics.avgCycleTime.toFixed(0)} days`,
      metadata: { source: 'crm_deals, crm_deal_stages', count: stageEntries.length },
    };
  },
});

// ─── Tool 2: get_deal_details ────────────────────────────────

registerTool({
  name: 'get_deal_details',
  category: 'finance',
  description:
    'Get detailed information about a specific deal including stage, company, contact, amount, probability, dora score, and stage history. Search by deal ID or deal title (fuzzy match).',
  parameters: {
    type: 'object',
    properties: {
      dealId: { type: 'string', description: 'The UUID of the deal.' },
      dealTitle: { type: 'string', description: 'The title of the deal for fuzzy search.' },
    },
    required: [],
  },
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const orgId = await resolveOrgId();
    if (!orgId) return { success: false, data: null, summary: 'Organization not found.' };
    const callerCtx = { ...buildCtx(ctx), organizationId: orgId };

    let deal: dealsDal.Deal | null = null;

    if (args.dealId) {
      deal = await dealsDal.getDealById(callerCtx, args.dealId as string);
    } else if (args.dealTitle) {
      const title = args.dealTitle as string;
      const result = await dealsDal.listDeals(callerCtx, { search: title }, undefined, 1, 1);
      deal = result.data[0] ?? null;
    }

    if (!deal) return { success: true, data: null, summary: 'Deal not found.' };

    const history = await dealsDal.getDealHistory(deal.id);

    const historyText = history.length > 0
      ? history.map(h => `${h.to_stage_name} (${new Date(h.moved_at).toLocaleDateString()}${h.time_in_previous_stage_hours ? ` — ${Math.round(h.time_in_previous_stage_hours / 24)}d in prev stage` : ''})`).join(' → ')
      : 'No stage transitions yet.';

    return {
      success: true,
      data: { deal, history },
      summary: `Deal: ${deal.title}\nStage: ${(deal as any).stage_name ?? deal.stage_id}\nAmount: €${Number(deal.amount).toLocaleString()} ${deal.currency}\nProbability: ${deal.probability}%\nCompany: ${(deal as any).company_name ?? 'N/A'}\nContact: ${(deal as any).contact_name ?? 'N/A'}\nOwner: ${(deal as any).owner_name ?? deal.owner_id}\nExpected Close: ${deal.expected_close_date ?? 'Not set'}\nDora Score: ${deal.dora_score ?? 'N/A'}\nDora Next Action: ${deal.dora_next_action ?? 'N/A'}\nStage History: ${historyText}\nCreated: ${new Date(deal.created_at).toLocaleDateString()}`,
      metadata: { source: 'crm_deals, crm_deal_stage_history', count: 1 },
    };
  },
});

// ─── Tool 3: get_sales_forecast ──────────────────────────────

registerTool({
  name: 'get_sales_forecast',
  category: 'finance',
  description:
    'Get the sales forecast showing weighted pipeline, best/worst case scenarios, and breakdown by stage. Includes a narrative analysis for AI to summarize.',
  parameters: {
    type: 'object',
    properties: {
      period: {
        type: 'string',
        description: 'Time period: "month", "quarter", "year". Default: quarter.',
        enum: ['month', 'quarter', 'year'],
      },
    },
    required: [],
  },
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const orgId = await resolveOrgId();
    if (!orgId) return { success: false, data: null, summary: 'Organization not found.' };

    const pipelineId = await getDefaultPipelineId(orgId);
    if (!pipelineId) return { success: false, data: null, summary: 'No default pipeline found.' };

    const callerCtx = { ...buildCtx(ctx), organizationId: orgId };
    const period = (args.period as string) ?? 'quarter';

    const [forecast, metrics, owners] = await Promise.all([
      forecastDal.getPipelineForecast(callerCtx, pipelineId),
      dealsDal.getSalesMetrics(callerCtx, period),
      forecastDal.getForecastByOwner(callerCtx, pipelineId),
    ]);

    const wonValue = metrics.dealsWon * metrics.avgDealSize;

    const stageLines = forecast.stages
      .map(s => `${s.stage_name}: ${s.deal_count} deals, €${Number(s.total_value).toLocaleString()} (weighted: €${Number(s.weighted_value).toLocaleString()})`)
      .join('\n');

    const ownerLines = owners
      .map(o => `${o.owner_name}: ${o.deal_count} deals, €${Number(o.total_value).toLocaleString()} pipeline`)
      .join('\n');

    return {
      success: true,
      data: { forecast, metrics, owners },
      summary: `Sales Forecast (${period}):\nTotal Pipeline: €${Number(forecast.total_value).toLocaleString()} (${forecast.total_deals} deals)\nWeighted Forecast: €${Number(forecast.weighted_value).toLocaleString()}\nWon So Far: €${wonValue.toLocaleString()} (${metrics.dealsWon} deals)\nBest Case: €${Number(forecast.total_value).toLocaleString()}\n\nBy Stage:\n${stageLines}\n\nBy Owner:\n${ownerLines}`,
      metadata: { source: 'crm_deals, crm_deal_stages, crm_pipelines', count: forecast.total_deals },
    };
  },
});

// ─── Tool 4: get_activity_gaps ───────────────────────────────

registerTool({
  name: 'get_activity_gaps',
  category: 'finance',
  description:
    'Find deals that have had no activity logged in the last 10 days and may need follow-up. Returns stale deals with their owner, stage, and amount.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const orgId = await resolveOrgId();
    if (!orgId) return { success: false, data: null, summary: 'Organization not found.' };

    const callerCtx = { ...buildCtx(ctx), organizationId: orgId };
    const gaps = await activitiesDal.getActivityGaps(callerCtx);

    if (gaps.length === 0) {
      return {
        success: true,
        data: [],
        summary: 'No stale deals found! All open deals have had recent activity within the last 10 days.',
        metadata: { source: 'crm_deals, crm_activities', count: 0 },
      };
    }

    const dealLines = gaps.slice(0, 10).map(d => {
      const daysSinceUpdate = Math.floor((Date.now() - new Date(d.updated_at).getTime()) / 86_400_000);
      return `• ${d.title} — €${Number(d.amount).toLocaleString()} (${(d as any).stage_name ?? 'Unknown stage'}) — Owner: ${(d as any).owner_name ?? d.owner_id} — ${daysSinceUpdate} days since last update`;
    }).join('\n');

    return {
      success: true,
      data: gaps,
      summary: `${gaps.length} stale deal(s) with no activity in 10+ days:\n${dealLines}`,
      metadata: { source: 'crm_deals, crm_activities', count: gaps.length },
    };
  },
});
