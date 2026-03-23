/**
 * Brand Compliance Scanner — hybrid rule-based (40%) + LLM tone analysis (60%).
 *
 * Checks content against its associated brand profile's forbidden words,
 * required disclaimers, color palette, and voice tone. Stores results in
 * the `compliance_scans` table for the approval queue UI.
 */

import type { DbClient } from './performanceCollector.js';
import type { BrandProfile } from './brandProfileService.js';
import { getBrandProfile } from './brandProfileService.js';
import { callModelSafe } from '../ai/gateway.js';
import { evaluateComplianceTriggers } from './mpTriggerService.js';

// ── Types ──

export interface ComplianceFlag {
  type: 'forbidden_word' | 'missing_disclaimer' | 'tone_deviation' | 'style_violation' | 'length_issue';
  severity: 'error' | 'warning';
  message: string;
  location?: string;
  detail?: string;
}

export interface BrandComplianceScanResult {
  score: number;
  passed: boolean;
  flags: ComplianceFlag[];
  ruleScore: number;
  llmScore: number | null;
  ruleFlags: ComplianceFlag[];
  llmFlags: ComplianceFlag[];
  scanDurationMs: number;
  brandProfileId: string | null;
}

export interface ContentToScan {
  id: string;
  title: string;
  body: string;
  channel: string;
  subjectLine?: string;
  bodyDesign?: Record<string, unknown>;
  organizationId: string;
  brandProfileId?: string | null;
}

export type ScanLLMCall = (params: {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}) => Promise<string>;

// ── Score Weights ──

const RULE_WEIGHT = 0.4;
const LLM_WEIGHT = 0.6;

// ── Main Scanner ──

export async function scanContent(
  content: ContentToScan,
  callLLM: ScanLLMCall,
  db: DbClient,
): Promise<BrandComplianceScanResult> {
  const startTime = Date.now();

  let brandProfile: BrandProfile | null = null;
  if (content.brandProfileId) {
    brandProfile = await getBrandProfile(content.brandProfileId, db);
  }

  if (!brandProfile) {
    const result: BrandComplianceScanResult = {
      score: 100,
      passed: true,
      flags: [],
      ruleScore: 100,
      llmScore: null,
      ruleFlags: [],
      llmFlags: [],
      scanDurationMs: Date.now() - startTime,
      brandProfileId: null,
    };
    await storeScanResult(content, result, db);
    return result;
  }

  const ruleResult = runRuleChecks(content, brandProfile);

  let llmResult: { score: number; flags: ComplianceFlag[] };
  try {
    llmResult = await runLLMToneCheck(content, brandProfile, callLLM);
  } catch (error) {
    console.warn('[ComplianceScanner] LLM check failed, using rule score only:', error);
    llmResult = { score: ruleResult.score, flags: [] };
  }

  const finalScore = Math.round(
    ruleResult.score * RULE_WEIGHT + llmResult.score * LLM_WEIGHT,
  );
  const allFlags = [...ruleResult.flags, ...llmResult.flags];

  const result: BrandComplianceScanResult = {
    score: finalScore,
    passed: finalScore >= 80,
    flags: allFlags,
    ruleScore: ruleResult.score,
    llmScore: llmResult.score,
    ruleFlags: ruleResult.flags,
    llmFlags: llmResult.flags,
    scanDurationMs: Date.now() - startTime,
    brandProfileId: brandProfile.id,
  };

  await storeScanResult(content, result, db);

  // Fire-and-forget MP trigger for perfect compliance
  if (result.score === 100) {
    try {
      const contentRow = await db.query(
        'SELECT author_id FROM marketing_content WHERE id = $1',
        [content.id],
      );
      const authorId = (contentRow.rows[0] as Record<string, unknown>)?.author_id as string | undefined;
      if (authorId) {
        await evaluateComplianceTriggers(content.organizationId, authorId, content.id, result.score, db);
      }
    } catch (err) {
      console.warn('[MP] Failed to evaluate compliance triggers:', err);
    }
  }

  return result;
}

// ── Rule-Based Checks ──

