// ─────────────────────────────────────────────────────────────────────────────
// Inbox preview — approximate subject/preheader truncation (Gmail/iOS-style)
// ─────────────────────────────────────────────────────────────────────────────

import {
  RECOMMENDED_PREHEADER_MAX_CHARS,
  RECOMMENDED_PREHEADER_MIN_CHARS,
} from './preheaderNormalize';

/** Typical mobile subject truncation (varies by client). */
export const TYPICAL_SUBJECT_MAX = 55;

/** Snippet line after subject — many clients show ~90–140 chars in preview. */
export const TYPICAL_PREHEADER_MAX = 100;

/** Align with assembler: preheader should be substantive for snippets. */
export { RECOMMENDED_PREHEADER_MIN_CHARS, RECOMMENDED_PREHEADER_MAX_CHARS };

export interface InboxTruncationResult {
  display: string;
  truncated: boolean;
}

export interface InboxCopyEvaluation {
  subjectLength: number;
  preheaderLength: number;
  subjectOverRecommended: boolean;
  preheaderUnderRecommended: boolean;
  preheaderOverSoftMax: boolean;
  warnings: string[];
}

/**
 * Truncate a line for inbox preview simulation; adds ellipsis when over max.
 */
export function truncateInboxLine(text: string, max: number): InboxTruncationResult {
  const t = (text || '').trim();
  if (t.length <= max) return { display: t, truncated: false };
  return { display: `${t.slice(0, Math.max(0, max - 1))}…`, truncated: true };
}

/**
 * Character-budget guidance for subject + preheader (Phase 2 inbox QA).
 */
export function evaluateInboxCopy(subject: string, preheader: string): InboxCopyEvaluation {
  const s = (subject || '').trim();
  const p = (preheader || '').trim();
  const warnings: string[] = [];
  if (s.length > TYPICAL_SUBJECT_MAX) {
    warnings.push(`Subject is ${s.length} chars — many clients truncate around ${TYPICAL_SUBJECT_MAX}.`);
  }
  if (p.length > 0 && p.length < RECOMMENDED_PREHEADER_MIN_CHARS) {
    warnings.push(
      `Preheader is ${p.length} chars — aim for at least ${RECOMMENDED_PREHEADER_MIN_CHARS} for strong inbox snippets.`,
    );
  }
  if (p.length > RECOMMENDED_PREHEADER_MAX_CHARS) {
    warnings.push(`Preheader exceeds ${RECOMMENDED_PREHEADER_MAX_CHARS} chars — assembler may trim.`);
  }
  if (p.length > TYPICAL_PREHEADER_MAX && p.length <= RECOMMENDED_PREHEADER_MAX_CHARS) {
    warnings.push(
      `Some mobile clients show ~${TYPICAL_PREHEADER_MAX} chars of snippet — key words early.`,
    );
  }
  return {
    subjectLength: s.length,
    preheaderLength: p.length,
    subjectOverRecommended: s.length > TYPICAL_SUBJECT_MAX,
    preheaderUnderRecommended: p.length > 0 && p.length < RECOMMENDED_PREHEADER_MIN_CHARS,
    preheaderOverSoftMax: p.length > RECOMMENDED_PREHEADER_MAX_CHARS,
    warnings,
  };
}
