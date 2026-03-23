/**
 * Marketing compliance scanner — fast-tier LLM; advisory warnings only (no hard blocks).
 */
import OpenAI from 'openai';
import { callModelSafe } from '../gateway.js';
import { COMPLIANCE_SCANNER_SYSTEM_PROMPT } from '../../../modules/marketing/prompts/complianceScannerPrompt.js';
import { loadProductTruthSheetMd } from '../../../dal/marketing/truthBrand.js';
import { applyInstagramComplianceRules } from './instagramValidationPatches.js';

export type ComplianceSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ComplianceWarningItem {
  check: string;
  severity: ComplianceSeverity;
  location: string;
  issue: string;
  suggestion: string;
}

export interface EmailComplianceBlock {
  has_unsubscribe_mention?: boolean;
  has_sender_identification?: boolean;
  spam_trigger_count?: number;
  spam_triggers_found?: string[];
}

export interface ComplianceScanResult {
  verdict: 'PASS' | 'WARNING';
  warnings: ComplianceWarningItem[];
  warning_count: { high: number; medium: number; low: number };
  channel_specific_issues: string[];
  email_compliance?: EmailComplianceBlock | null;
}

const PARSE_FAILURE: ComplianceScanResult = {
  verdict: 'WARNING',
  warnings: [
    {
      check: 'scanner_output',
      severity: 'HIGH',
      location: 'n/a',
      issue: 'Could not parse compliance scanner output — manual review required.',
      suggestion: 'Re-run the scan or have a human reviewer assess legal and reputational risk.',
    },
  ],
  warning_count: { high: 1, medium: 0, low: 0 },
  channel_specific_issues: [],
  email_compliance: null,
};

function normalizeSeverity(s: unknown): ComplianceSeverity {
  const u = String(s ?? '').toUpperCase();
  if (u === 'HIGH' || u === 'MEDIUM' || u === 'LOW') return u;
  return 'MEDIUM';
}

/** LLMs sometimes emit objects; avoid `[object Object]` in logs and UI. */
function formatChannelSpecificIssue(item: unknown): string {
  if (typeof item === 'string') return item.trim();
  if (item != null && typeof item === 'object' && !Array.isArray(item)) {
    const o = item as Record<string, unknown>;
    const issue = typeof o.issue === 'string' ? o.issue.trim() : '';
    const message = typeof o.message === 'string' ? o.message.trim() : '';
    const summary = typeof o.summary === 'string' ? o.summary.trim() : '';
    const text = issue || message || summary;
    if (text) return text;
    try {
      return JSON.stringify(o).slice(0, 500);
    } catch {
      return '';
    }
  }
  if (item == null) return '';
  return String(item).trim();
}

function countFromWarnings(warnings: ComplianceWarningItem[]): { high: number; medium: number; low: number } {
  let high = 0;
  let medium = 0;
  let low = 0;
  for (const w of warnings) {
    if (w.severity === 'HIGH') high++;
    else if (w.severity === 'MEDIUM') medium++;
    else low++;
  }
  return { high, medium, low };
}

/** Exported for unit tests. */
export function parseComplianceScanJson(raw: string): ComplianceScanResult {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return { ...PARSE_FAILURE };
    const p = JSON.parse(m[0]) as Record<string, unknown>;

    let verdict: 'PASS' | 'WARNING' =
      p.verdict === 'PASS' || p.verdict === 'WARNING' ? p.verdict : 'WARNING';
    const warningsRaw = Array.isArray(p.warnings) ? p.warnings : [];
    const warnings: ComplianceWarningItem[] = warningsRaw
      .slice(0, 50)
      .map((w) => {
        const o = w as Record<string, unknown>;
        return {
          check: typeof o.check === 'string' ? o.check : 'unknown',
          severity: normalizeSeverity(o.severity),
          location: typeof o.location === 'string' ? o.location : '',
          issue: typeof o.issue === 'string' ? o.issue : '',
          suggestion: typeof o.suggestion === 'string' ? o.suggestion : '',
        };
      })
      .filter((w) => w.issue.length > 0 || w.suggestion.length > 0);

    const wcRaw = p.warning_count as Record<string, unknown> | undefined;
    let warning_count = countFromWarnings(warnings);
    if (
      wcRaw &&
      typeof wcRaw.high === 'number' &&
      typeof wcRaw.medium === 'number' &&
      typeof wcRaw.low === 'number'
    ) {
      warning_count = {
        high: Math.max(0, Math.round(wcRaw.high)),
        medium: Math.max(0, Math.round(wcRaw.medium)),
        low: Math.max(0, Math.round(wcRaw.low)),
      };
    } else {
      warning_count = countFromWarnings(warnings);
    }

    const channel_specific_issues = Array.isArray(p.channel_specific_issues)
      ? p.channel_specific_issues
          .slice(0, 20)
          .map((item) => formatChannelSpecificIssue(item))
          .filter((s) => s.length > 0)
      : [];

    let email_compliance: EmailComplianceBlock | null | undefined;
    const ec = p.email_compliance;
    if (ec === null || ec === undefined) {
      email_compliance = ec === null ? null : undefined;
    } else if (typeof ec === 'object' && !Array.isArray(ec)) {
      const e = ec as Record<string, unknown>;
      email_compliance = {
        has_unsubscribe_mention: typeof e.has_unsubscribe_mention === 'boolean' ? e.has_unsubscribe_mention : undefined,
        has_sender_identification:
          typeof e.has_sender_identification === 'boolean' ? e.has_sender_identification : undefined,
        spam_trigger_count: typeof e.spam_trigger_count === 'number' ? Math.max(0, Math.round(e.spam_trigger_count)) : undefined,
        spam_triggers_found: Array.isArray(e.spam_triggers_found) ? e.spam_triggers_found.map(String).slice(0, 30) : undefined,
      };
    }

    if (warnings.length > 0 && verdict === 'PASS') {
      verdict = 'WARNING';
    }
    if (warnings.length === 0 && verdict === 'WARNING') {
      verdict = 'PASS';
    }

    return {
      verdict,
      warnings,
      warning_count,
      channel_specific_issues,
      email_compliance,
    };
  } catch {
    return { ...PARSE_FAILURE };
  }
}

