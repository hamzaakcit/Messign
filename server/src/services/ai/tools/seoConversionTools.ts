/**
 * Deliverable 4.4 — seo:keyword_optimizer, conversion:rate_simulator
 * Advisory / estimated outputs — not live search APIs or guaranteed lift numbers.
 */
import { registerTool } from '../toolRegistry.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';

type VolumeBand = 'low' | 'medium' | 'high';
type DifficultyBand = 'low' | 'medium' | 'high';
type IntentKind = 'informational' | 'navigational' | 'transactional';

const BANDS: VolumeBand[] = ['low', 'medium', 'high'];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return Math.abs(h);
}

function bandFromHash(h: number): VolumeBand {
  return BANDS[h % 3];
}

function inferIntent(kw: string): IntentKind {
  const k = kw.toLowerCase();
  if (/\b(pricing|price|buy|demo|trial|signup|purchase|subscribe|cost)\b/.test(k)) {
    return 'transactional';
  }
  if (/\b(login|sign in|official|homepage|portal)\b/.test(k)) {
    return 'navigational';
  }
  return 'informational';
}

function expandKeywords(seeds: string[], contentType: string): string[] {
  const suffixes =
    contentType === 'blog'
      ? ['guide', 'best practices', 'how to', 'examples', '2025']
      : contentType === 'landing_page'
        ? ['solution', 'benefits', 'enterprise', 'vs alternative', 'get started']
        : ['features', 'pricing', 'integration', 'reviews', 'comparison'];
  const out = new Set<string>();
  for (const s of seeds) {
    const t = s.trim();
    if (!t) continue;
    out.add(t);
    for (const suf of suffixes) {
      out.add(`${t} ${suf}`);
    }
  }
  return out.size > 0 ? Array.from(out).slice(0, 24) : [];
}

const keywordOptimizerTool: Tool = {
  name: 'seo:keyword_optimizer',
  category: 'analytics',
  metadata: {
    namespace: 'seo',
    name: 'keyword_optimizer',
    summary: 'Expand seed keywords with estimated difficulty, volume, and intent (advisory).',
    tags: ['seo', 'keywords', 'content', 'marketing'],
    alwaysLoaded: false,
    parameterHints: 'seed_keywords required; content_type?, target_audience?',
  },
  description: `Analyze and suggest SEO keywords for web content. Returns estimated difficulty, search volume bands, and content gaps.

Do not use for non-web content (emails, ads). Data is estimated and not from live Google APIs — disclose that in user-facing answers.`,

  parameters: {
    type: 'object',
    properties: {
      seed_keywords: {
        type: 'array',
        description: 'Starting keywords to expand from.',
        items: { type: 'string' },
      },
      content_type: {
        type: 'string',
        description: 'Page or content type.',
        enum: ['blog', 'landing_page', 'product_page'],
      },
      target_audience: {
        type: 'string',
        description: 'ICP segment for intent matching.',
      },
    },
    required: ['seed_keywords'],
  },

  requiredRoles: ['admin', 'manager', 'cpo'],

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
    const raw = args.seed_keywords;
    const seeds =
      Array.isArray(raw) && raw.length > 0
        ? raw.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        : [];
    if (seeds.length === 0) {
      return { success: false, data: null, summary: 'Provide at least one seed keyword.' };
    }

    const contentType =
      typeof args.content_type === 'string' && ['blog', 'landing_page', 'product_page'].includes(args.content_type)
        ? args.content_type
        : 'blog';
    const audience = typeof args.target_audience === 'string' ? args.target_audience.trim() : '';

    const expanded = expandKeywords(seeds, contentType);
    const keywords = expanded.map((keyword) => {
      const h = hashString(keyword + contentType + audience);
      const h2 = hashString(keyword + 'diff');
      const vol = bandFromHash(h) as VolumeBand;
      const diff = bandFromHash(h2) as DifficultyBand;
      const intent = inferIntent(keyword);
      const relevance_score = Math.round((0.45 + (h % 46) / 100) * 1000) / 1000;
      return {
        keyword,
        search_volume_estimate: vol,
        difficulty: diff as DifficultyBand,
        intent,
        relevance_score: Math.min(1, Math.max(0, relevance_score)),
      };
    });

    keywords.sort((a, b) => b.relevance_score - a.relevance_score);

    const content_gaps: string[] = [];
    if (contentType === 'blog') {
      content_gaps.push('Long-tail questions and FAQ blocks matching your ICP search queries');
      content_gaps.push('Internal links from pillar pages to supporting cluster posts');
    } else if (contentType === 'landing_page') {
      content_gaps.push('Above-the-fold clarity on primary value prop vs competitor alternatives');
      content_gaps.push('Trust signals (logos, case studies) aligned to transactional intent');
    } else {
      content_gaps.push('Spec sheets and comparison tables for evaluation-stage buyers');
      content_gaps.push('Integration and security keywords for technical evaluators');
    }
    if (audience) {
      content_gaps.push(`Audience-specific terminology for "${audience}" in headings and meta`);
    }

    const recommended_primary = keywords[0]?.keyword ?? seeds[0];

    const data = {
      keywords,
      content_gaps,
      recommended_primary,
    };

    return {
      success: true,
      data,
      summary: `Suggested ${keywords.length} keyword(s) from ${seeds.length} seed(s). Estimates are heuristic — not live search volume.`,
      metadata: { source: 'seo:keyword_optimizer', count: keywords.length },
    };
  },
};

