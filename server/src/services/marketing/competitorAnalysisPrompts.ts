/**
 * Competitor Analysis — LLM Prompt Templates
 *
 * Turn raw event data into actionable competitive intelligence.
 * Used by the Dora tool and post-scrape enrichment.
 */

import type { CompetitorEvent, Competitor } from './competitorService.js';

export function buildActivitySummaryPrompt(
  competitor: Competitor,
  events: CompetitorEvent[],
  timeRange: string,
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are a competitive intelligence analyst. Summarize competitor activity concisely.

Format: Start with a 1-sentence overview, then bullet points for key events.
Be specific: include dates, product names, and numbers when available.
End with a "So what?" section: 1-2 sentences on what this means for us.
Keep it under 300 words.`;

  const eventList = events
    .slice(0, 20)
    .map((e) => `- [${e.event_type}] ${e.title} (${e.event_date || e.discovered_at?.slice(0, 10) || 'unknown date'})${e.summary ? `: ${e.summary}` : ''}`)
    .join('\n');

  const userPrompt = `Summarize ${competitor.name}'s activity in the ${timeRange}:

${eventList || 'No events found in this period.'}

Competitor profile:
- Industry: ${competitor.industry || 'Technology'}
- Tier: ${competitor.tier}
- Website: ${competitor.website_url || 'unknown'}`;

  return { systemPrompt, userPrompt };
}

export function buildCompetitiveSummaryPrompt(
  competitors: Competitor[],
  allEvents: CompetitorEvent[],
  timeRange: string,
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are a competitive intelligence analyst providing a strategic briefing.

Structure your response as:
1. **Landscape Overview** (2-3 sentences): What's the overall competitive picture?
2. **Key Moves** (bullet points): The most significant events across all competitors
3. **Threats** (1-2 bullets): What should we be concerned about?
4. **Opportunities** (1-2 bullets): Where are competitors weak or where are gaps?
5. **Recommendation** (1-2 sentences): What should we do in response?

Be concrete and actionable. Reference specific competitors and events.
Keep it under 500 words.`;

  const byCompetitor = competitors.map((c) => {
    const events = allEvents.filter((e) => e.competitor_id === c.id);
    return {
      name: c.name,
      tier: c.tier,
      eventCount: events.length,
      highSignificance: events.filter((e) => e.significance === 'high' || e.significance === 'critical'),
      recentEvents: events.slice(0, 5).map((e) => `[${e.event_type}] ${e.title}`),
    };
  }).filter((c) => c.eventCount > 0);

  const competitorSections = byCompetitor.map((c) => {
    const keyMoves = c.highSignificance.length > 0
      ? `Key moves:\n${c.highSignificance.map((e) => `- ${e.title}: ${e.summary || ''}`).join('\n')}`
      : 'No major moves.';
    return `## ${c.name} (${c.tier} competitor) — ${c.eventCount} events\n${keyMoves}\nRecent: ${c.recentEvents.join(', ')}`;
  }).join('\n\n');

  const userPrompt = `Provide a competitive landscape briefing for the ${timeRange}:

${competitorSections}

${byCompetitor.length === 0 ? 'No competitor activity detected in this period.' : ''}`;

  return { systemPrompt, userPrompt };
}

export function buildTrendAnalysisPrompt(
  events: CompetitorEvent[],
  timeRange: string,
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are a market intelligence analyst identifying trends.

Analyze the competitor events and identify:
1. **Emerging Trends** (2-3): What patterns do you see? (e.g., "3 of 5 competitors launched AI features")
2. **Market Shifts**: Any pricing changes, new market segments, or strategic pivots?
3. **Technology Trends**: What technologies are competitors investing in?
4. **Content Trends**: What topics are competitors writing about most?

Be data-driven: reference specific counts and percentages.
Keep it under 400 words.`;

  const tagCounts: Record<string, number> = {};
  const typeCounts: Record<string, number> = {};
  for (const event of events) {
    for (const tag of event.tags || []) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
    typeCounts[event.event_type] = (typeCounts[event.event_type] || 0) + 1;
  }

  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => `${tag} (${count})`);

  const typeBreakdown = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${type}: ${count}`);

  const significantEvents = events
    .filter((e) => e.significance === 'high' || e.significance === 'critical')
    .slice(0, 10)
    .map((e) => `- [${e.event_type}] ${e.title}${e.tags?.length ? ` (tags: ${e.tags.join(', ')})` : ''}`);

  const userPrompt = `Analyze trends from ${events.length} competitor events in the ${timeRange}:

Event type breakdown: ${typeBreakdown.join(', ')}
Top topics/tags: ${topTags.join(', ') || 'none tagged'}

Significant events:
${significantEvents.join('\n') || 'None flagged as high significance.'}`;

  return { systemPrompt, userPrompt };
}

export function buildEventAnalysisPrompt(
  event: CompetitorEvent,
  competitor: Competitor,
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are a competitive intelligence analyst. Provide a deep analysis of this competitor event.

Structure:
1. **What happened**: 1-2 sentence factual summary
2. **Why it matters**: Strategic implications for us
3. **Recommended response**: What should we consider doing?

Be concise (under 200 words) and actionable.`;

  const userPrompt = `Analyze this event from ${competitor.name}:

Type: ${event.event_type}
Title: ${event.title}
Summary: ${event.summary || 'N/A'}
${event.body_text ? `Full text: ${event.body_text.slice(0, 2000)}` : ''}
Date: ${event.event_date || event.discovered_at}
Significance: ${event.significance}

Competitor context:
- ${competitor.name} is a ${competitor.tier} competitor in ${competitor.industry || 'our market'}`;

  return { systemPrompt, userPrompt };
}

// ── Time Range Helpers ──

export function timeRangeToDate(range: string): string {
  const now = new Date();
  switch (range) {
    case 'last_week': now.setDate(now.getDate() - 7); break;
    case 'last_month': now.setDate(now.getDate() - 30); break;
    case 'last_quarter': now.setDate(now.getDate() - 90); break;
    case 'last_year': now.setDate(now.getDate() - 365); break;
    default: now.setDate(now.getDate() - 30);
  }
  return now.toISOString();
}

export function formatTimeRange(range: string): string {
  const labels: Record<string, string> = {
    last_week: 'past week',
    last_month: 'past month',
    last_quarter: 'past quarter',
    last_year: 'past year',
  };
  return labels[range] || 'past month';
}
