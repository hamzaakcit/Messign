/**
 * Competitor Intelligence — Dora Tool
 *
 * Lets users ask competitive intelligence questions via the Dora agent.
 * Queries the competitor event store and uses LLM to synthesize insights.
 */

import type { LLMParameterSchema, ToolRegistration } from '../../types.js';
import type { ToolContext, ToolResult } from '../../../services/ai/types.js';
import { resolveOrgIdForTool } from '../../../services/ai/tools/resolveOrgIdForTool.js';
import { query } from '../../../db/index.js';
import { callModelSafe } from '../../../services/ai/gateway.js';
import {
  listCompetitors,
  queryEvents,
  getRecentEvents,
  getSignificantEvents,
  getCompetitorEventCounts,
} from '../../../services/marketing/competitorService.js';
import type { Competitor, CompetitorEvent, EventType } from '../../../services/marketing/competitorService.js';
import {
  buildActivitySummaryPrompt,
  buildCompetitiveSummaryPrompt,
  buildTrendAnalysisPrompt,
  timeRangeToDate,
  formatTimeRange,
} from '../../../services/marketing/competitorAnalysisPrompts.js';

const db = { query };

type QueryType = 'competitor_activity' | 'event_search' | 'competitive_summary' | 'trend_analysis';

const VALID_QUERY_TYPES: QueryType[] = ['competitor_activity', 'event_search', 'competitive_summary', 'trend_analysis'];

async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  tenantId: string,
  tier: 'fast' | 'complex' = 'fast',
  maxTokens = 500,
): Promise<string> {
  const res = await callModelSafe({
    tier,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    tenantId,
    maxTokens,
    temperature: 0.2,
  });
  return res.choices?.[0]?.message?.content?.trim() ?? '';
}

async function resolveCompetitorByName(
  name: string,
  organizationId: string,
): Promise<Competitor | null> {
  const { competitors } = await listCompetitors(organizationId, { includeInactive: false, limit: 100 }, db);
  const lower = name.toLowerCase();
  return competitors.find((c) => c.name.toLowerCase() === lower)
    || competitors.find((c) => c.name.toLowerCase().includes(lower))
    || competitors.find((c) => lower.includes(c.name.toLowerCase()))
    || null;
}

async function handleCompetitorActivity(
  organizationId: string,
  competitorName: string | undefined,
  sinceDate: string,
  timeLabel: string,
): Promise<ToolResult> {
  if (competitorName) {
    const competitor = await resolveCompetitorByName(competitorName, organizationId);
    if (!competitor) {
      return { success: false, data: null, summary: `No competitor found matching "${competitorName}". Use the competitor_intelligence tool without a competitor_name to see all competitors.` };
    }

    const { events } = await queryEvents(organizationId, { competitorId: competitor.id, since: sinceDate, limit: 50 }, db);
    if (events.length === 0) {
      return { success: true, data: { competitor: competitor.name, events: [] }, summary: `No activity found for ${competitor.name} in the ${timeLabel}.` };
    }

    const prompt = buildActivitySummaryPrompt(competitor, events, timeLabel);
    const analysis = await callLLM(prompt.systemPrompt, prompt.userPrompt, organizationId);

    return {
      success: true,
      data: { competitor: competitor.name, eventCount: events.length, events: events.slice(0, 10) },
      summary: analysis || formatEventsFallback(events, competitor.name, timeLabel),
      metadata: { source: 'competitor_events', count: events.length, timeRange: timeLabel },
    };
  }

  const recentEvents = await getRecentEvents(organizationId, 20, db);
  const counts = await getCompetitorEventCounts(organizationId, sinceDate, db);

  if (recentEvents.length === 0) {
    return { success: true, data: { events: [] }, summary: `No competitor activity found in the ${timeLabel}.` };
  }

  const countSummary = counts.map((c) => `${c.competitor_name}: ${c.event_count} events`).join(', ');
  const eventLines = recentEvents.slice(0, 10).map(
    (e) => `- [${e.event_type}] ${e.title} (${e.event_date || e.discovered_at?.slice(0, 10) || '?'})`,
  ).join('\n');

  return {
    success: true,
    data: { counts, events: recentEvents.slice(0, 10) },
    summary: `Competitor activity in the ${timeLabel}:\n\n${countSummary}\n\nRecent events:\n${eventLines}`,
    metadata: { source: 'competitor_events', count: recentEvents.length, timeRange: timeLabel },
  };
}