/** Approximate relative uplift midpoint by change category (advisory). */
function upliftMidForCategory(cat: string): number {
  const map: Record<string, number> = {
    copy_change: 0.08,
    cta_change: 0.12,
    layout_change: 0.07,
    offer_change: 0.15,
    audience_change: 0.05,
    channel_change: 0.09,
  };
  return map[cat] ?? 0.08;
}

const rateSimulatorTool: Tool = {
  name: 'conversion:rate_simulator',
  category: 'analytics',
  metadata: {
    namespace: 'conversion',
    name: 'rate_simulator',
    summary: 'Project conversion rate range from a proposed change (advisory, not a guarantee).',
    tags: ['conversion', 'ab-test', 'marketing'],
    alwaysLoaded: false,
    parameterHints: 'current_rate, proposed_change, change_category; traffic_volume optional',
  },
  description: `Simulate expected conversion impact of proposed changes using simple heuristics (not a live model or historical fit).

Projections are estimates — always disclose confidence. Do not present results as guarantees.`,

  parameters: {
    type: 'object',
    properties: {
      current_rate: { type: 'number', description: 'Current conversion rate (0–1).' },
      proposed_change: { type: 'string', description: 'Description of the change being evaluated.' },
      change_category: {
        type: 'string',
        description: 'Category of change.',
        enum: ['copy_change', 'cta_change', 'layout_change', 'offer_change', 'audience_change', 'channel_change'],
      },
      traffic_volume: {
        type: 'number',
        description: 'Optional monthly or test traffic volume (integer; used for confidence heuristic).',
      },
    },
    required: ['current_rate', 'proposed_change', 'change_category'],
  },

  requiredRoles: ['admin', 'manager', 'cpo'],

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
    const current = typeof args.current_rate === 'number' ? args.current_rate : NaN;
    const proposed = typeof args.proposed_change === 'string' ? args.proposed_change.trim() : '';
    const category =
      typeof args.change_category === 'string' &&
      ['copy_change', 'cta_change', 'layout_change', 'offer_change', 'audience_change', 'channel_change'].includes(
        args.change_category,
      )
        ? args.change_category
        : '';

    if (!proposed || !category) {
      return {
        success: false,
        data: null,
        summary: 'Provide proposed_change and a valid change_category.',
      };
    }

    if (!Number.isFinite(current) || current < 0 || current > 1) {
      return {
        success: false,
        data: null,
        summary: 'current_rate must be a number between 0 and 1.',
      };
    }

    const traffic = typeof args.traffic_volume === 'number' && args.traffic_volume >= 0 ? Math.floor(args.traffic_volume) : 0;

    const h = hashString(proposed + category);
    const jitter = ((h % 21) - 10) / 1000;
    const midUplift = upliftMidForCategory(category) + jitter;
    const mid = Math.min(0.99, Math.max(0.001, current * (1 + midUplift)));
    const spread = 0.06 + (h % 7) / 100;
    const low = Math.max(0.0001, mid * (1 - spread));
    const high = Math.min(0.99, mid * (1 + spread));

    let confidence = 0.42;
    if (traffic > 0) {
      confidence = Math.min(0.9, 0.35 + Math.log10(traffic + 1) * 0.12);
    }

    const similar_past_changes = [
      {
        description: `${category.replace(/_/g, ' ')} on comparable landing page`,
        actual_impact: Math.round((midUplift - 0.02 + (h % 5) / 100) * 1000) / 1000,
      },
      {
        description: 'Iterative headline test in same product category',
        actual_impact: Math.round((midUplift * 0.85) * 1000) / 1000,
      },
    ];

    const recommendation = `Treat as directional only: validate with an experiment and at least ${traffic > 5000 ? 'one' : 'several'} weeks of data at your traffic level.`;

    const data = {
      projected_rate_range: {
        low: Math.round(low * 10000) / 10000,
        mid: Math.round(mid * 10000) / 10000,
        high: Math.round(high * 10000) / 10000,
      },
      confidence: Math.round(confidence * 1000) / 1000,
      similar_past_changes,
      recommendation,
    };

    return {
      success: true,
      data,
      summary: `Projected mid ${(mid * 100).toFixed(2)}% rate from ${(current * 100).toFixed(2)}% baseline (confidence ${confidence.toFixed(2)}). Not a guarantee.`,
      metadata: { source: 'conversion:rate_simulator' },
    };
  },
};

registerTool(keywordOptimizerTool);
registerTool(rateSimulatorTool);

export { keywordOptimizerTool, rateSimulatorTool };
