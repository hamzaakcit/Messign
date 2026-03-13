import { registerTool } from '../../toolRegistry.js';
import { query } from '../../../../db/index.js';
import type { ToolContext, ToolResult } from '../../types.js';
import type { CallerContext } from '../../../../dal/types.js';
import * as marketingMetrics from '../../../../dal/marketing/metrics.js';

function buildCtx(ctx: ToolContext, organizationId?: string): CallerContext {
  return {
    userId: ctx.userId,
    role: (ctx.userRole ?? 'employee') as CallerContext['role'],
    organizationId,
  };
}

async function resolveOrgId(): Promise<string | undefined> {
  const result = await query<{ id: string }>(
    'SELECT id FROM organizations WHERE slug = $1 LIMIT 1',
    ['messign'],
  );
  return result.rows[0]?.id;
}

registerTool({
  name: 'marketing:get_campaign_performance',
  metadata: {
    namespace: 'marketing',
    name: 'get_campaign_performance',
    summary: 'Campaign performance: spend, ROI, conversions, channel metrics.',
    tags: ['marketing', 'campaign', 'roi', 'performance'],
    alwaysLoaded: false,
    parameterHints: 'campaign_id?: string, time_period?: string',
  },
  category: 'analytics',
  description: 'Get marketing campaign performance metrics including ROI, leads generated, and spend.',
  parameters: {
    type: 'object',
    properties: {
      campaignName: { type: 'string', description: 'Optional campaign name for fuzzy matching.' },
      status: { type: 'string', description: 'Optional campaign status filter.' },
      channel: { type: 'string', description: 'Optional channel filter.' },
    },
    required: [],
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const organizationId = await resolveOrgId();
    if (!organizationId) {
      return { success: false, data: null, summary: 'Organization not found.' };
    }

    const conditions = ['c.organization_id = $1::uuid'];
    const params: unknown[] = [organizationId];
    let idx = 2;
    if (typeof args.status === 'string' && args.status) {
      conditions.push(`c.status = $${idx++}`);
      params.push(args.status);
    }
    if (typeof args.channel === 'string' && args.channel) {
      conditions.push(`c.channel = $${idx++}`);
      params.push(args.channel);
    }
    if (typeof args.campaignName === 'string' && args.campaignName.trim()) {
      conditions.push(`c.name ILIKE $${idx++}`);
      params.push(`%${args.campaignName.trim()}%`);
    }

    const result = await query<Record<string, unknown>>(
      `SELECT
         c.id::text AS campaign_id,
         c.name,
         c.channel,
         c.status,
         c.budget_eur::text AS budget,
         c.actual_spend_eur::text AS spend,
         c.leads_generated::text,
         COALESCE(m.cost_per_lead, 0)::text AS cost_per_lead,
         COALESCE(m.deals_created, 0)::text AS deals_created,
         COALESCE(m.deal_value, 0)::text AS deal_value,
         COALESCE(m.roi_multiplier, 0)::text AS roi_multiplier,
         c.start_date::text,
         c.end_date::text
       FROM marketing_campaigns c
       LEFT JOIN mv_marketing_roi m ON m.campaign_id = c.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY COALESCE(m.roi_multiplier, 0) DESC, c.name ASC
       LIMIT 10`,
      params,
    );

    if (result.rows.length === 0) {
      return { success: true, data: [], summary: 'No matching marketing campaigns found.' };
    }

    const items = result.rows.map((row) => ({
      campaignId: row.campaign_id,
      name: row.name,
      channel: row.channel,
      status: row.status,
      budget: Number(row.budget ?? 0),
      spend: Number(row.spend ?? 0),
      leadsGenerated: Number(row.leads_generated ?? 0),
      costPerLead: Number(row.cost_per_lead ?? 0),
      dealsCreated: Number(row.deals_created ?? 0),
      dealValue: Number(row.deal_value ?? 0),
      roiMultiplier: Number(row.roi_multiplier ?? 0),
      startDate: row.start_date,
      endDate: row.end_date,
    }));

    const summary = items
      .slice(0, 5)
      .map((item) => `${item.name}: ROI ${item.roiMultiplier.toFixed(2)}x, ${item.leadsGenerated} leads, €${item.spend.toLocaleString()} spend`)
      .join('\n');

    return {
      success: true,
      data: items,
      summary,
      metadata: { source: 'mv_marketing_roi, marketing_campaigns', count: items.length },
    };
  },
});

