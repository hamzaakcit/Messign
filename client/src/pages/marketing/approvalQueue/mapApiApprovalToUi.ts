import type {
  ApprovalQueueItem,
  BrandVoicePayload,
  CompliancePayload,
  ProductTruthPayload,
  RevisionSnapshot,
  TargetChannel,
} from './types';

import type { MarketingApprovalApiRow } from '@/lib/marketingApi';
export type { MarketingApprovalApiRow };

function mapChannel(ch: string | null): TargetChannel {
  const c = (ch ?? '').toLowerCase();
  if (c.includes('linkedin')) return 'linkedin';
  if (c === 'instagram' || c.includes('instagram')) return 'instagram';
  if (c === 'email') return 'email';
  if (c === 'blog' || c.includes('blog')) return 'blog';
  if (c === 'social' || c.includes('social')) return 'social';
  if (c.includes('battle')) return 'battlecard';
  return 'other';
}

function asProductTruth(raw: unknown): ProductTruthPayload {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const checksRaw = o.checks && typeof o.checks === 'object' ? (o.checks as Record<string, unknown>) : {};
  const block = (key: string) => {
    const b = checksRaw[key] && typeof checksRaw[key] === 'object' ? (checksRaw[key] as Record<string, unknown>) : {};
    return {
      status: b.status === 'FAIL' ? 'FAIL' : 'PASS',
      details: typeof b.details === 'string' ? b.details : null,
    } as ProductTruthPayload['checks']['feature_references'];
  };
  return {
    verdict: o.verdict === 'FAIL' ? 'FAIL' : 'PASS',
    checks: {
      feature_references: block('feature_references'),
      blocked_claims: block('blocked_claims'),
      fabricated_metrics: block('fabricated_metrics'),
      superlatives: block('superlatives'),
      glossary_compliance: block('glossary_compliance'),
    },
    failed_reasons: Array.isArray(o.failed_reasons) ? o.failed_reasons.map(String) : [],
    features_referenced: Array.isArray(o.features_referenced) ? o.features_referenced.map(String) : [],
    metrics_found: Array.isArray(o.metrics_found) ? o.metrics_found.map(String) : [],
  };
}

function asBrandVoice(raw: unknown): BrandVoicePayload {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const dims = o.dimensions && typeof o.dimensions === 'object' ? (o.dimensions as Record<string, unknown>) : {};
  const pickDim = (k: keyof BrandVoicePayload['dimensions']) =>
    typeof dims[k] === 'number' ? (dims[k] as number) : undefined;
  return {
    score: typeof o.score === 'number' ? o.score : 0,
    dimensions: {
      tone_voice: pickDim('tone_voice'),
      clarity_structure: pickDim('clarity_structure'),
      audience_positioning: pickDim('audience_positioning'),
      claims_proof_safety: pickDim('claims_proof_safety'),
      taboo_policy: pickDim('taboo_policy'),
    },
    strengths: Array.isArray(o.strengths) ? o.strengths.map(String) : [],
    improvements: Array.isArray(o.improvements) ? o.improvements.map(String) : [],
    taboo_violations: Array.isArray(o.taboo_violations) ? o.taboo_violations.map(String) : [],
    anti_example_matches: Array.isArray(o.anti_example_matches) ? o.anti_example_matches.map(String) : [],
    passes: typeof o.passes === 'boolean' ? o.passes : undefined,
  };
}

function asCompliance(raw: unknown): CompliancePayload {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const warningsRaw = Array.isArray(o.warnings) ? o.warnings : [];
  const warnings = warningsRaw.map((w) => {
    const x = w && typeof w === 'object' ? (w as Record<string, unknown>) : {};
    return {
      check: String(x.check ?? ''),
      severity: (['HIGH', 'MEDIUM', 'LOW'].includes(String(x.severity).toUpperCase())
        ? String(x.severity).toUpperCase()
        : 'MEDIUM') as CompliancePayload['warnings'][0]['severity'],
      location: String(x.location ?? ''),
      issue: String(x.issue ?? ''),
      suggestion: String(x.suggestion ?? ''),
    };
  });
  const wc = o.warning_count && typeof o.warning_count === 'object' ? (o.warning_count as Record<string, unknown>) : {};
  return {
    verdict: o.verdict === 'WARNING' ? 'WARNING' : 'PASS',
    warnings,
    warning_count: {
      high: typeof wc.high === 'number' ? wc.high : warnings.filter((x) => x.severity === 'HIGH').length,
      medium: typeof wc.medium === 'number' ? wc.medium : warnings.filter((x) => x.severity === 'MEDIUM').length,
      low: typeof wc.low === 'number' ? wc.low : warnings.filter((x) => x.severity === 'LOW').length,
    },
    channel_specific_issues: Array.isArray(o.channel_specific_issues)
      ? o.channel_specific_issues.map(String)
      : [],
    email_compliance: o.email_compliance as CompliancePayload['email_compliance'],
  };
}

function mapRevisions(raw: unknown): RevisionSnapshot[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw.map((r, i) => {
    const o = r && typeof r === 'object' ? (r as Record<string, unknown>) : {};
    return {
      version: typeof o.version === 'number' ? o.version : i + 1,
      label: String(o.label ?? 'Revision'),
      savedAt: String(o.savedAt ?? ''),
      body: String(o.body ?? ''),
    };
  });
}

export function mapApiRowToApprovalItem(row: MarketingApprovalApiRow): ApprovalQueueItem {
  const truth = asProductTruth(row.truth_validation);
  const brand = asBrandVoice(row.brand_voice_check);
  const comp = asCompliance(row.compliance_scan);
  return {
    id: row.id,
    contentId: row.content_id,
    title: row.content_title || 'Untitled',
    targetChannel: mapChannel(row.content_channel),
    campaignName: row.campaign_name?.trim() || '—',
    campaignId: row.campaign_id ?? '',
    submittedAt: row.submitted_at,
    userBrief: row.user_brief?.trim() || '—',
    body: row.content_body?.trim() || '',
    brandVoiceScore: brand.score,
    productTruth: truth,
    brandVoice: brand,
    compliance: comp,
    revisions: mapRevisions(row.revision_history),
  };
}
