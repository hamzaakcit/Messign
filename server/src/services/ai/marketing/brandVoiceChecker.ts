/**
 * Brand voice check — fast LLM scoring with structured JSON (spec v2).
 */
import OpenAI from 'openai';
import { loadBrandVoiceProfileMd } from '../../../dal/marketing/truthBrand.js';
import { callModelSafe } from '../gateway.js';
import { BRAND_VOICE_CHECKER_SYSTEM_PROMPT } from '../../../modules/marketing/prompts/brandVoiceCheckerPrompt.js';

const DIMENSION_KEYS = [
  'tone_voice',
  'clarity_structure',
  'audience_positioning',
  'claims_proof_safety',
  'taboo_policy',
] as const;

export type BrandVoiceDimensionKey = (typeof DIMENSION_KEYS)[number];

export interface BrandVoiceCheckResult {
  score: number;
  /** Integer 0–20 per dimension; may be partial if the model omits keys. */
  dimensions: Partial<Record<BrandVoiceDimensionKey, number>>;
  strengths: string[];
  improvements: string[];
  taboo_violations: string[];
  anti_example_matches: string[];
  /** Derived: score >= 75 (approval-queue bar for this checker). */
  passes: boolean;
}

const PARSE_FAILURE: BrandVoiceCheckResult = {
  score: 0,
  dimensions: {},
  strengths: [],
  improvements: ['Could not parse model output — manual review'],
  taboo_violations: [],
  anti_example_matches: [],
  passes: false,
};

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeDimensions(raw: unknown): Partial<Record<BrandVoiceDimensionKey, number>> {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const out: Partial<Record<BrandVoiceDimensionKey, number>> = {};
  for (const k of DIMENSION_KEYS) {
    const v = o[k];
    if (typeof v === 'number') out[k] = clampInt(v, 0, 20);
  }
  return out;
}

function stringArray(raw: unknown, maxLen: number): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x)).filter(Boolean).slice(0, maxLen);
}

/**
 * Parse first JSON object in model output; on failure returns a safe low-score result.
 */
export function parseBrandVoiceCheckJson(raw: string): BrandVoiceCheckResult {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return { ...PARSE_FAILURE };
    const p = JSON.parse(m[0]) as Record<string, unknown>;
    const score = typeof p.score === 'number' ? clampInt(p.score, 0, 100) : 0;
    const dimensions = normalizeDimensions(p.dimensions);
    const strengths = stringArray(p.strengths, 8);
    const improvements = stringArray(p.improvements, 10);
    const taboo_violations = stringArray(p.taboo_violations, 20);
    const anti_example_matches = stringArray(p.anti_example_matches, 10);
    const passes = score >= 75;
    return {
      score,
      dimensions,
      strengths,
      improvements:
        improvements.length > 0 ? improvements : score >= 90 ? [] : ['Review tone and claims against brand profile.'],
      taboo_violations,
      anti_example_matches,
      passes,
    };
  } catch {
    return { ...PARSE_FAILURE };
  }
}

export interface RunBrandVoiceCheckArgs {
  organizationId: string;
  contentText: string;
  tenantId: string;
  userQuery?: string;
  /** Red team / tests: inject markdown instead of `loadBrandVoiceProfileMd` */
  brandVoiceContextMdOverride?: string;
  /** Red team: skip LLM and parse this string (deterministic CI) */
  redTeamRawResponseOverride?: string;
  onRawModelResponse?: (raw: string) => void;
  /** Publishing channel (e.g. instagram, linkedin) for channel-specific policies */
  targetChannel?: string;
}

export async function runBrandVoiceCheck(args: RunBrandVoiceCheckArgs): Promise<BrandVoiceCheckResult> {
  const {
    organizationId,
    contentText,
    tenantId,
    userQuery = 'brand_voice_check',
    brandVoiceContextMdOverride,
    redTeamRawResponseOverride,
    onRawModelResponse,
    targetChannel,
  } = args;

  if (redTeamRawResponseOverride !== undefined) {
    onRawModelResponse?.(redTeamRawResponseOverride);
    return parseBrandVoiceCheckJson(redTeamRawResponseOverride);
  }

  const brandVoiceMd =
    brandVoiceContextMdOverride ?? (await loadBrandVoiceProfileMd(organizationId));

  const userContent = [
    '## CONTENT',
    '',
    contentText.slice(0, 14_000),
    '',
    '---',
    '',
    '## TARGET_CHANNEL',
    '',
    (targetChannel ?? 'linkedin').slice(0, 64),
    '',
    '---',
    '',
    '## BRAND_PROFILE',
    '',
    brandVoiceMd.slice(0, 12_000),
  ].join('\n');

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: BRAND_VOICE_CHECKER_SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];

  const res = await callModelSafe({
    tier: 'fast',
    messages,
    tenantId,
    maxTokens: 900,
    temperature: 0.2,
    userQuery,
  });

  const raw = res.choices?.[0]?.message?.content?.trim() ?? '';
  onRawModelResponse?.(raw);
  return parseBrandVoiceCheckJson(raw);
}

function formatDimensionLine(dimensions: Partial<Record<BrandVoiceDimensionKey, number>>): string {
  const parts = DIMENSION_KEYS.map((k) => {
    const v = dimensions[k];
    return v !== undefined ? `${k}: ${v}/20` : null;
  }).filter((x): x is string => x != null);
  return parts.length > 0 ? parts.join(' · ') : '(dimensions not parsed)';
}

/**
 * Human-readable summary for tool results and logs (markdown-friendly lines).
 */
export function formatBrandVoiceCheckSummary(parsed: BrandVoiceCheckResult): string {
  const status = parsed.passes ? 'pass' : 'needs revision';
  const lines = [
    `**Score:** ${parsed.score}/100 (${status})`,
    `**Dimensions:** ${formatDimensionLine(parsed.dimensions)}`,
  ];
  const topImprovements = parsed.improvements.slice(0, 4);
  if (topImprovements.length > 0) {
    lines.push('**Top improvements:**');
    for (const t of topImprovements) {
      lines.push(`- ${t}`);
    }
  }
  if (parsed.taboo_violations.length > 0) {
    lines.push('**Taboo / policy:**');
    for (const t of parsed.taboo_violations.slice(0, 5)) {
      lines.push(`- ${t}`);
    }
  }
  return lines.join('\n');
}
