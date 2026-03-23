/**
 * Performance Feedback Loop — Collector Service
 *
 * Records campaign metrics, queries top/bottom performers,
 * extracts patterns, and generates calibration prompt text
 * for the Content Strategist.
 */

import { invalidateCalibrationCache } from './calibrationCache.js';
import { evaluatePerformanceTriggers, evaluateStreakBonus } from './mpTriggerService.js';

// ── Types ──

export interface RecordMetricsInput {
  organizationId: string;
  contentId: string;
  channel: string;
  metrics: {
    openRate?: number;
    clickThroughRate?: number;
    conversionRate?: number;
    unsubscribeRate?: number;
    bounceRate?: number;
    sendCount?: number;
    subjectLine?: string;
    engagementRate?: number;
    reach?: number;
    impressions?: number;
  };
  contentCharacteristics?: {
    toneTags?: string[];
    visualStyle?: string;
    themeUsed?: string;
    sectionCount?: number;
    heroImageUsed?: boolean;
    ctaVariant?: string;
    subjectLength?: number;
  };
  brandProfileId?: string;
  campaignPeriod?: {
    start?: string;
    end?: string;
  };
}

export interface PerformanceRecord {
  id: string;
  content_id: string;
  channel: string;
  subject_line: string | null;
  open_rate: number | null;
  click_through_rate: number | null;
  conversion_rate: number | null;
  send_count: number;
  tone_tags: string[];
  theme_used: string | null;
  section_count: number | null;
  cta_variant: string | null;
  subject_length: number | null;
  hero_image_used: boolean;
  recorded_at: string;
}

export interface PerformanceContext {
  topPerformers: PerformanceRecord[];
  bottomPerformers: PerformanceRecord[];
  averages: {
    openRate: number | null;
    clickThroughRate: number | null;
    conversionRate: number | null;
  };
  patterns: {
    bestSubjectLength: number | null;
    bestThemes: string[];
    bestTones: string[];
    bestCtaVariants: string[];
    worstSubjectPatterns: string[];
    avgSectionCount: number | null;
    heroImageCorrelation: number | null;
  };
  totalRecords: number;
  hasEnoughData: boolean;
}

export interface CalibrationPrompt {
  text: string;
  generatedAt: string;
  basedOnRecords: number;
}

export interface DbClient {
  query: (
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[] }>;
}

// ── Thresholds ──

const MIN_SEND_COUNT = 500;
const MIN_RECORDS_FOR_PATTERNS = 10;
const TOP_N = 5;

// ── Service Functions ──

/**
 * Record performance metrics for a content piece.
 * Upserts based on (organization_id, content_id, channel, recorded_at).
 */