export interface RunComplianceScanArgs {
  organizationId: string;
  contentText: string;
  tenantId: string;
  contentType: string;
  targetChannel: string;
  userQuery?: string;
  /** Narrow product-truth / blocked-claims context */
  topic?: string;
  /** Red team / tests: inject markdown instead of `loadProductTruthSheetMd` */
  productTruthContextMdOverride?: string;
  /** Red team: skip LLM and parse this string (deterministic CI) */
  redTeamRawResponseOverride?: string;
  onRawModelResponse?: (raw: string) => void;
  /** Instagram: extracted image prompt / alt for deterministic rules */
  imagePrompt?: string | null;
  visualDescription?: string | null;
}

export async function runComplianceScan(args: RunComplianceScanArgs): Promise<ComplianceScanResult> {
  const {
    organizationId,
    contentText,
    tenantId,
    contentType,
    targetChannel,
    userQuery = 'compliance_scan',
    topic,
    productTruthContextMdOverride,
    redTeamRawResponseOverride,
    onRawModelResponse,
    imagePrompt,
    visualDescription,
  } = args;
  const trimmed = contentText.trim();
  if (!trimmed) {
    return {
      verdict: 'PASS',
      warnings: [],
      warning_count: { high: 0, medium: 0, low: 0 },
      channel_specific_issues: [],
      email_compliance: null,
    };
  }

  if (redTeamRawResponseOverride !== undefined) {
    onRawModelResponse?.(redTeamRawResponseOverride);
    let parsed = parseComplianceScanJson(redTeamRawResponseOverride);
    parsed = applyInstagramComplianceRules(parsed, {
      targetChannel,
      contentText: trimmed,
      visualDescription: visualDescription ?? null,
      imagePrompt: imagePrompt ?? null,
    });
    return parsed;
  }

  const blockedMd =
    productTruthContextMdOverride ??
    (await loadProductTruthSheetMd(organizationId, {
      topic,
      includeCompetitors: true,
    }));

  const userBlock = `## CONTENT

${trimmed.slice(0, 20_000)}

---

## CONTENT_TYPE

${contentType.slice(0, 200)}

---

## TARGET_CHANNEL

${targetChannel.slice(0, 200)}

---

## BLOCKED_CLAIMS_AND_PRODUCT_TRUTH

${blockedMd.slice(0, 24_000)}`;

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: COMPLIANCE_SCANNER_SYSTEM_PROMPT },
    { role: 'user', content: userBlock },
  ];

  const res = await callModelSafe({
    tier: 'fast',
    messages,
    tenantId,
    maxTokens: 1400,
    temperature: 0.15,
    userQuery,
  });

  const raw = res.choices?.[0]?.message?.content?.trim() ?? '';
  onRawModelResponse?.(raw);
  let parsed = parseComplianceScanJson(raw);
  parsed = applyInstagramComplianceRules(parsed, {
    targetChannel,
    contentText: trimmed,
    visualDescription: visualDescription ?? null,
    imagePrompt: imagePrompt ?? null,
  });
  return parsed;
}

export function formatComplianceScanSummary(result: ComplianceScanResult): string {
  const lines: string[] = [
    `**Compliance:** ${result.verdict === 'PASS' ? 'no warnings flagged' : 'warnings — human review'}`,
    `**Counts:** HIGH ${result.warning_count.high} · MEDIUM ${result.warning_count.medium} · LOW ${result.warning_count.low}`,
  ];
  if (result.warnings.length > 0) {
    lines.push('**Warnings:**');
    for (const w of result.warnings.slice(0, 12)) {
      lines.push(
        `- [${w.severity}] **${w.check}** (${w.location}): ${w.issue}${w.suggestion ? ` — *${w.suggestion}*` : ''}`,
      );
    }
  }
  if (result.channel_specific_issues.length > 0) {
    lines.push(`**Channel:** ${result.channel_specific_issues.join('; ')}`);
  }
  if (result.email_compliance && Object.keys(result.email_compliance).length > 0) {
    const e = result.email_compliance;
    const bits: string[] = [];
    if (e.has_unsubscribe_mention !== undefined) bits.push(`unsubscribe mentioned: ${e.has_unsubscribe_mention}`);
    if (e.has_sender_identification !== undefined) bits.push(`sender ID: ${e.has_sender_identification}`);
    if (e.spam_trigger_count !== undefined) bits.push(`spam triggers: ${e.spam_trigger_count}`);
    if (bits.length > 0) lines.push(`**Email:** ${bits.join('; ')}`);
  }
  return lines.join('\n');
}
