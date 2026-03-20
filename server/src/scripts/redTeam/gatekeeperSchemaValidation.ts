/**
 * Structural validation for parsed gatekeeper outputs (red team + CI).
 */
import type { ProductTruthValidationResult } from '../../services/ai/marketing/productTruthValidator.js';
import type { BrandVoiceCheckResult } from '../../services/ai/marketing/brandVoiceChecker.js';
import type { ComplianceScanResult } from '../../services/ai/marketing/complianceScanner.js';

const BV_DIMS = ['tone_voice', 'clarity_structure', 'audience_positioning', 'claims_proof_safety', 'taboo_policy'] as const;

/** Reject obvious markdown fences or leading chatter (best-effort; models should return raw JSON). */
export function assertRawAssistantLooksLikeJsonOnly(raw: string, label: string): void {
  const t = raw.trim();
  if (t.startsWith('```')) {
    throw new Error(`${label}: response starts with markdown fence — expected raw JSON only`);
  }
  if (t.length > 0 && !t.startsWith('{')) {
    throw new Error(`${label}: response does not start with "{" — possible preamble before JSON`);
  }
}

export function validateProductTruthSchema(r: ProductTruthValidationResult): void {
  if (r.verdict !== 'PASS' && r.verdict !== 'FAIL') throw new Error('truth: invalid verdict');
  const keys = ['feature_references', 'blocked_claims', 'fabricated_metrics', 'superlatives', 'glossary_compliance'] as const;
  for (const k of keys) {
    const b = r.checks[k];
    if (!b || (b.status !== 'PASS' && b.status !== 'FAIL')) throw new Error(`truth: bad check ${k}`);
  }
  if (!Array.isArray(r.failed_reasons)) throw new Error('truth: failed_reasons');
  if (!Array.isArray(r.features_referenced)) throw new Error('truth: features_referenced');
  if (!Array.isArray(r.metrics_found)) throw new Error('truth: metrics_found');
}

export function validateBrandVoiceSchema(r: BrandVoiceCheckResult): void {
  if (typeof r.score !== 'number' || r.score < 0 || r.score > 100) throw new Error('brand: score 0-100');
  for (const k of BV_DIMS) {
    const v = r.dimensions[k];
    if (v !== undefined && (v < 0 || v > 20)) throw new Error(`brand: dimension ${k} out of 0-20`);
  }
  if (!Array.isArray(r.strengths)) throw new Error('brand: strengths');
  if (!Array.isArray(r.improvements)) throw new Error('brand: improvements');
  if (!Array.isArray(r.taboo_violations)) throw new Error('brand: taboo_violations');
  if (!Array.isArray(r.anti_example_matches)) throw new Error('brand: anti_example_matches');
  if (typeof r.passes !== 'boolean') throw new Error('brand: passes');
}

export function validateComplianceSchema(r: ComplianceScanResult): void {
  if (r.verdict !== 'PASS' && r.verdict !== 'WARNING') throw new Error('compliance: verdict');
  if (!Array.isArray(r.warnings)) throw new Error('compliance: warnings');
  for (const w of r.warnings) {
    if (!w.severity || !['HIGH', 'MEDIUM', 'LOW'].includes(w.severity)) throw new Error('compliance: severity');
  }
  const wc = r.warning_count;
  if (
    typeof wc.high !== 'number' ||
    typeof wc.medium !== 'number' ||
    typeof wc.low !== 'number' ||
    wc.high < 0 ||
    wc.medium < 0 ||
    wc.low < 0
  ) {
    throw new Error('compliance: warning_count');
  }
  if (!Array.isArray(r.channel_specific_issues)) throw new Error('compliance: channel_specific_issues');
}