export async function recordPerformance(
  input: RecordMetricsInput,
  db: DbClient,
): Promise<{ id: string; isNew: boolean }> {
  const {
    organizationId,
    contentId,
    channel,
    metrics,
    contentCharacteristics,
    brandProfileId,
    campaignPeriod,
  } = input;

  const result = await db.query(
    `INSERT INTO performance_feedback (
      organization_id, content_id, channel,
      subject_line, open_rate, click_through_rate, conversion_rate,
      unsubscribe_rate, bounce_rate, send_count,
      engagement_rate, reach, impressions,
      tone_tags, visual_style, theme_used, section_count,
      hero_image_used, cta_variant, subject_length,
      brand_profile_id,
      campaign_period_start, campaign_period_end,
      recorded_at
    ) VALUES (
      $1, $2, $3,
      $4, $5, $6, $7,
      $8, $9, $10,
      $11, $12, $13,
      $14, $15, $16, $17,
      $18, $19, $20,
      $21,
      $22, $23,
      NOW()
    )
    ON CONFLICT (organization_id, content_id, channel, recorded_at)
    DO UPDATE SET
      open_rate = COALESCE(EXCLUDED.open_rate, performance_feedback.open_rate),
      click_through_rate = COALESCE(EXCLUDED.click_through_rate, performance_feedback.click_through_rate),
      conversion_rate = COALESCE(EXCLUDED.conversion_rate, performance_feedback.conversion_rate),
      unsubscribe_rate = COALESCE(EXCLUDED.unsubscribe_rate, performance_feedback.unsubscribe_rate),
      bounce_rate = COALESCE(EXCLUDED.bounce_rate, performance_feedback.bounce_rate),
      send_count = COALESCE(EXCLUDED.send_count, performance_feedback.send_count),
      engagement_rate = COALESCE(EXCLUDED.engagement_rate, performance_feedback.engagement_rate),
      reach = COALESCE(EXCLUDED.reach, performance_feedback.reach),
      impressions = COALESCE(EXCLUDED.impressions, performance_feedback.impressions)
    RETURNING id, (xmax = 0) AS is_new`,
    [
      organizationId,
      contentId,
      channel,
      metrics.subjectLine ?? null,
      metrics.openRate ?? null,
      metrics.clickThroughRate ?? null,
      metrics.conversionRate ?? null,
      metrics.unsubscribeRate ?? null,
      metrics.bounceRate ?? null,
      metrics.sendCount ?? 0,
      metrics.engagementRate ?? null,
      metrics.reach ?? null,
      metrics.impressions ?? null,
      contentCharacteristics?.toneTags ?? [],
      contentCharacteristics?.visualStyle ?? null,
      contentCharacteristics?.themeUsed ?? null,
      contentCharacteristics?.sectionCount ?? null,
      contentCharacteristics?.heroImageUsed ?? false,
      contentCharacteristics?.ctaVariant ?? null,
      contentCharacteristics?.subjectLength ?? null,
      brandProfileId ?? null,
      campaignPeriod?.start ?? null,
      campaignPeriod?.end ?? null,
    ],
  );

  const row = result.rows[0];

  invalidateCalibrationCache(organizationId, channel);

  // Fire-and-forget MP trigger evaluation
  try {
    const contentRow = await db.query(
      'SELECT author_id FROM marketing_content WHERE id = $1',
      [contentId],
    );
    const authorId = (contentRow.rows[0] as Record<string, unknown>)?.author_id as string | undefined;
    if (authorId) {
      await evaluatePerformanceTriggers(organizationId, authorId, contentId, metrics, db);
      await evaluateStreakBonus(organizationId, authorId, db);
    }
  } catch (err) {
    console.warn('[MP] Failed to evaluate performance triggers:', err);
  }

  return {
    id: row.id as string,
    isNew: row.is_new as boolean,
  };
}

/**
 * Get performance context for a workspace.
 * Returns top/bottom performers, averages, and extracted patterns.
 */
export async function getPerformanceContext(
  organizationId: string,
  options: {
    channel?: string;
    brandProfileId?: string;
  },
  db: DbClient,
): Promise<PerformanceContext> {
  const channel = options.channel || 'email';
  const brandFilter = options.brandProfileId;

  let where =
    'WHERE organization_id = $1 AND channel = $2 AND send_count >= $3';
  const params: unknown[] = [organizationId, channel, MIN_SEND_COUNT];

  if (brandFilter) {
    params.push(brandFilter);
    where += ` AND brand_profile_id = $${params.length}`;
  }

  const countResult = await db.query(
    `SELECT COUNT(*) as total FROM performance_feedback ${where}`,
    params,
  );
  const totalRecords = parseInt(
    String(countResult.rows[0]?.total ?? 0),
    10,
  );

  if (totalRecords === 0) {
    return emptyContext();
  }

  const topResult = await db.query(
    `SELECT * FROM performance_feedback ${where}
     ORDER BY open_rate DESC NULLS LAST
     LIMIT $${params.length + 1}`,
    [...params, TOP_N],
  );
  const topPerformers = topResult.rows as unknown as PerformanceRecord[];

  const bottomResult = await db.query(
    `SELECT * FROM performance_feedback ${where}
     ORDER BY open_rate ASC NULLS LAST
     LIMIT $${params.length + 1}`,
    [...params, TOP_N],
  );
  const bottomPerformers =
    bottomResult.rows as unknown as PerformanceRecord[];

  const avgResult = await db.query(
    `SELECT
       AVG(open_rate) as avg_open,
       AVG(click_through_rate) as avg_ctr,
       AVG(conversion_rate) as avg_conv
     FROM performance_feedback ${where}`,
    params,
  );
  const avgRow = avgResult.rows[0] || {};

  return {
    topPerformers,
    bottomPerformers,
    averages: {
      openRate: avgRow.avg_open
        ? parseFloat(String(avgRow.avg_open))
        : null,
      clickThroughRate: avgRow.avg_ctr
        ? parseFloat(String(avgRow.avg_ctr))
        : null,
      conversionRate: avgRow.avg_conv
        ? parseFloat(String(avgRow.avg_conv))
        : null,
    },
    patterns: extractPatterns(topPerformers, bottomPerformers),
    totalRecords,
    hasEnoughData: totalRecords >= MIN_RECORDS_FOR_PATTERNS,
  };
}

