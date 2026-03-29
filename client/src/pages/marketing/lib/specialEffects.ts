// ─────────────────────────────────────────────────────────────────────────────
// Special Effects — Paper Plane Multi-Phase Overlay
// Messign Visual Architect · v2.0
// ─────────────────────────────────────────────────────────────────────────────

import type { ThemeName } from './types/designTokenTypes';
import type { UnlayerRow as Va2UnlayerRow } from './types/unlayerTypes';
import type { ManifestSection } from './types/manifestTypes';
import type { OverlayIntensity, PaperPlaneUiEffect } from './motionOverlayManifest';
import {
  buildPhaseOverlayRow,
  removeAllOverlays,
  type OverlayPhase,
  type OverlayInjectionPlan,
  type PhaseMotionType,
} from './overlayEngine';
import { getPlaneAssetUrl, PLANE_WIDTH, PLANE_HEIGHT } from './paperPlaneAssets';

// ── Types ────────────────────────────────────────────────────────────────────

export type EasterEggType = 'paper_plane' | 'none';

export type { PaperPlaneUiEffect } from './motionOverlayManifest';

export const EASTER_EGG_OPTIONS: { value: PaperPlaneUiEffect; label: string }[] = [
  { value: 'none', label: 'Off' },
  { value: 'paper_plane_signature', label: 'Paper plane (full sweep)' },
  { value: 'paper_plane_subtle', label: 'Paper plane (subtle)' },
];

/** Guard to validate an unknown value as a supported Easter Egg type. */
export function isValidEasterEgg(value: unknown): value is EasterEggType {
  return value === 'paper_plane' || value === 'none';
}

export interface BuildMultiPhaseOverlayOptions {
  intensity?: OverlayIntensity;
  /** Optional org brand hex — harmonizes AI plane asset and cached URL key */
  brandPrimaryHex?: string;
}

const AVG_ROW_HEIGHT_PX = 72;
const MIN_EST_HEIGHT = 600;
const SECTION_HEIGHT_HEURISTIC = 280;

/**
 * Estimate email canvas height for sweep keyframes using section count, row map depth, and row totals.
 */
export function estimateEmailHeightForOverlay(
  sectionsLength: number,
  sectionStartRowMap: number[] | undefined,
  totalRowCount: number | undefined,
): number {
  const sectionBased = Math.max(MIN_EST_HEIGHT, sectionsLength * SECTION_HEIGHT_HEURISTIC);
  if (totalRowCount != null && totalRowCount > 0) {
    const rowBased = Math.max(MIN_EST_HEIGHT, Math.round(totalRowCount * AVG_ROW_HEIGHT_PX));
    if (sectionStartRowMap && sectionStartRowMap.length > 0) {
      const span = Math.max(1, sectionStartRowMap.length - 1);
      const avgRowsPerSection = totalRowCount / span;
      const blended = Math.round(rowBased * 0.65 + avgRowsPerSection * SECTION_HEIGHT_HEURISTIC * 0.35);
      return Math.max(MIN_EST_HEIGHT, blended, Math.min(rowBased, sectionBased));
    }
    return Math.max(MIN_EST_HEIGHT, rowBased, Math.min(rowBased + 120, sectionBased));
  }
  return sectionBased;
}

function pickMotionForIntensity(intensity: OverlayIntensity): PhaseMotionType {
  return intensity === 'subtle' ? 'weave' : 'sweep';
}

// ── Full-Sweep Builder ───────────────────────────────────────────────────────

/**
 * Build a single-row paper plane overlay that sweeps through the entire email.
 * Places one phantom row at index 0 with a full-height animation that weaves
 * left-right while descending through all content blocks, then reverses.
 * Uses CSS :has() to force ancestor overflow:visible so the plane escapes
 * the row container and visually crosses all sections.
 */
