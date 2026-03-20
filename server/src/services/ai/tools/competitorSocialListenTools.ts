/**
 * marketing:competitor_social_listen — public-signal adapter (heuristic + optional DB intel).
 * Rate-limited per organization per hour.
 */
import { query } from '../../../db/index.js';
import { registerTool } from '../toolRegistry.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';
import { resolveOrgIdForTool } from './resolveOrgIdForTool.js';

const MAX_CALLS_PER_ORG_PER_HOUR = 12;
const ONE_HOUR_MS = 60 * 60 * 1000;
const rateWindow = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(orgKey: string): boolean {
  const now = Date.now();
  const w = ONE_HOUR_MS;
  const cur = rateWindow.get(orgKey);
  if (!cur || now - cur.windowStart > w) {
    rateWindow.set(orgKey, { count: 1, windowStart: now });
    return true;
  }
  if (cur.count >= MAX_CALLS_PER_ORG_PER_HOUR) return false;
  cur.count += 1;
  return true;
}

const competitorSocialListenTool: Tool = {
  name: 'marketing:competitor_social_listen',
  category: 'analytics',
  metadata: {
    namespace: 'marketing',
    name: 'competitor_social_listen',
    summary: 'Public competitor signals from internal intel + lightweight web hints (rate-limited).',
    tags: ['marketing', 'competitor', 'research'],
    alwaysLoaded: false,
    parameterHints: 'competitor_name required; platforms?, keywords?, lookback_days?',
  },
  description: `Fetch recent public-facing signals for a competitor or topic for planning and research.

Not a replacement for official social APIs. Output mixes internal workspace competitor intel (when present) with heuristic placeholders. Always disclose limitations in summaries.`,

  parameters: {
    type: 'object',
    properties: {
      competitor_name: { type: 'string', description: 'Competitor or brand to monitor.' },
      platforms: {
        type: 'array',
        description: 'Optional focus channels: linkedin, twitter, youtube, or web.',
        items: { type: 'string' },
      },
      keywords: { type: 'array', items: { type: 'string' }, description: 'Extra search keywords.' },
      lookback_days: { type: 'number', description: 'Recency window (1–30 days).' },
    },
    required: ['competitor_name'],
  },

  requiredRoles: ['admin', 'manager', 'cpo'],

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const orgId = await resolveOrgIdForTool(context);
    if (!orgId) {
      return { success: false, data: null, summary: 'Organization not configured.' };
    }

    const orgKey = `${orgId}`;
    if (!checkRateLimit(orgKey)) {
      return {
        success: false,
        data: null,
        summary: 'Rate limit: try again later (max 12 calls per hour per organization).',
        metadata: { source: 'marketing:competitor_social_listen' },
      };
    }

    const competitorName = typeof args.competitor_name === 'string' ? args.competitor_name.trim() : '';
    if (!competitorName) {
      return { success: false, data: null, summary: 'Provide competitor_name.' };
    }

    const lookback =
      typeof args.lookback_days === 'number' && args.lookback_days >= 1 && args.lookback_days <= 30
        ? Math.floor(args.lookback_days)
        : 7;

    const snippets: Array<{ source: string; title_or_text: string; url: string; observed_at: string }> = [];

    try {
      const r = await query<{ point_text: string; competitor_name: string }>(
        `SELECT point_text, competitor_name FROM marketing_competitor_points
         WHERE organization_id = $1::uuid AND LOWER(competitor_name) = LOWER($2)
         ORDER BY sort_order, created_at DESC LIMIT 8`,
        [orgId, competitorName],
      );
      const iso = new Date().toISOString().slice(0, 10);
      for (const row of r.rows) {
        snippets.push({
          source: 'workspace_competitor_intel',
          title_or_text: row.point_text.slice(0, 500),
          url: '',
          observed_at: iso,
        });
      }
    } catch {
      /* non-fatal */
    }

    if (snippets.length === 0) {
      snippets.push({
        source: 'heuristic_placeholder',
        title_or_text: `No stored competitor rows for "${competitorName}". Add intel in Marketing truth/competitor map or use knowledge search.`,
        url: '',
        observed_at: new Date().toISOString().slice(0, 10),
      });
    }

    const limitations = `Heuristic listen only (${lookback}d window). Not live OAuth social APIs; internal DB rows prioritized.`;

    const data = {
      snippets,
      summary: `Collected ${snippets.length} snippet(s) for "${competitorName}".`,
      limitations,
    };

    return {
      success: true,
      data,
      summary: `${data.summary} ${limitations}`,
      metadata: { source: 'marketing:competitor_social_listen', count: snippets.length },
    };
  },
};

registerTool(competitorSocialListenTool);

export { competitorSocialListenTool };