/**
 * Get the full metrics history for a specific content piece.
 */
export async function getContentPerformanceHistory(
  contentId: string,
  db: DbClient,
): Promise<PerformanceRecord[]> {
  const result = await db.query(
    `SELECT * FROM performance_feedback
     WHERE content_id = $1
     ORDER BY recorded_at DESC`,
    [contentId],
  );
  return result.rows as unknown as PerformanceRecord[];
}

// ── Pattern Extraction (pure, testable) ──

/**
 * Extract content patterns from top and bottom performers.
 */
export function extractPatterns(
  topPerformers: PerformanceRecord[],
  bottomPerformers: PerformanceRecord[],
): PerformanceContext['patterns'] {
  if (topPerformers.length === 0) {
    return {
      bestSubjectLength: null,
      bestThemes: [],
      bestTones: [],
      bestCtaVariants: [],
      worstSubjectPatterns: [],
      avgSectionCount: null,
      heroImageCorrelation: null,
    };
  }

  const topSubjectLengths = topPerformers
    .map((p) => p.subject_length)
    .filter((l): l is number => l !== null && l > 0);
  const bestSubjectLength =
    topSubjectLengths.length > 0
      ? Math.round(
          topSubjectLengths.reduce((a, b) => a + b, 0) /
            topSubjectLengths.length,
        )
      : null;

  const bestThemes = getMostCommon(
    topPerformers
      .map((p) => p.theme_used)
      .filter((t): t is string => !!t),
  );

  const bestTones = getMostCommon(
    topPerformers.flatMap((p) => p.tone_tags || []),
  );

  const bestCtaVariants = getMostCommon(
    topPerformers
      .map((p) => p.cta_variant)
      .filter((v): v is string => !!v),
  );

  const worstSubjectPatterns: string[] = [];
  const bottomSubjectLengths = bottomPerformers
    .map((p) => p.subject_length)
    .filter((l): l is number => l !== null && l > 0);
  if (bottomSubjectLengths.length > 0) {
    const avgBottomLength = Math.round(
      bottomSubjectLengths.reduce((a, b) => a + b, 0) /
        bottomSubjectLengths.length,
    );
    if (bestSubjectLength && Math.abs(avgBottomLength - bestSubjectLength) > 10) {
      worstSubjectPatterns.push(
        avgBottomLength > bestSubjectLength
          ? `Avoid long subject lines (bottom performers averaged ${avgBottomLength} chars)`
          : `Avoid very short subject lines (bottom performers averaged ${avgBottomLength} chars)`,
      );
    }
  }

  const topSectionCounts = topPerformers
    .map((p) => p.section_count)
    .filter((c): c is number => c !== null && c > 0);
  const avgSectionCount =
    topSectionCounts.length > 0
      ? Math.round(
          topSectionCounts.reduce((a, b) => a + b, 0) /
            topSectionCounts.length,
        )
      : null;

  const topWithHero = topPerformers.filter((p) => p.hero_image_used).length;
  const heroImageCorrelation =
    topPerformers.length > 0
      ? Math.round((topWithHero / topPerformers.length) * 100)
      : null;

  return {
    bestSubjectLength,
    bestThemes,
    bestTones,
    bestCtaVariants,
    worstSubjectPatterns,
    avgSectionCount,
    heroImageCorrelation,
  };
}