export function runRuleChecks(
  content: ContentToScan,
  brandProfile: BrandProfile,
): { score: number; flags: ComplianceFlag[] } {
  const flags: ComplianceFlag[] = [];
  let deductions = 0;

  const fullText = [
    content.title || '',
    content.subjectLine || '',
    content.body || '',
  ].join(' ').toLowerCase();

  // Forbidden words (15 pts per occurrence)
  if (brandProfile.forbidden_words?.length) {
    for (const word of brandProfile.forbidden_words) {
      if (!word) continue;
      const regex = new RegExp(`\\b${escapeRegex(word.toLowerCase())}\\b`, 'gi');
      const matches = fullText.match(regex);
      if (matches?.length) {
        flags.push({
          type: 'forbidden_word',
          severity: 'error',
          message: `Forbidden word "${word}" found ${matches.length} time(s)`,
          detail: `Remove or replace "${word}"`,
          location: findLocation(content, word.toLowerCase()),
        });
        deductions += 15 * matches.length;
      }
    }
  }

  // Required disclaimers (20 pts each)
  if (brandProfile.required_disclaimers?.length) {
    for (const disclaimer of brandProfile.required_disclaimers) {
      if (!disclaimer) continue;
      const lowerDisclaimer = disclaimer.toLowerCase();

      if (!fullText.includes(lowerDisclaimer)) {
        const disclaimerWords = lowerDisclaimer.split(/\s+/).filter((w) => w.length > 3);
        const matchedWords = disclaimerWords.filter((w) => fullText.includes(w));
        const matchRatio = disclaimerWords.length > 0
          ? matchedWords.length / disclaimerWords.length
          : 0;

        if (matchRatio < 0.6) {
          flags.push({
            type: 'missing_disclaimer',
            severity: 'error',
            message: `Required disclaimer missing: "${disclaimer}"`,
            detail: 'Add this disclaimer to the content (typically in the footer)',
          });
          deductions += 20;
        }
      }
    }
  }

  // Color palette adherence (10 pts if >30% off-brand)
  if (content.bodyDesign && brandProfile.color_palette) {
    const paletteColors = Object.values(brandProfile.color_palette)
      .filter((c): c is string => typeof c === 'string' && c.startsWith('#'))
      .map((c) => c.toLowerCase());

    if (paletteColors.length > 0) {
      const designStr = JSON.stringify(content.bodyDesign).toLowerCase();
      const designColors = (designStr.match(/#[0-9a-f]{6}/g) || [])
        .filter((c) => c !== '#ffffff' && c !== '#000000' && c !== '#f9fafb');

      const offBrandColors = designColors.filter(
        (c) => !paletteColors.some((pc) => pc === c),
      );

      if (designColors.length > 0 && offBrandColors.length / designColors.length > 0.3) {
        flags.push({
          type: 'style_violation',
          severity: 'warning',
          message: `${offBrandColors.length} colors used that aren't in the brand palette`,
          detail: `Brand palette: ${paletteColors.join(', ')}. Consider aligning colors.`,
        });
        deductions += 10;
      }
    }
  }

  return { score: Math.max(0, 100 - deductions), flags };
}

// ── LLM Tone Check ──

export async function runLLMToneCheck(
  content: ContentToScan,
  brandProfile: BrandProfile,
  callLLM: ScanLLMCall,
): Promise<{ score: number; flags: ComplianceFlag[] }> {
  const systemPrompt = `You are a brand compliance auditor. Score content for brand voice adherence.

Brand profile:
- Brand: ${brandProfile.brand_name}
- Tone keywords: ${brandProfile.tone_keywords.join(', ') || 'not specified'}
- Voice examples: ${brandProfile.voice_examples.slice(0, 2).join(' | ') || 'not specified'}
${brandProfile.style_guide_notes ? `- Style notes: ${brandProfile.style_guide_notes}` : ''}

Score the content 0-100 for brand voice compliance:
- 90-100: Perfect match, reads like the brand wrote it
- 70-89: Good match, minor tone adjustments needed
- 50-69: Noticeable deviation, tone feels off-brand
- 0-49: Significant mismatch, doesn't sound like the brand

Output format (strict JSON, no markdown):
{"score": <number>, "issues": [{"message": "<issue>", "suggestion": "<fix>"}]}

Be concise. Max 3 issues. Only flag genuine tone deviations, not style preferences.`;

  const userPrompt = `Score this content for brand compliance:

Title: ${content.title}
${content.subjectLine ? `Subject: ${content.subjectLine}` : ''}
Body: ${(content.body || '').slice(0, 1500)}`;

  const llmResponse = await callLLM({
    systemPrompt,
    userPrompt,
    maxTokens: 300,
  });

  return parseLLMToneResponse(llmResponse);
}

export function parseLLMToneResponse(
  response: string,
): { score: number; flags: ComplianceFlag[] } {
  const flags: ComplianceFlag[] = [];

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');

    const cleaned = jsonMatch[0]
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/'/g, '"');

    const parsed = JSON.parse(cleaned);
    const score = typeof parsed.score === 'number'
      ? Math.max(0, Math.min(100, Math.round(parsed.score)))
      : 70;

    if (Array.isArray(parsed.issues)) {
      for (const issue of parsed.issues.slice(0, 3)) {
        if (issue.message) {
          flags.push({
            type: 'tone_deviation',
            severity: score < 60 ? 'error' : 'warning',
            message: String(issue.message),
            detail: issue.suggestion ? String(issue.suggestion) : undefined,
          });
        }
      }
    }

    return { score, flags };
  } catch {
    console.warn('[ComplianceScanner] Failed to parse LLM tone response, using default 70');
    return { score: 70, flags: [] };
  }
}

// ── Storage ──

async function storeScanResult(
  content: ContentToScan,
  result: BrandComplianceScanResult,
  db: DbClient,
): Promise<string> {
  const insertResult = await db.query(
    `INSERT INTO compliance_scans (
      organization_id, content_id, brand_profile_id,
      score, flags,
      rule_score, llm_score,
      rule_flags, llm_flags,
      scan_duration_ms
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id`,
    [
      content.organizationId,
      content.id,
      result.brandProfileId,
      result.score,
      JSON.stringify(result.flags),
      result.ruleScore,
      result.llmScore,
      JSON.stringify(result.ruleFlags),
      JSON.stringify(result.llmFlags),
      result.scanDurationMs,
    ],
  );
  return insertResult.rows[0]?.id as string;
}

export async function getLatestScan(
  contentId: string,
  db: DbClient,
): Promise<BrandComplianceScanResult | null> {
  const result = await db.query(
    `SELECT * FROM compliance_scans
     WHERE content_id = $1
     ORDER BY scanned_at DESC LIMIT 1`,
    [contentId],
  );
  if (result.rows.length === 0) return null;

  const row = result.rows[0] as Record<string, unknown>;
  return {
    score: row.score as number,
    passed: row.passed as boolean,
    flags: (row.flags || []) as ComplianceFlag[],
    ruleScore: row.rule_score as number,
    llmScore: row.llm_score as number | null,
    ruleFlags: (row.rule_flags || []) as ComplianceFlag[],
    llmFlags: (row.llm_flags || []) as ComplianceFlag[],
    scanDurationMs: row.scan_duration_ms as number,
    brandProfileId: row.brand_profile_id as string | null,
  };
}

export async function getScanHistory(
  contentId: string,
  db: DbClient,
): Promise<Array<BrandComplianceScanResult & { scanned_at: string }>> {
  const result = await db.query(
    `SELECT * FROM compliance_scans
     WHERE content_id = $1
     ORDER BY scanned_at DESC
     LIMIT 20`,
    [contentId],
  );
  return result.rows.map((row: Record<string, unknown>) => ({
    score: row.score as number,
    passed: row.passed as boolean,
    flags: (row.flags || []) as ComplianceFlag[],
    ruleScore: row.rule_score as number,
    llmScore: row.llm_score as number | null,
    ruleFlags: (row.rule_flags || []) as ComplianceFlag[],
    llmFlags: (row.llm_flags || []) as ComplianceFlag[],
    scanDurationMs: row.scan_duration_ms as number,
    brandProfileId: row.brand_profile_id as string | null,
    scanned_at: row.scanned_at as string,
  }));
}

// ── Auto-Scan Trigger ──

export function triggerBrandComplianceScan(
  contentId: string,
  organizationId: string,
  db: DbClient,
): void {
  void (async () => {
    const row = await db.query(
      'SELECT id, title, body, channel, brand_profile_id, body_design FROM marketing_content WHERE id = $1',
      [contentId],
    );
    const rec = row.rows[0] as Record<string, unknown> | undefined;
    if (!rec?.brand_profile_id) return;

    const content: ContentToScan = {
      id: rec.id as string,
      title: (rec.title as string) || '',
      body: (rec.body as string) || '',
      channel: (rec.channel as string) || 'email',
      organizationId,
      brandProfileId: rec.brand_profile_id as string,
      bodyDesign: rec.body_design as Record<string, unknown> | undefined,
    };

    const callLLM: ScanLLMCall = async (params) => {
      const res = await callModelSafe({
        tier: 'fast',
        messages: [
          { role: 'system', content: params.systemPrompt },
          { role: 'user', content: params.userPrompt },
        ],
        tenantId: organizationId,
        maxTokens: params.maxTokens ?? 300,
        temperature: 0.15,
      });
      return res.choices?.[0]?.message?.content?.trim() ?? '';
    };

    await scanContent(content, callLLM, db);
  })().catch((err) => console.error('[ComplianceScanner] Auto-scan failed:', err));
}

// ── Helpers ──

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findLocation(content: ContentToScan, word: string): string {
  if (content.subjectLine?.toLowerCase().includes(word)) return 'subject_line';
  if (content.title?.toLowerCase().includes(word)) return 'title';
  return 'body';
}
