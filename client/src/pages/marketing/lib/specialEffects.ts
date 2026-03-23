// ─────────────────────────────────────────────────────────────────────────────
// Special Effects — Paper Plane Multi-Phase Overlay
// Messign Visual Architect · v2.0
// ─────────────────────────────────────────────────────────────────────────────

import type { ThemeName } from './types/designTokenTypes';
import type { UnlayerRow as Va2UnlayerRow } from './types/unlayerTypes';
import type { ManifestSection } from './types/manifestTypes';
import {
  buildPhaseOverlayRow,
  removeAllOverlays,
  type OverlayPhase,
  type OverlayInjectionPlan,
} from './overlayEngine';
import { getPlaneAssetUrl, PLANE_WIDTH, PLANE_HEIGHT } from './paperPlaneAssets';

// ── Types ────────────────────────────────────────────────────────────────────

export type EasterEggType = 'paper_plane' | 'none';

export const EASTER_EGG_OPTIONS: { value: EasterEggType; label: string }[] = [
  { value: 'none', label: 'Off' },
  { value: 'paper_plane', label: 'Paper Plane' },
];

/** Guard to validate an unknown value as a supported Easter Egg type. */
export function isValidEasterEgg(value: unknown): value is EasterEggType {
  return value === 'paper_plane' || value === 'none';
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
  _sectionStartRowMap?: number[],
  _totalRowCount?: number,
): OverlayInjectionPlan | null {
  if (!sections || sections.length === 0) return null;

  const planeUrl = getPlaneAssetUrl(theme);
  const planeAssetHtml = `<img src="${planeUrl}" width="${PLANE_WIDTH}" height="${PLANE_HEIGHT}" alt="" role="presentation" style="display:block;border:0;outline:none;">`;

  const estimatedHeight = Math.max(600, sections.length * 280);

  const phase: OverlayPhase = {
    index: 0,
    totalPhases: 1,
    entryDirection: 'left',
    animationDelay: '0s',
    shadowDepth: 0.2,
    scale: 1.0,
    tiltDeg: 2,
    motionType: 'sweep',
    estimatedEmailHeight: estimatedHeight,
    sectionBgColor: 'transparent',
  };

  const row = buildPhaseOverlayRow(planeAssetHtml, phase, theme);

  return { rows: [row], insertionIndices: [0] };
}

/**
 * Build a single-row fallback overlay for simpler cases (v1 assembler).
 * Uses a single glide phase instead of multi-phase distribution.
 */
export function buildPaperPlaneEffect(theme: ThemeName): Va2UnlayerRow {
  const planeUrl = getPlaneAssetUrl(theme);
  const planeAssetHtml = `<img src="${planeUrl}" width="${PLANE_WIDTH}" height="${PLANE_HEIGHT}" alt="" role="presentation" style="display:block;border:0;outline:none;">`;

  const phase: OverlayPhase = {
    index: 0,
    totalPhases: 1,
    entryDirection: 'left',
    animationDelay: '0s',
    shadowDepth: 0.2,
    scale: 1.0,
    tiltDeg: 2,
    motionType: 'glide',
    sectionBgColor: 'transparent',
  };

  return buildPhaseOverlayRow(planeAssetHtml, phase, theme);
}

/**
 * Apply a full-sweep paper plane overlay to an existing Unlayer design (plain-text / legacy AI draft).
 * Places a single phantom row at position 0 that animates the plane through all content blocks.
 */
export function applyPaperPlaneToLegacyDesign(
  design: Record<string, unknown>,
  theme: ThemeName,
): Record<string, unknown> {
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
    clone.body.rows.unshift(buildPaperPlaneEffect(theme));
    return clone as Record<string, unknown>;
  }

  const synthetic: ManifestSection[] = contentRows.map((_, i) => ({
    type: i === 0 ? 'hero' : 'text_block' as ManifestSection['type'],
    order: i,
    content: {},
  }));

  const plan = buildMultiPhaseOverlay(synthetic, theme);
  if (!plan || plan.rows.length === 0) {
    clone.body.rows.unshift(buildPaperPlaneEffect(theme));
    return clone as Record<string, unknown>;
  }

  clone.body.rows.unshift(plan.rows[0]);

  return clone as Record<string, unknown>;
}