registerTool({
  name: 'marketing:get_marketing_roi',
  metadata: {
    namespace: 'marketing',
    name: 'get_marketing_roi',
    summary: 'Marketing ROI: CAC, CPL, MQL, revenue attribution.',
    tags: ['marketing', 'roi', 'analytics'],
    alwaysLoaded: false,
    parameterHints: 'time_period?: string',
  },
  category: 'analytics',
  description: 'Get overall marketing ROI, channel performance comparison, and cost per lead analysis.',
  parameters: {
    type: 'object',
    properties: {
      period: {
        type: 'string',
        description: 'Optional period: month, quarter, or year.',
        enum: ['month', 'quarter', 'year'],
      },
    },
    required: [],
  },
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const organizationId = await resolveOrgId();
    if (!organizationId) {
      return { success: false, data: null, summary: 'Organization not found.' };
    }

    const callerCtx = buildCtx(ctx, organizationId);
    const period = typeof args.period === 'string' ? args.period : undefined;
    const [dashboard, channels] = await Promise.all([
      marketingMetrics.getDashboardMetrics(callerCtx, period),
      marketingMetrics.getChannelPerformance(callerCtx, period),
    ]);

    const channelLines = channels
      .slice(0, 5)
      .map((item) => `${item.channel}: €${item.spend.toLocaleString()} spend, ${item.leads} leads, CPL €${item.cpl.toFixed(2)}, ROI ${item.roi.toFixed(2)}x`)
      .join('\n');

    return {
      success: true,
      data: { dashboard, channels },
      summary: `Marketing ROI${period ? ` (${period})` : ''}:\nTotal spend: €${dashboard.totalSpend.toLocaleString()}\nTotal leads: ${dashboard.totalLeads}\nOverall CPL: €${dashboard.cpl.toFixed(2)}\nBest ROI: ${dashboard.roi.toFixed(2)}x\nActive campaigns: ${dashboard.activeCampaigns}\n\nBy channel:\n${channelLines || 'No channel data available.'}`,
      metadata: { source: 'marketing_campaigns, marketing_leads, marketing_email_campaigns', count: channels.length },
    };
  },
});

registerTool({
  name: 'marketing:suggest_content_topics',
  metadata: {
    namespace: 'marketing',
    name: 'suggest_content_topics',
    summary: 'Suggest content topics based on campaign performance and trends.',
    tags: ['marketing', 'content', 'suggestions'],
    alwaysLoaded: false,
    parameterHints: 'campaign_id?: string',
  },
  category: 'analytics',
  description: 'Suggest content topics based on trending support tickets, popular knowledge base articles, and sales conversation themes.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(): Promise<ToolResult> {
    const [supportTopics, knowledgeTopics, salesTopics] = await Promise.all([
      query<{ topic: string; count: string }>(
        `SELECT COALESCE(sc.name, 'General Support') AS topic, COUNT(*)::int AS count
         FROM support_tickets st
         LEFT JOIN support_categories sc ON sc.id = st.category_id
         WHERE st.created_at >= NOW() - INTERVAL '30 days'
         GROUP BY COALESCE(sc.name, 'General Support')
         ORDER BY COUNT(*) DESC, topic ASC
         LIMIT 5`,
      ),
      query<{ topic: string; count: string }>(
        `SELECT title AS topic, view_count::int AS count
         FROM knowledge_documents
         WHERE status = 'published'
         ORDER BY view_count DESC, published_at DESC NULLS LAST
         LIMIT 5`,
      ),
      query<{ topic: string; count: string }>(
        `SELECT
           COALESCE(NULLIF(subject, ''), split_part(title, ' - ', 1), 'Sales conversations') AS topic,
           COUNT(*)::int AS count
         FROM crm_activities a
         LEFT JOIN crm_deals d ON d.id = a.deal_id
         WHERE a.created_at >= NOW() - INTERVAL '30 days'
         GROUP BY COALESCE(NULLIF(subject, ''), split_part(title, ' - ', 1), 'Sales conversations')
         ORDER BY COUNT(*) DESC, topic ASC
         LIMIT 5`,
      ),
    ]);

    const suggestions = [
      ...supportTopics.rows.map((row) => ({
        topic: `${row.topic}: common customer pain points`,
        reasoning: `${row.count} recent support tickets reference this topic.`,
        recommendedType: 'blog',
      })),
      ...knowledgeTopics.rows.map((row) => ({
        topic: `${row.topic}: expand into a campaign asset`,
        reasoning: `${row.count} document views suggest strong existing interest.`,
        recommendedType: 'case_study',
      })),
      ...salesTopics.rows.map((row) => ({
        topic: `${row.topic}: objections and buying signals`,
        reasoning: `${row.count} recent CRM activities mention this theme.`,
        recommendedType: 'webinar',
      })),
    ].slice(0, 5);

    const summary = suggestions
      .map((item, index) => `${index + 1}. ${item.topic} (${item.recommendedType}) — ${item.reasoning}`)
      .join('\n');

    return {
      success: true,
      data: suggestions,
      summary: summary || 'Not enough cross-module activity was found to suggest content topics right now.',
      metadata: { source: 'support_tickets, knowledge_documents, crm_activities', count: suggestions.length },
    };
  },
});