async function handleEventSearch(
  organizationId: string,
  competitorName: string | undefined,
  sinceDate: string,
  timeLabel: string,
  eventTypes: string[] | undefined,
): Promise<ToolResult> {
  let competitorId: string | undefined;
  if (competitorName) {
    const competitor = await resolveCompetitorByName(competitorName, organizationId);
    if (!competitor) {
      return { success: false, data: null, summary: `No competitor found matching "${competitorName}".` };
    }
    competitorId = competitor.id;
  }

  const eventType = (eventTypes?.length === 1 ? eventTypes[0] : undefined) as EventType | undefined;
  const { events, total } = await queryEvents(organizationId, {
    competitorId,
    eventType,
    since: sinceDate,
    limit: 20,
  }, db);

  if (events.length === 0) {
    return { success: true, data: { events: [] }, summary: `No events found matching your filters in the ${timeLabel}.` };
  }

  const lines = events.map(
    (e) => `- **${e.title}** [${e.event_type}] (${e.event_date || e.discovered_at?.slice(0, 10) || '?'})${e.summary ? `\n  ${e.summary}` : ''}`,
  ).join('\n');

  return {
    success: true,
    data: { events, total },
    summary: `Found ${total} events (showing ${events.length}):\n\n${lines}`,
    metadata: { source: 'competitor_events', count: total, timeRange: timeLabel },
  };
}

async function handleCompetitiveSummary(
  organizationId: string,
  sinceDate: string,
  timeLabel: string,
): Promise<ToolResult> {
  const { competitors } = await listCompetitors(organizationId, { includeInactive: false, limit: 50 }, db);
  if (competitors.length === 0) {
    return { success: true, data: null, summary: 'No competitors are being tracked yet. Add competitors first.' };
  }

  const { events } = await queryEvents(organizationId, { since: sinceDate, limit: 100 }, db);

  const prompt = buildCompetitiveSummaryPrompt(competitors, events, timeLabel);
  const analysis = await callLLM(prompt.systemPrompt, prompt.userPrompt, organizationId, 'complex', 800);

  if (!analysis) {
    const significant = await getSignificantEvents(organizationId, sinceDate, db);
    const fallback = significant.length > 0
      ? `${significant.length} significant competitive events in the ${timeLabel}:\n${significant.slice(0, 5).map((e) => `- ${e.title}`).join('\n')}`
      : `Tracking ${competitors.length} competitors but no significant activity in the ${timeLabel}.`;
    return { success: true, data: { competitors: competitors.length, events: events.length }, summary: fallback };
  }

  return {
    success: true,
    data: { competitors: competitors.length, events: events.length },
    summary: analysis,
    metadata: { source: 'competitor_events, competitors', count: events.length, timeRange: timeLabel },
  };
}

async function handleTrendAnalysis(
  organizationId: string,
  sinceDate: string,
  timeLabel: string,
): Promise<ToolResult> {
  const { events } = await queryEvents(organizationId, { since: sinceDate, limit: 200 }, db);
  if (events.length < 3) {
    return { success: true, data: null, summary: `Not enough competitor data for trend analysis (${events.length} events). Need at least a few events to identify patterns.` };
  }

  const prompt = buildTrendAnalysisPrompt(events, timeLabel);
  const analysis = await callLLM(prompt.systemPrompt, prompt.userPrompt, organizationId);

  return {
    success: true,
    data: { eventCount: events.length },
    summary: analysis || `Analyzed ${events.length} events but could not generate trend insights.`,
    metadata: { source: 'competitor_events', count: events.length, timeRange: timeLabel },
  };
}

