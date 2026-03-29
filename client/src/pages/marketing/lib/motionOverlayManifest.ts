// ─────────────────────────────────────────────────────────────────────────────
// Motion overlay manifest — VA2 paper plane (v2 field names + easterEgg alias)
// ─────────────────────────────────────────────────────────────────────────────

import type { DesignManifest } from './types/manifestTypes';

export type MotionOverlayMode = 'off' | 'paper_plane_sweep';

export type OverlayIntensity = 'signature' | 'subtle';

export interface ResolvedMotionOverlay {
  enabled: boolean;
  mode: MotionOverlayMode;
  intensity: OverlayIntensity;
}

/**
 * Normalize motion overlay from VA2 manifest fields.
 * Prefers `motionOverlay`; falls back to legacy `easterEgg: "paper_plane"`.
 */
export function resolveMotionOverlayFromManifest(
  manifest: Pick<DesignManifest, 'motionOverlay' | 'overlayIntensity' | 'easterEgg'>,
): ResolvedMotionOverlay {
  const raw = manifest.motionOverlay;
  const intensityRaw = manifest.overlayIntensity;

  let enabled = false;
  let mode: MotionOverlayMode = 'off';

  if (raw === 'paper_plane_sweep') {
    enabled = true;
    mode = 'paper_plane_sweep';
  } else if (raw === 'off') {
    enabled = false;
    mode = 'off';
  } else if (manifest.easterEgg === 'paper_plane') {
    enabled = true;
    mode = 'paper_plane_sweep';
  }

  const intensity: OverlayIntensity = intensityRaw === 'subtle' ? 'subtle' : 'signature';

  return {
    enabled,
    mode,
    intensity,
  };
}

/**
 * True when raw JSON includes a valid motionOverlay or legacy paper_plane easterEgg.
 */
export function isValidMotionOverlayValue(value: unknown): value is MotionOverlayMode {
  return value === 'off' || value === 'paper_plane_sweep';
}

export function isValidOverlayIntensityValue(value: unknown): value is OverlayIntensity {
  return value === 'signature' || value === 'subtle';
}

/** Builder UI value — maps to manifest motionOverlay + overlayIntensity. */
export type PaperPlaneUiEffect = 'none' | 'paper_plane_signature' | 'paper_plane_subtle';

/**
 * Derive builder dropdown value from a normalized manifest.
 */
export function manifestToPaperPlaneUiEffect(
  manifest: Pick<DesignManifest, 'motionOverlay' | 'overlayIntensity' | 'easterEgg'>,
): PaperPlaneUiEffect {
  const r = resolveMotionOverlayFromManifest(manifest);
  if (!r.enabled) return 'none';
  return r.intensity === 'subtle' ? 'paper_plane_subtle' : 'paper_plane_signature';
}

/**
 * Manifest fields to merge when user picks a paper-plane option in the builder.
 */
export function paperPlaneUiEffectToManifestFields(
  effect: PaperPlaneUiEffect,
): Pick<DesignManifest, 'motionOverlay' | 'overlayIntensity' | 'easterEgg'> {
  if (effect === 'none') {
    return { motionOverlay: 'off', overlayIntensity: undefined, easterEgg: undefined };
  }
  return {
    motionOverlay: 'paper_plane_sweep',
    overlayIntensity: effect === 'paper_plane_subtle' ? 'subtle' : 'signature',
    easterEgg: 'paper_plane',
  };
}
