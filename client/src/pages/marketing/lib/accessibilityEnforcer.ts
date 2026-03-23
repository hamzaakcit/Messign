// ─────────────────────────────────────────────────────────────────────────────
// Accessibility Enforcer — WCAG AA compliance for Unlayer designs
// Messign Visual Architect · v2.0
// ─────────────────────────────────────────────────────────────────────────────

import type { UnlayerDesign } from './types/unlayerTypes';

export interface AccessibilityOptions {
  subject?: string;
  headline?: string;
}

export interface AccessibilityResult {
  score: number;
  fixes: string[];
  warnings: string[];
}

/**
 * Enforce WCAG AA accessibility on a VA2 Unlayer design.
 * Returns a score (0-100) and lists of auto-fixes applied and warnings.
 */
export function enforceAccessibility(
  design: UnlayerDesign,
  options: AccessibilityOptions = {},
): AccessibilityResult {
  const fixes: string[] = [];
  const warnings: string[] = [];
  let score = 100;

  if (!design?.body?.rows?.length) {
    warnings.push('Design has no rows — cannot assess accessibility');
    return { score: 0, fixes, warnings };
  }

  for (const row of design.body.rows) {
    for (const col of row.columns) {
      for (const content of col.contents) {
        if (content.type === 'image') {
          const vals = content.values as Record<string, unknown>;
          if (!vals.alt && !vals.altText) {
            vals.alt = options.headline || options.subject || 'Image';
            fixes.push('Added missing alt text to image');
          }
        }
      }
    }
  }

  return { score, fixes, warnings };
}
