/**
 * Approval queue types — aligned with server gatekeeper payloads (`truth_validation`, `brand_voice_check`, compliance).
 */

export type TargetChannel = 'blog' | 'email' | 'social' | 'linkedin' | 'battlecard' | 'other';

export type RejectionReason = 'off_brand' | 'factually_wrong' | 'wrong_audience' | 'needs_polish' | 'other';

export interface ProductTruthCheckBlock {
  status: 'PASS' | 'FAIL';
  details: string | null;
}

export interface ProductTruthPayload {
  verdict: 'PASS' | 'FAIL';
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

export type BrandDimensionKey =
  | 'tone_voice'
  | 'clarity_structure'
  | 'audience_positioning'
  | 'claims_proof_safety'
  | 'taboo_policy';

export interface BrandVoicePayload {
  score: number;
  dimensions: Partial<Record<BrandDimensionKey, number>>;
  strengths: string[];
  improvements: string[];
  taboo_violations: string[];
  anti_example_matches: string[];
  passes?: boolean;
}

export interface ComplianceWarning {
  check: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  location: string;
  issue: string;
  suggestion: string;
}

export interface CompliancePayload {
  verdict: 'PASS' | 'WARNING';
  warnings: ComplianceWarning[];
  warning_count: { high: number; medium: number; low: number };
  channel_specific_issues: string[];
  email_compliance?: Record<string, unknown> | null;
}

export type RiskLevel = 'high' | 'medium' | 'low' | 'none';

export interface RevisionSnapshot {
  version: number;
  label: string;
  savedAt: string;
  body: string;
}

export interface ApprovalQueueItem {
  id: string;
  /** marketing_content.id — used for API mutations */
  contentId?: string;
  title: string;
  targetChannel: TargetChannel;
  campaignName: string;
  campaignId: string;
  submittedAt: string;
  /** Original user brief / request */
  userBrief: string;
  /** Draft body */
  body: string;
  brandVoiceScore: number;
  productTruth: ProductTruthPayload;
  brandVoice: BrandVoicePayload;
  compliance: CompliancePayload;
  revisions?: RevisionSnapshot[];
}

export const BRAND_DIMENSION_LABELS: Record<BrandDimensionKey, string> = {
  tone_voice: 'Tone',
  clarity_structure: 'Structure',
  audience_positioning: 'Audience',
  claims_proof_safety: 'Vocabulary',
  taboo_policy: 'Personality',
};
