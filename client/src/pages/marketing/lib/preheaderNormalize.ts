// ─────────────────────────────────────────────────────────────────────────────
// Preheader length normalization (inbox preview / deliverability)
// ─────────────────────────────────────────────────────────────────────────────

/** Hidden preheader should be substantive for inbox previews (WCAG / deliverability guidance). */
export const RECOMMENDED_PREHEADER_MIN_CHARS = 100;
export const RECOMMENDED_PREHEADER_MAX_CHARS = 200;

const MIN_PREHEADER_CHARS = RECOMMENDED_PREHEADER_MIN_CHARS;
const MAX_PREHEADER_CHARS = RECOMMENDED_PREHEADER_MAX_CHARS;

/**
 * Ensures preheader text is long enough for inbox snippet previews; idempotent if already long.
 */
export function normalizePreheaderForEmail(preheader: string, subject: string): string {
  let p = (preheader || '').trim();
  const sub = (subject || '').trim();
  if (p.length >= MIN_PREHEADER_CHARS) return p.slice(0, MAX_PREHEADER_CHARS);
  if (!p) p = sub || 'Important update for you.';
  const filler = ' Discover more inside — open this email for details.';
  let guard = 0;
  while (p.length < MIN_PREHEADER_CHARS && guard < 25) {
    p += filler;
    guard += 1;
  }
  return p.slice(0, MAX_PREHEADER_CHARS);
}
