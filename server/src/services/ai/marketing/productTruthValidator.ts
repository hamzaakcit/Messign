/**
 * Product Truth Validator — fast-tier LLM + JSON parse (used by tool and marketing content API).
 */
import OpenAI from 'openai';
import { callModelSafe } from '../gateway.js';
import { PRODUCT_TRUTH_VALIDATOR_SYSTEM_PROMPT } from '../../../modules/marketing/prompts/productTruthValidatorPrompt.js';
import { loadProductTruthSheetMd } from '../../../dal/marketing/truthBrand.js';

export type CheckStatus = 'PASS' | 'FAIL';

export interface ProductTruthCheckBlock {
  status: CheckStatus;
  details: string | null;
}

export interface ProductTruthValidationResult {
  verdict: CheckStatus;
  checks: {
    feature_references: ProductTruthCheckBlock;
    blocked_claims: ProductTruthCheckBlock;
    fabricated_metrics: ProductTruthCheckBlock;
    superlatives: ProductTruthCheckBlock;
    glossary_compliance: ProductTruthCheckBlock;
  };
  failed_reasons: string[];
  features_referenced: string[];
  metrics_found: string[];
}

const EMPTY_CHECK = (status: CheckStatus = 'PASS'): ProductTruthCheckBlock => ({
  status,
  details: null,
});

function fallbackFail(reason: string): ProductTruthValidationResult {
  return {
    verdict: 'FAIL',
    checks: {
      feature_references: { status: 'FAIL', details: reason },
      blocked_claims: EMPTY_CHECK('FAIL'),
      fabricated_metrics: EMPTY_CHECK('FAIL'),
      superlatives: EMPTY_CHECK('FAIL'),
      glossary_compliance: EMPTY_CHECK('FAIL'),
    },
    failed_reasons: [reason],
    features_referenced: [],
    metrics_found: [],
  };
}

/** Exported for unit tests. */
export function parseProductTruthValidationJson(raw: string): ProductTruthValidationResult {
  const failParse = (): ProductTruthValidationResult =>
    fallbackFail('Could not parse validator output — manual review required.');

  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return failParse();
    const p = JSON.parse(m[0]) as Record<string, unknown>;

    const verdict = p.verdict === 'PASS' || p.verdict === 'FAIL' ? p.verdict : 'FAIL';
    const checksRaw = p.checks as Record<string, unknown> | undefined;
    const pick = (key: string): ProductTruthCheckBlock => {
      const c = checksRaw?.[key] as Record<string, unknown> | undefined;
      const st = c?.status === 'PASS' || c?.status === 'FAIL' ? c.status : 'FAIL';
      const d = c?.details;
      return {
        status: st,
        details: typeof d === 'string' && d.length > 0 ? d : null,
      };
    };

    const failed = Array.isArray(p.failed_reasons) ? p.failed_reasons.map(String) : [];
    const features = Array.isArray(p.features_referenced) ? p.features_referenced.map(String) : [];
    const metrics = Array.isArray(p.metrics_found) ? p.metrics_found.map(String) : [];

    return {
      verdict,
      checks: {
        feature_references: pick('feature_references'),
        blocked_claims: pick('blocked_claims'),
        fabricated_metrics: pick('fabricated_metrics'),
        superlatives: pick('superlatives'),
        glossary_compliance: pick('glossary_compliance'),
      },
      failed_reasons: failed,
      features_referenced: features,
      metrics_found: metrics,
    };
  } catch {
    return failParse();
  }
}

export interface RunProductTruthValidationOptions {
  organizationId: string;
  contentText: string;
  /** For callModelSafe / LiteLLM routing */
  tenantId: string;
  userQuery?: string;
  /** Narrow truth context load (optional) */
  topic?: string;
  /** Red team / tests: inject markdown instead of `loadProductTruthSheetMd` */
  productTruthContextMdOverride?: string;
  /** Red team: skip LLM and parse this string (deterministic CI) */
  redTeamRawResponseOverride?: string;
  /** Observe raw assistant text before parsing (e.g. red team: no markdown wrappers) */
  onRawModelResponse?: (raw: string) => void;
}

export async function runProductTruthValidation(
  options: RunProductTruthValidationOptions,
): Promise<ProductTruthValidationResult> {
  const {
    organizationId,
    contentText,
    tenantId,
    userQuery = 'product_truth_validation',
    topic,
    productTruthContextMdOverride,
    redTeamRawResponseOverride,
    onRawModelResponse,
  } = options;
  const trimmed = contentText.trim();
  if (!trimmed) {
    return fallbackFail('Empty content — nothing to validate.');
  }

  if (redTeamRawResponseOverride !== undefined) {
    onRawModelResponse?.(redTeamRawResponseOverride);
    return parseProductTruthValidationJson(redTeamRawResponseOverride);
  }

  const productTruthMd =
    productTruthContextMdOverride ??
    (await loadProductTruthSheetMd(organizationId, {
      topic,
      includeCompetitors: true,
    }));

  const userBlock = `## CONTENT

${trimmed.slice(0, 24_000)}

---

## PRODUCT_TRUTH_CONTEXT

${productTruthMd.slice(0, 28_000)}`;

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: PRODUCT_TRUTH_VALIDATOR_SYSTEM_PROMPT },
    { role: 'user', content: userBlock },
  ];

  const res = await callModelSafe({
    tier: 'fast',
    messages,
    tenantId,
    maxTokens: 1200,
    temperature: 0.1,
    userQuery,
  });

  const raw = res.choices?.[0]?.message?.content?.trim() ?? '';
  onRawModelResponse?.(raw);
  return parseProductTruthValidationJson(raw);
}