function formatEventsFallback(events: CompetitorEvent[], competitorName: string, timeLabel: string): string {
  const typeCounts: Record<string, number> = {};
  for (const e of events) {
    typeCounts[e.event_type] = (typeCounts[e.event_type] || 0) + 1;
  }
  const breakdown = Object.entries(typeCounts).map(([t, c]) => `${c} ${t.replace(/_/g, ' ')}${c > 1 ? 's' : ''}`).join(', ');
  return `In the ${timeLabel}, ${competitorName} had ${events.length} events: ${breakdown}.`;
}

// ── Tool Registration ──

export const competitorIntelligence: ToolRegistration = {
  name: 'marketing:competitor_intelligence',
  namespace: 'marketing',
  summary: 'Query competitive intelligence: competitor activity, event search, landscape summary, trend analysis.',
  tags: ['marketing', 'competitor', 'intelligence', 'analysis'],
  requiredRoles: ['manager', 'admin'],
  deferLoaded: true,
  parameterHints: 'query_type: string, competitor_name?: string, time_range?: string, event_types?: string[], question?: string',

  llmSchema: {
    type: 'function',
    function: {
      name: 'marketing:competitor_intelligence',
      description: `Query competitive intelligence data. Use when users ask about competitors, what competitors are doing, competitive landscape, or market movements. Supports questions like "What has [competitor] launched?", "Show me recent competitor activity", "Compare our positioning vs [competitor]", "What are competitors doing in [area]?".`,
      parameters: {
        type: 'object',
        properties: {
          query_type: {
            type: 'string',
            enum: ['competitor_activity', 'event_search', 'competitive_summary', 'trend_analysis'],
            description: 'Type of competitive intelligence query.',
          },
          competitor_name: {
            type: 'string',
            description: 'Name of a specific competitor (optional — omit for all competitors).',
          },
          time_range: {
            type: 'string',
            enum: ['last_week', 'last_month', 'last_quarter', 'last_year'],
            description: 'Time range for the query (default: last_month).',
          },
          event_types: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by event types: blog_post, product_launch, pricing_change, feature_update, partnership, funding, etc.',
          },
          question: {
            type: 'string',
            description: "The user's natural language question for context.",
          },
        },
        required: ['query_type'],
      } as LLMParameterSchema,
    },
  },

  handler: async (args, ctx): Promise<ToolResult> => {
    const organizationId = await resolveOrgIdForTool(ctx);
    if (!organizationId) return { success: false, data: null, summary: 'Organization not found.' };

    const queryType = (typeof args.query_type === 'string' ? args.query_type : 'competitor_activity') as QueryType;
    if (!VALID_QUERY_TYPES.includes(queryType)) {
      return { success: false, data: null, summary: `Invalid query_type "${queryType}". Use: ${VALID_QUERY_TYPES.join(', ')}.` };
    }

    const competitorName = typeof args.competitor_name === 'string' ? args.competitor_name.trim() : undefined;
    const timeRange = typeof args.time_range === 'string' ? args.time_range : 'last_month';
    const eventTypes = Array.isArray(args.event_types) ? args.event_types.filter((t): t is string => typeof t === 'string') : undefined;

    const sinceDate = timeRangeToDate(timeRange);
    const timeLabel = formatTimeRange(timeRange);

    try {
      switch (queryType) {
        case 'competitor_activity':
          return await handleCompetitorActivity(organizationId, competitorName, sinceDate, timeLabel);
        case 'event_search':
          return await handleEventSearch(organizationId, competitorName, sinceDate, timeLabel, eventTypes);
        case 'competitive_summary':
          return await handleCompetitiveSummary(organizationId, sinceDate, timeLabel);
        case 'trend_analysis':
          return await handleTrendAnalysis(organizationId, sinceDate, timeLabel);
      }
    } catch (err) {
      console.error('[competitorIntelligenceTool] Handler error:', err);
      return { success: false, data: null, summary: 'Failed to query competitive intelligence data.' };
    }
  },
};
