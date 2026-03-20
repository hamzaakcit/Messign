/**
 * Deliverable 4.3 — analytics:funnel_analysis, analytics:experiment_design
 * Read-only / advisory; funnel uses marketing_leads as a pipeline proxy when data exists.
 */
import { query } from '../../../db/index.js';
import { registerTool } from '../toolRegistry.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';
import { resolveOrgIdForTool } from './resolveOrgIdForTool.js';

const DEFAULT_STAGE_ORDER = ['new', 'contacted', 'nurturing', 'qualified', 'converted'];

const funnelAnalysisTool: Tool = {
  name: 'analytics:funnel_analysis',
  category: 'analytics',
  metadata: {
    namespace: 'analytics',
    name: 'funnel_analysis',
    summary: 'Marketing funnel proxy from lead-stage counts; optional date range and segment.',
    tags: ['analytics', 'funnel', 'conversion', 'marketing'],
    alwaysLoaded: false,
    parameterHints: 'funnel_stages?: string[], segment_filter?: string, date_start?: string, date_end?: string',
  },
  description: `Analyze a conversion-style funnel from marketing lead pipeline data (lead status as a proxy for full awareness-to-retention tracking).

Read-only — not for real-time event streams. Use when the user asks about funnel drop-off, bottlenecks, or stage conversion.

If data is sparse, the tool still returns structure with clear caveats in the summary.`,

  parameters: {
    type: 'object',
    properties: {
      funnel_stages: {
        type: 'array',
        description:
          'Optional logical stage names. Defaults to awareness, signup, activation, retention, upsell — mapped to available lead statuses when possible.',
        items: { type: 'string' },
      },
      segment_filter: {
        type: 'string',
        description: 'Optional filter: matches company name or tags (ILIKE).',
      },
      date_start: {
        type: 'string',
        description: 'Optional ISO date (inclusive) for created_at lower bound.',
      },
      date_end: {
        type: 'string',
        description: 'Optional ISO date (inclusive) for created_at upper bound.',
      },
      date_range: {
        type: 'object',
        description: 'Optional alternative to date_start/date_end: { start, end } ISO dates (inclusive).',
        properties: {
          start: { type: 'string', description: 'Start date (YYYY-MM-DD).' },
          end: { type: 'string', description: 'End date (YYYY-MM-DD).' },
        },
      },
    },
    required: [],
  },

  requiredRoles: ['admin', 'manager', 'cpo'],

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const orgId = await resolveOrgIdForTool(context);
    if (!orgId) {
      return { success: false, data: null, summary: 'Organization not configured.' };
    }

    const funnelStages =
      Array.isArray(args.funnel_stages) && args.funnel_stages.length > 0
        ? args.funnel_stages.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        : ['awareness', 'signup', 'activation', 'retention', 'upsell'];

    const segmentFilter = typeof args.segment_filter === 'string' ? args.segment_filter.trim() : '';
    let dateStart = typeof args.date_start === 'string' ? args.date_start.trim() : '';
    let dateEnd = typeof args.date_end === 'string' ? args.date_end.trim() : '';
    const dr = args.date_range;
    if (dr && typeof dr === 'object' && dr !== null && !dateStart && !dateEnd) {
      const o = dr as Record<string, unknown>;
      if (typeof o.start === 'string') dateStart = o.start.trim();
      if (typeof o.end === 'string') dateEnd = o.end.trim();
    }

    const conditions: string[] = ['l.organization_id = $1::uuid'];
    const params: unknown[] = [orgId];
    let p = 2;

    if (dateStart) {
      conditions.push(`l.created_at >= $${p++}::date`);
      params.push(dateStart);
    }
    if (dateEnd) {
      conditions.push(`l.created_at < ($${p++}::date + INTERVAL '1 day')`);
      params.push(dateEnd);
    }
    if (segmentFilter) {
      conditions.push(`(l.company_name ILIKE $${p} OR EXISTS (SELECT 1 FROM unnest(l.tags) t WHERE t::text ILIKE $${p}))`);
      params.push(`%${segmentFilter}%`);
      p++;
    }

    const sql = `
      SELECT COALESCE(NULLIF(TRIM(l.status), ''), 'unknown') AS status, COUNT(*)::int AS cnt
      FROM marketing_leads l
      WHERE ${conditions.join(' AND ')}
      GROUP BY 1
      ORDER BY 2 DESC
    `;

    let rows: { status: string; cnt: number }[] = [];
    try {
      const r = await query<{ status: string; cnt: string }>(sql, params);
      rows = r.rows.map((row) => ({ status: row.status, cnt: parseInt(String(row.cnt), 10) || 0 }));
    } catch (e) {
      return {
        success: false,
        data: null,
        summary: `Funnel query failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    const orderIdx = new Map(DEFAULT_STAGE_ORDER.map((s, i) => [s, i]));
    rows.sort((a, b) => (orderIdx.get(a.status) ?? 99) - (orderIdx.get(b.status) ?? 99));

    const byStatus = new Map(rows.map((r) => [r.status, r.cnt]));
    const orderedStatuses: string[] = [];
    for (const s of DEFAULT_STAGE_ORDER) {
      if (byStatus.has(s)) orderedStatuses.push(s);
    }
    for (const r of rows) {
      if (!orderedStatuses.includes(r.status)) orderedStatuses.push(r.status);
    }

    const total = rows.reduce((s, r) => s + r.cnt, 0);

    const stagesOut: Array<{
      name: string;
      count: number;
      conversion_rate: number;
      drop_off_rate: number;
      anomaly: boolean;
    }> = [];

    for (let i = 0; i < orderedStatuses.length; i++) {
      const status = orderedStatuses[i];
      const count = byStatus.get(status) ?? 0;
      const label = funnelStages[i] ?? status;
      const prevCount = i === 0 ? 0 : stagesOut[i - 1].count;
      const conversion_rate =
        i === 0 ? 1 : prevCount > 0 ? Math.min(1, count / prevCount) : 0;
      const drop_off_rate = i === 0 ? 0 : Math.max(0, 1 - conversion_rate);
      const anomaly = i > 0 && drop_off_rate > 0.45;
      stagesOut.push({
        name: `${label} (${status})`,
        count,
        conversion_rate: Math.round(conversion_rate * 1000) / 1000,
        drop_off_rate: Math.round(drop_off_rate * 1000) / 1000,
        anomaly,
      });
    }

    let bottleneck = { stage: 'n/a', severity: 'low', suggestion: 'Collect more lead data or widen the date range.' };
    let maxDrop = 0;
    for (let i = 1; i < stagesOut.length; i++) {
      if (stagesOut[i].drop_off_rate > maxDrop) {
        maxDrop = stagesOut[i].drop_off_rate;
        bottleneck = {
          stage: stagesOut[i].name,
          severity: maxDrop > 0.5 ? 'high' : 'medium',
          suggestion: 'Review targeting and nurture for this stage; consider A/B tests on messaging and offers.',
        };
      }
    }

    const data = { stages: stagesOut, bottleneck };

    return {
      success: true,
      data,
      summary:
        total === 0
          ? 'No leads in range for funnel analysis. Seed data or widen filters; funnel uses marketing_leads.status as a proxy.'
          : `Funnel proxy from ${total} lead(s) across ${rows.length} status bucket(s). ${bottleneck.severity !== 'low' ? `Largest drop: ${bottleneck.stage}.` : 'No major drop-off flagged.'}`,
      metadata: { source: 'analytics:funnel_analysis', count: total },
    };
  },
};

/** Approximate sample size per variant for two-proportion test (80% power, two-sided alpha 0.05). */
function sampleSizeTwoProportion(
  p1: number,
  p2: number,
  alpha = 0.05,
  power = 0.8,
): number {
  const za = 1.96;
  const zb = 0.84;
  const p = (p1 + p2) / 2;
  const q = 1 - p;
  const num = (za * Math.sqrt(2 * p * q) + zb * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2;
  const den = (p2 - p1) ** 2;
  if (den <= 0 || !Number.isFinite(num)) return 0;
  return Math.ceil(num / den);
}

const experimentDesignTool: Tool = {
  name: 'analytics:experiment_design',
  category: 'analytics',
  metadata: {
    namespace: 'analytics',
    name: 'experiment_design',
    summary: 'A/B experiment sizing: sample size, duration, success criteria from baseline and MDE.',
    tags: ['analytics', 'experiment', 'ab-test', 'marketing'],
    alwaysLoaded: false,
    parameterHints: 'hypothesis, metric, baseline_value, minimum_detectable_effect?',
  },
  description: `Design an A/B test framework for a marketing hypothesis: sample size per variant, rough duration, and success criteria.

Use when the user asks how long to run a test or how many users they need. Not for non-quantitative decisions.

Requires a numeric baseline for the metric (e.g. current conversion rate 0.12 for 12%).`,

  parameters: {
    type: 'object',
    properties: {
      hypothesis: { type: 'string', description: 'Clear hypothesis to test.' },
      metric: {
        type: 'string',
        description: 'Primary metric.',
        enum: ['open_rate', 'ctr', 'conversion_rate', 'cac', 'revenue_per_lead'],
      },
      baseline_value: {
        type: 'number',
        description: 'Current baseline (proportion 0–1 for rates; for CAC/revenue use relative MDE carefully).',
      },
      minimum_detectable_effect: {
        type: 'number',
        description: 'Minimum relative change to detect (e.g. 0.1 for 10% lift). Default 0.1.',
      },
    },
    required: ['hypothesis', 'metric', 'baseline_value'],
  },

  requiredRoles: ['admin', 'manager', 'cpo'],

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
    const hypothesis = typeof args.hypothesis === 'string' ? args.hypothesis.trim() : '';
    const metric = typeof args.metric === 'string' ? args.metric : '';
    const baseline = typeof args.baseline_value === 'number' ? args.baseline_value : NaN;
    const mde =
      typeof args.minimum_detectable_effect === 'number' && args.minimum_detectable_effect > 0
        ? args.minimum_detectable_effect
        : 0.1;

    if (!hypothesis || !metric || !['open_rate', 'ctr', 'conversion_rate', 'cac', 'revenue_per_lead'].includes(metric)) {
      return { success: false, data: null, summary: 'Provide hypothesis, metric, and baseline_value.' };
    }

    if (!Number.isFinite(baseline)) {
      return {
        success: false,
        data: null,
        summary: 'baseline_value must be a number. Do not call without a measured baseline.',
      };
    }

    if (metric === 'cac' || metric === 'revenue_per_lead') {
      const p1 = 0.5;
      const p2 = Math.min(0.99, Math.max(0.01, p1 + mde));
      const n = sampleSizeTwoProportion(p1, p2);
      const data = {
        sample_size_per_variant: n || 1000,
        estimated_duration_days: Math.max(7, Math.ceil((n || 1000) / 50)),
        success_criteria: `Reject null if ${metric} moves by at least ${(mde * 100).toFixed(1)}% vs baseline with pre-registered alpha.`,
        power: 0.8,
        confidence_level: 0.95,
        note: 'CAC/revenue metrics use a proportional surrogate for sizing; validate with analytics team.',
      };
      return {
        success: true,
        data,
        summary: `Experiment plan for ${metric}: ~${data.sample_size_per_variant} per variant, ~${data.estimated_duration_days} days (50 conversions/day assumption).`,
        metadata: { source: 'analytics:experiment_design' },
      };
    }

    const p1 = Math.min(0.99, Math.max(0.01, baseline));
    const p2 = Math.min(0.99, Math.max(0.01, p1 * (1 + mde)));
    const n = sampleSizeTwoProportion(p1, p2);
    const samplePerVariant = n > 0 ? n : Math.ceil(16 / (p2 - p1) ** 2);

    const data = {
      sample_size_per_variant: samplePerVariant,
      estimated_duration_days: Math.max(7, Math.ceil(samplePerVariant / 100)),
      success_criteria: `Primary: ${metric} lift ≥ ${(mde * 100).toFixed(1)}% vs control ${(p1 * 100).toFixed(2)}% with two-sided test 95% CI.`,
      power: 0.8,
      confidence_level: 0.95,
      hypothesis,
      metric,
    };

    return {
      success: true,
      data,
      summary: `~${samplePerVariant} users per variant for ~${data.estimated_duration_days} days (100 eligible users/day heuristic).`,
      metadata: { source: 'analytics:experiment_design' },
    };
  },
};

registerTool(funnelAnalysisTool);
registerTool(experimentDesignTool);

export { funnelAnalysisTool, experimentDesignTool };
