/**
 * VA2 layout density — typography and section rhythm helpers.
 * `layoutDensity` is distinct from `metadata.visual_density` (image enrichment).
 */

import type { LayoutDensity } from './types/designManifest.types';
import type { DesignTheme } from './types/designTokenTypes';

/** Effective density when manifest omits the field. */
export function getEffectiveLayoutDensity(raw: string | undefined): LayoutDensity {
  if (raw === 'airy' || raw === 'compact' || raw === 'normal') return raw;
  return 'normal';
}

export interface DensityTypeScale {
  /** Multiplier applied to theme hero headline font size (px). */
  heroHeadlineMultiplier: number;
  /** Multiplier for subheading font size. */
  subheadingMultiplier: number;
  /** Multiplier for body copy (image_text, CTA description). */
  bodyMultiplier: number;
  /** Multiplier for CTA button font size. */
  ctaMultiplier: number;
  /** Multiplier for section headings (h2/h3 in CTA, image_text). */
  sectionHeadingMultiplier: number;
  /** Extra padding (px) added to section row top when not overridden. */
  sectionPaddingTopExtraPx: number;
}

/**
 * Returns multipliers for typography and extra vertical rhythm per density.
 */
export function getDensityTypeScale(density: LayoutDensity): DensityTypeScale {
  switch (density) {
    case 'airy':
      return {
        heroHeadlineMultiplier: 1.06,
        subheadingMultiplier: 1.05,
        bodyMultiplier: 1.03,
        ctaMultiplier: 1,
        sectionHeadingMultiplier: 1.04,
        sectionPaddingTopExtraPx: 8,
      };
    case 'compact':
      return {
        heroHeadlineMultiplier: 0.92,
        subheadingMultiplier: 0.95,
        bodyMultiplier: 0.96,
        ctaMultiplier: 0.95,
        sectionHeadingMultiplier: 0.94,
        sectionPaddingTopExtraPx: 0,
      };
    default:
      return {
        heroHeadlineMultiplier: 1,
        subheadingMultiplier: 1,
        bodyMultiplier: 1,
        ctaMultiplier: 1,
        sectionHeadingMultiplier: 1,
        sectionPaddingTopExtraPx: 0,
      };
  }
}

/**
 * Apply density scale to hero headline font size (px).
 */
export function scaledHeroHeadlineFontSize(_theme: DesignTheme, density: LayoutDensity, basePx: number): number {
  const m = getDensityTypeScale(density).heroHeadlineMultiplier;
  return Math.round(basePx * m);
}

/**
 * Apply density scale to subheading font size (px).
 */
export function scaledSubheadingFontSize(theme: DesignTheme, density: LayoutDensity): number {
  const m = getDensityTypeScale(density).subheadingMultiplier;
  return Math.round(theme.typography.subheading.fontSize * m);
}

/**
 * Apply density scale to CTA font size (px).
 */
export function scaledCtaFontSize(theme: DesignTheme, density: LayoutDensity): number {
  const m = getDensityTypeScale(density).ctaMultiplier;
  return Math.round(theme.typography.cta.fontSize * m);
}

/**
 * Body copy size for image_text / CTA descriptions.
 */
export function scaledBodyFontSize(theme: DesignTheme, density: LayoutDensity): number {
  const m = getDensityTypeScale(density).bodyMultiplier;
  return Math.round(theme.typography.body.fontSize * m);
}

/**
 * Section heading (h2 in CTA, h3 in image_text) from theme heading tier.
 */
export function scaledSectionHeadingFromTheme(theme: DesignTheme, density: LayoutDensity): number {
  const m = getDensityTypeScale(density).sectionHeadingMultiplier;
  return Math.round(theme.typography.heading.fontSize * m);
}