export function buildMultiPhaseOverlay(
  sections: ManifestSection[],
  theme: ThemeName,
  sectionStartRowMap?: number[],
  totalRowCount?: number,
  options?: BuildMultiPhaseOverlayOptions,
): OverlayInjectionPlan | null {
  if (!sections || sections.length === 0) return null;

  const intensity = options?.intensity ?? 'signature';
  const motionType = pickMotionForIntensity(intensity);
  const brandHex = options?.brandPrimaryHex;
  const estimatedHeight =
    motionType === 'weave'
      ? Math.min(520, estimateEmailHeightForOverlay(sections.length, sectionStartRowMap, totalRowCount))
      : estimateEmailHeightForOverlay(sections.length, sectionStartRowMap, totalRowCount);

  const planeUrl = getPlaneAssetUrl(theme, brandHex);
  const planeAssetHtml = `<img src="${planeUrl}" width="${PLANE_WIDTH}" height="${PLANE_HEIGHT}" alt="" role="presentation" style="display:block;border:0;outline:none;">`;

  const phase: OverlayPhase = {
    index: 0,
    totalPhases: 1,
    entryDirection: 'left',
    animationDelay: '0s',
    shadowDepth: 0.28,
    scale: 1.0,
    tiltDeg: 2,
    motionType,
    estimatedEmailHeight: estimatedHeight,
    sectionBgColor: 'transparent',
  };

  const row = buildPhaseOverlayRow(planeAssetHtml, phase, theme, undefined, intensity);

  return { rows: [row], insertionIndices: [0] };
}

/**
 * Build a single-row fallback overlay for simpler cases (v1 assembler).
 * Uses the same full-height sweep motion as multi-section builds so wind layers,
 * ambient ribbons, and shadow sync match the primary path.
 */
export function buildPaperPlaneEffect(
  theme: ThemeName,
  intensity: OverlayIntensity = 'signature',
  brandPrimaryHex?: string,
): Va2UnlayerRow {
  const planeUrl = getPlaneAssetUrl(theme, brandPrimaryHex);
  const planeAssetHtml = `<img src="${planeUrl}" width="${PLANE_WIDTH}" height="${PLANE_HEIGHT}" alt="" role="presentation" style="display:block;border:0;outline:none;">`;

  const motionType = pickMotionForIntensity(intensity);
  const phase: OverlayPhase = {
    index: 0,
    totalPhases: 1,
    entryDirection: 'left',
    animationDelay: '0s',
    shadowDepth: 0.28,
    scale: 1.0,
    tiltDeg: 2,
    motionType,
    estimatedEmailHeight: motionType === 'weave' ? 420 : 960,
    sectionBgColor: 'transparent',
  };

  return buildPhaseOverlayRow(planeAssetHtml, phase, theme, undefined, intensity);
}

/**
 * Apply a full-sweep paper plane overlay to an existing Unlayer design (plain-text / legacy AI draft).
 * Places a single phantom row at position 0 that animates the plane through all content blocks.
 */
export function applyPaperPlaneToLegacyDesign(
  design: Record<string, unknown>,
  theme: ThemeName,
  options?: { intensity?: OverlayIntensity; brandPrimaryHex?: string },
): Record<string, unknown> {
  const intensity = options?.intensity ?? 'signature';
  const brandHex = options?.brandPrimaryHex;
  const clone = structuredClone(design) as { body?: { rows?: Va2UnlayerRow[] } };
  if (!clone.body?.rows) {
    return design;
  }

  removeAllOverlays(clone);

  const contentRows = clone.body.rows.filter(
    (row) => !(row?.values as { _isOverlay?: boolean } | undefined)?._isOverlay,
  );
  const n = contentRows.length;
  if (n === 0) {
    clone.body.rows.unshift(buildPaperPlaneEffect(theme, intensity, brandHex));
    return clone as Record<string, unknown>;
  }

  const synthetic: ManifestSection[] = contentRows.map((_, i) => ({
    type: i === 0 ? 'hero' : 'text_block' as ManifestSection['type'],
    order: i,
    content: {},
  }));

  const plan = buildMultiPhaseOverlay(synthetic, theme, undefined, n, { intensity, brandPrimaryHex: brandHex });
  if (!plan || plan.rows.length === 0) {
    clone.body.rows.unshift(buildPaperPlaneEffect(theme, intensity, brandHex));
    return clone as Record<string, unknown>;
  }

  clone.body.rows.unshift(plan.rows[0]);

  return clone as Record<string, unknown>;
}