/**
 * Generate the calibration prompt text from performance context.
 * This text gets injected into the Content Strategist system prompt.
 */
export function generateCalibrationPrompt(
  context: PerformanceContext,
): CalibrationPrompt {
  if (!context.hasEnoughData) {
    return {
      text: `## Performance Calibration\nNo historical performance data available yet.\nUse industry best practices: 40-60 char subjects, benefit-driven headlines,\nclear single CTA, hero images, and professional layouts.`,
      generatedAt: new Date().toISOString(),
      basedOnRecords: 0,
    };
  }

  const lines: string[] = ['## Performance Calibration'];
  lines.push(
    `Based on ${context.totalRecords} campaigns in this workspace:\n`,
  );

  if (context.averages.openRate !== null) {
    lines.push(
      `**Baseline metrics:** ${formatPercent(context.averages.openRate)} avg open rate, ${formatPercent(context.averages.clickThroughRate)} avg CTR, ${formatPercent(context.averages.conversionRate)} avg conversion.`,
    );
  }

  lines.push('\n**What works for this workspace:**');

  if (context.patterns.bestSubjectLength) {
    lines.push(
      `- Best-performing subject lines average ${context.patterns.bestSubjectLength} characters.`,
    );
  }
  if (context.patterns.bestThemes.length > 0) {
    lines.push(
      `- Top-performing themes: ${context.patterns.bestThemes.join(', ')}.`,
    );
  }
  if (context.patterns.bestTones.length > 0) {
    lines.push(
      `- Most effective tone: ${context.patterns.bestTones.join(', ')}.`,
    );
  }
  if (context.patterns.bestCtaVariants.length > 0) {
    lines.push(
      `- Best CTA styles: ${context.patterns.bestCtaVariants.join(', ')}.`,
    );
  }
  if (context.patterns.avgSectionCount) {
    lines.push(
      `- Top emails average ${context.patterns.avgSectionCount} sections.`,
    );
  }
  if (
    context.patterns.heroImageCorrelation !== null &&
    context.patterns.heroImageCorrelation > 50
  ) {
    lines.push(
      `- ${context.patterns.heroImageCorrelation}% of top performers use hero images — include them.`,
    );
  }

  if (context.patterns.worstSubjectPatterns.length > 0) {
    lines.push('\n**What to avoid:**');
    for (const pattern of context.patterns.worstSubjectPatterns) {
      lines.push(`- ${pattern}`);
    }
  }

  if (context.topPerformers.length > 0) {
    lines.push('\n**Top performing subject lines for reference:**');
    for (const top of context.topPerformers.slice(0, 3)) {
      if (top.subject_line) {
        lines.push(
          `- "${top.subject_line}" (${formatPercent(top.open_rate)} open rate)`,
        );
      }
    }
  }

  return {
    text: lines.join('\n'),
    generatedAt: new Date().toISOString(),
    basedOnRecords: context.totalRecords,
  };
}

// ── Helpers ──

/** Get the most common values from an array, sorted by frequency. */
export function getMostCommon(
  values: string[],
  maxResults: number = 3,
): string[] {
  const counts: Record<string, number> = {};
  for (const v of values) {
    counts[v] = (counts[v] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxResults)
    .map(([value]) => value);
}

/** Format a decimal as a percentage string. */
export function formatPercent(
  value: number | null | undefined,
): string {
  if (value === null || value === undefined) return 'N/A';
  return `${(value * 100).toFixed(1)}%`;
}

function emptyContext(): PerformanceContext {
  return {
    topPerformers: [],
    bottomPerformers: [],
    averages: {
      openRate: null,
      clickThroughRate: null,
      conversionRate: null,
    },
    patterns: {
      bestSubjectLength: null,
      bestThemes: [],
      bestTones: [],
      bestCtaVariants: [],
      worstSubjectPatterns: [],
      avgSectionCount: null,
      heroImageCorrelation: null,
    },
    totalRecords: 0,
    hasEnoughData: false,
  };
}
