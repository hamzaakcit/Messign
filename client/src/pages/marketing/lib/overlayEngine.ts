// ─────────────────────────────────────────────────────────────────────────────
// Email Overlay Engine — Phantom Row Injection for Unlayer
// Messign Visual Architect · v2.0
// ─────────────────────────────────────────────────────────────────────────────
//
// Generic floating overlay system for Unlayer-generated emails.
// Supports any APNG/GIF overlay (spiders, snowflakes, confetti, ghosts, etc.)
//
// DEGRADATION TIERS:
//   Tier 1 (Full Animation)  → Apple Mail, Thunderbird, Samsung Email
//   Tier 2 (Static Overlay)  → Yahoo Mail, AOL, Outlook.com, Outlook macOS
//   Tier 3 (Invisible/Skip)  → Gmail (all), Outlook Windows

import type { ThemeName } from './types/designTokenTypes';
import type { UnlayerRow as Va2UnlayerRow } from './types/unlayerTypes';
import type { OverlayIntensity } from './motionOverlayManifest';

// ── Types ────────────────────────────────────────────────────────────────────

export type MotionType = 'walk' | 'fall' | 'float' | 'drift' | 'pulse' | 'swim' | 'glide' | 'none';

export interface OverlayMotionConfig {
  type: MotionType;
  /** Animation duration in seconds */
  duration: number;
  timing: 'linear' | 'ease' | 'ease-in' | 'ease-in-out';
  iterations: 'infinite' | number;
  direction: 'alternate' | 'normal';
  /** Horizontal travel distance in px */
  travelX: number;
  /** Vertical travel distance in px */
  travelY: number;
  /** Y-axis wobble amplitude in px for organic feel */
  driftAmplitude: number;
}

export interface OverlayPosition {
  top: number;
  left: number;
}

export interface OverlayConfig {
  assetUrl: string;
  assetId?: string;
  width: number;
  height: number;
  position: OverlayPosition;
  motion: OverlayMotionConfig;
  /** Paper plane: signature full sweep vs subtle weave */
  motionIntensity?: OverlayIntensity;
  /** Override glow color (hex or rgba) */
  glowColor?: string;
  /** Full CSS filter string override */
  filterOverride?: string;
  /** Auto-map glow to this VA2 theme */
  va2Theme?: ThemeName;
  /** Hide overlay on mobile viewports */
  hideOnMobile?: boolean;
  /** Alt text (default: '' for decorative) */
  alt?: string;
  /** Self-contained inline HTML (SVG+CSS) to render instead of <img src> */
  inlineHtml?: string;
}

export interface ThemeFilterMapping {
  label: string;
  glow: string;
  filter: string;
}

interface KeyframeResult {
  name: string | null;
  css: string;
}

// Row values with overlay marker (augments the standard Va2 row values)
type OverlayRowValues = Va2UnlayerRow['values'] & {
  _isOverlay: true;
  _overlayConfig: OverlayConfig;
};

// ── VA2 Theme → Filter Mapping ───────────────────────────────────────────────
// Maps each VA2 theme to a CSS filter stack creating a cohesive glow
// matching the theme's accent palette.

export const VA2_THEME_FILTERS: Record<ThemeName, ThemeFilterMapping> = {
  executive: {
    label: 'Executive — Navy/Gold',
    glow: 'rgba(30, 58, 138, 0.5)',
    filter: 'drop-shadow(0 0 8px rgba(30,58,138,0.5)) drop-shadow(0 0 18px rgba(30,58,138,0.25)) hue-rotate(230deg) brightness(1.1)',
  },
  startup: {
    label: 'Startup — Electric Blue',
    glow: 'rgba(59, 130, 246, 0.6)',
    filter: 'drop-shadow(0 0 8px rgba(59,130,246,0.6)) drop-shadow(0 0 20px rgba(59,130,246,0.3)) hue-rotate(210deg) brightness(1.3)',
  },
  luxury: {
    label: 'Luxury — Gold/Amber',
    glow: 'rgba(217, 169, 56, 0.5)',
    filter: 'drop-shadow(0 0 10px rgba(217,169,56,0.5)) drop-shadow(0 0 22px rgba(217,169,56,0.2)) hue-rotate(40deg) saturate(1.8) brightness(1.2)',
  },
  minimal: {
    label: 'Minimal — Soft Gray',
    glow: 'rgba(148, 163, 184, 0.4)',
    filter: 'drop-shadow(0 0 6px rgba(148,163,184,0.4)) brightness(1.05) saturate(0.9)',
  },
  bold: {
    label: 'Bold — Hot Red/Orange',
    glow: 'rgba(239, 68, 68, 0.6)',
    filter: 'drop-shadow(0 0 8px rgba(239,68,68,0.6)) drop-shadow(0 0 20px rgba(239,68,68,0.3)) hue-rotate(340deg) brightness(1.2)',
  },
  nature: {
    label: 'Nature — Forest Green',
    glow: 'rgba(34, 197, 94, 0.5)',
    filter: 'drop-shadow(0 0 8px rgba(34,197,94,0.5)) drop-shadow(0 0 18px rgba(34,197,94,0.25)) hue-rotate(120deg) brightness(1.3)',
  },
  tech: {
    label: 'Tech — Purple/Violet',
    glow: 'rgba(139, 92, 246, 0.6)',
    filter: 'drop-shadow(0 0 8px rgba(139,92,246,0.6)) drop-shadow(0 0 20px rgba(139,92,246,0.3)) hue-rotate(270deg) brightness(1.3)',
  },
  warm: {
    label: 'Warm — Amber/Coral',
    glow: 'rgba(251, 146, 60, 0.5)',
    filter: 'drop-shadow(0 0 8px rgba(251,146,60,0.5)) drop-shadow(0 0 18px rgba(251,146,60,0.25)) hue-rotate(20deg) saturate(1.6) brightness(1.2)',
  },
};

// ── Motion Presets ────────────────────────────────────────────────────────────

export const MOTION_PRESETS: Record<MotionType, OverlayMotionConfig> = {
  walk: {
    type: 'walk',
    duration: 10,
    timing: 'linear',
    iterations: 'infinite',
    direction: 'alternate',
    travelX: 620,
    travelY: 18,
    driftAmplitude: 12,
  },
  fall: {
    type: 'fall',
    duration: 6,
    timing: 'ease-in',
    iterations: 'infinite',
    direction: 'normal',
    travelX: 80,
    travelY: 500,
    driftAmplitude: 40,
  },
  float: {
    type: 'float',
    duration: 8,
    timing: 'ease-in-out',
    iterations: 'infinite',
    direction: 'alternate',
    travelX: 200,
    travelY: 60,
    driftAmplitude: 30,
  },
  drift: {
    type: 'drift',
    duration: 15,
    timing: 'linear',
    iterations: 'infinite',
    direction: 'alternate',
    travelX: 400,
    travelY: 10,
    driftAmplitude: 5,
  },
  pulse: {
    type: 'pulse',
    duration: 2,
    timing: 'ease-in-out',
    iterations: 'infinite',
    direction: 'alternate',
    travelX: 0,
    travelY: 0,
    driftAmplitude: 0,
  },
  swim: {
    type: 'swim',
    duration: 12,
    timing: 'ease-in-out',
    iterations: 'infinite',
    direction: 'alternate',
    travelX: 500,
    travelY: 30,
    driftAmplitude: 20,
  },
  glide: {
    type: 'glide',
    duration: 6,
    timing: 'ease-in-out',
    iterations: 'infinite',
    direction: 'alternate',
    travelX: 620,
    travelY: 15,
    driftAmplitude: 8,
  },
  none: {
    type: 'none',
    duration: 0,
    timing: 'linear',
    iterations: 1,
    direction: 'normal',
    travelX: 0,
    travelY: 0,
    driftAmplitude: 0,
  },
};

// ── Keyframe Generators ──────────────────────────────────────────────────────
// Each motion type generates @keyframes with -webkit- and standard prefixes.
// All include rotateZ(0.001deg) for GPU compositing.

/** @internal */
export function generateKeyframes(id: string, motion: OverlayMotionConfig): KeyframeResult {
  const m: OverlayMotionConfig = { ...MOTION_PRESETS[motion.type], ...motion };
  const name = `overlay_${id}`;

  if (m.type === 'none') {
    return { name: null, css: '' };
  }

  if (m.type === 'pulse') {
    return {
      name,
      css: `@-webkit-keyframes ${name}{0%{-webkit-transform:scale(1) rotateZ(0.001deg)}50%{-webkit-transform:scale(1.15) rotateZ(0.001deg)}100%{-webkit-transform:scale(1) rotateZ(0.001deg)}}@keyframes ${name}{0%{transform:scale(1) rotateZ(0.001deg)}50%{transform:scale(1.15) rotateZ(0.001deg)}100%{transform:scale(1) rotateZ(0.001deg)}}`,
    };
  }

  if (m.type === 'fall') {
    const d = m.driftAmplitude;
    const y = m.travelY;
    const x = m.travelX;
    return {
      name,
      css: `@-webkit-keyframes ${name}{0%{-webkit-transform:translate(0px,0px) rotateZ(0.001deg)}25%{-webkit-transform:translate(${Math.round(d)}px,${Math.round(y * 0.25)}px) rotateZ(0.001deg)}50%{-webkit-transform:translate(${Math.round(-d * 0.5)}px,${Math.round(y * 0.5)}px) rotateZ(0.001deg)}75%{-webkit-transform:translate(${Math.round(d * 0.7)}px,${Math.round(y * 0.75)}px) rotateZ(0.001deg)}100%{-webkit-transform:translate(${Math.round(x * 0.3)}px,${y}px) rotateZ(0.001deg)}}@keyframes ${name}{0%{transform:translate(0px,0px) rotateZ(0.001deg)}25%{transform:translate(${Math.round(d)}px,${Math.round(y * 0.25)}px) rotateZ(0.001deg)}50%{transform:translate(${Math.round(-d * 0.5)}px,${Math.round(y * 0.5)}px) rotateZ(0.001deg)}75%{transform:translate(${Math.round(d * 0.7)}px,${Math.round(y * 0.75)}px) rotateZ(0.001deg)}100%{transform:translate(${Math.round(x * 0.3)}px,${y}px) rotateZ(0.001deg)}}`,
    };
  }

  if (m.type === 'float') {
    const tx = m.travelX;
    const da = m.driftAmplitude;
    return {
      name,
      css: `@-webkit-keyframes ${name}{0%{-webkit-transform:translate(0px,0px) rotateZ(0.001deg)}25%{-webkit-transform:translate(${Math.round(tx * 0.5)}px,${Math.round(-da)}px) rotateZ(0.001deg)}50%{-webkit-transform:translate(${tx}px,0px) rotateZ(0.001deg)}75%{-webkit-transform:translate(${Math.round(tx * 0.5)}px,${Math.round(da)}px) rotateZ(0.001deg)}100%{-webkit-transform:translate(0px,0px) rotateZ(0.001deg)}}@keyframes ${name}{0%{transform:translate(0px,0px) rotateZ(0.001deg)}25%{transform:translate(${Math.round(tx * 0.5)}px,${Math.round(-da)}px) rotateZ(0.001deg)}50%{transform:translate(${tx}px,0px) rotateZ(0.001deg)}75%{transform:translate(${Math.round(tx * 0.5)}px,${Math.round(da)}px) rotateZ(0.001deg)}100%{transform:translate(0px,0px) rotateZ(0.001deg)}}`,
    };
  }

  if (m.type === 'swim') {
    const tx = m.travelX;
    const ty = m.travelY;
    const da = m.driftAmplitude;
    return {
      name,
      css: `@-webkit-keyframes ${name}{0%{-webkit-transform:translate(0px,0px) rotate(2deg) rotateZ(0.001deg)}20%{-webkit-transform:translate(${Math.round(tx * 0.2)}px,${Math.round(-da)}px) rotate(-1deg) rotateZ(0.001deg)}40%{-webkit-transform:translate(${Math.round(tx * 0.45)}px,${Math.round(da * 0.6)}px) rotate(3deg) rotateZ(0.001deg)}60%{-webkit-transform:translate(${Math.round(tx * 0.65)}px,${Math.round(-da * 0.8)}px) rotate(-2deg) rotateZ(0.001deg)}80%{-webkit-transform:translate(${Math.round(tx * 0.85)}px,${Math.round(da * 0.4)}px) rotate(1deg) rotateZ(0.001deg)}100%{-webkit-transform:translate(${tx}px,${ty}px) rotate(2deg) rotateZ(0.001deg)}}@keyframes ${name}{0%{transform:translate(0px,0px) rotate(2deg) rotateZ(0.001deg)}20%{transform:translate(${Math.round(tx * 0.2)}px,${Math.round(-da)}px) rotate(-1deg) rotateZ(0.001deg)}40%{transform:translate(${Math.round(tx * 0.45)}px,${Math.round(da * 0.6)}px) rotate(3deg) rotateZ(0.001deg)}60%{transform:translate(${Math.round(tx * 0.65)}px,${Math.round(-da * 0.8)}px) rotate(-2deg) rotateZ(0.001deg)}80%{transform:translate(${Math.round(tx * 0.85)}px,${Math.round(da * 0.4)}px) rotate(1deg) rotateZ(0.001deg)}100%{transform:translate(${tx}px,${ty}px) rotate(2deg) rotateZ(0.001deg)}}`,
    };
  }

  if (m.type === 'glide') {
    const tx = m.travelX;
    const ty = m.travelY;
    const da = m.driftAmplitude;
    return {
      name,
      css: `@-webkit-keyframes ${name}{0%{-webkit-transform:translate(0px,0px) rotate(-3deg) rotateZ(0.001deg)}15%{-webkit-transform:translate(${Math.round(tx * 0.18)}px,${Math.round(-da)}px) rotate(-1deg) rotateZ(0.001deg)}35%{-webkit-transform:translate(${Math.round(tx * 0.38)}px,${Math.round(da * 0.5)}px) rotate(1deg) rotateZ(0.001deg)}55%{-webkit-transform:translate(${Math.round(tx * 0.58)}px,${Math.round(-da * 0.7)}px) rotate(-2deg) rotateZ(0.001deg)}80%{-webkit-transform:translate(${Math.round(tx * 0.82)}px,${Math.round(da * 0.3)}px) rotate(0deg) rotateZ(0.001deg)}100%{-webkit-transform:translate(${tx}px,${ty}px) rotate(2deg) rotateZ(0.001deg)}}@keyframes ${name}{0%{transform:translate(0px,0px) rotate(-3deg) rotateZ(0.001deg)}15%{transform:translate(${Math.round(tx * 0.18)}px,${Math.round(-da)}px) rotate(-1deg) rotateZ(0.001deg)}35%{transform:translate(${Math.round(tx * 0.38)}px,${Math.round(da * 0.5)}px) rotate(1deg) rotateZ(0.001deg)}55%{transform:translate(${Math.round(tx * 0.58)}px,${Math.round(-da * 0.7)}px) rotate(-2deg) rotateZ(0.001deg)}80%{transform:translate(${Math.round(tx * 0.82)}px,${Math.round(da * 0.3)}px) rotate(0deg) rotateZ(0.001deg)}100%{transform:translate(${tx}px,${ty}px) rotate(2deg) rotateZ(0.001deg)}}`,
    };
  }

  // walk / drift — left-to-right with Y-axis wobble
  const stops = [0, 15, 35, 55, 75, 100];
  const xFactors = [0, 0.15, 0.34, 0.60, 0.81, 1.0];
  const yDrifts = [
    0,
    m.driftAmplitude * 0.67,
    -m.driftAmplitude * 0.33,
    m.driftAmplitude,
    m.driftAmplitude * 0.25,
    m.travelY,
  ];

  const webkitStops = stops
    .map(
      (s, i) =>
        `${s}%{-webkit-transform:translate(${Math.round(m.travelX * xFactors[i])}px,${Math.round(yDrifts[i])}px) rotateZ(0.001deg)}`,
    )
    .join('');
  const stdStops = stops
    .map(
      (s, i) =>
        `${s}%{transform:translate(${Math.round(m.travelX * xFactors[i])}px,${Math.round(yDrifts[i])}px) rotateZ(0.001deg)}`,
    )
    .join('');

  return {
    name,
    css: `@-webkit-keyframes ${name}{${webkitStops}}@keyframes ${name}{${stdStops}}`,
  };
}

// ── HTML/CSS Generator ───────────────────────────────────────────────────────

/**
 * Generate the complete HTML/CSS string for an overlay.
 * This is injected into the Unlayer JSON HTML content block.
 * Includes pointer-events:none, VML Outlook fallback, and keyframe animation.
 */
export function generateOverlayHTML(config: OverlayConfig): string {
  const id = config.assetId ?? Math.random().toString(36).slice(2, 10);
  const motion: OverlayMotionConfig = {
    ...MOTION_PRESETS[config.motion?.type ?? 'none'],
    ...config.motion,
  };

  const useInline = !!config.inlineHtml;

  let filterCSS = 'none';
  if (!useInline) {
    if (config.filterOverride) {
      filterCSS = config.filterOverride;
    } else if (config.va2Theme && VA2_THEME_FILTERS[config.va2Theme]) {
      filterCSS = VA2_THEME_FILTERS[config.va2Theme].filter;
    } else if (config.glowColor) {
      filterCSS = `drop-shadow(0 0 8px ${config.glowColor}) drop-shadow(0 0 20px ${config.glowColor}) brightness(1.2)`;
    }
  }

  const filterDecl =
    filterCSS !== 'none'
      ? `-webkit-filter:${filterCSS};filter:${filterCSS};`
      : '';

  const kf = generateKeyframes(id, motion);
  const animDecl = kf.name
    ? `-webkit-animation:${kf.name} ${motion.duration}s ${motion.timing} ${motion.iterations === 'infinite' ? 'infinite' : motion.iterations} ${motion.direction};animation:${kf.name} ${motion.duration}s ${motion.timing} ${motion.iterations === 'infinite' ? 'infinite' : motion.iterations} ${motion.direction};`
    : '';

  const mobileHideCSS = config.hideOnMobile
    ? `@media only screen and (max-width:480px){.ov-phantom-${id}{display:none!important;max-height:0!important;overflow:hidden!important}}`
    : '';

  const contentBlock = useInline
    ? config.inlineHtml!
    : `<img src="${config.assetUrl}" class="ov-img-${id}" alt="${config.alt ?? ''}" role="presentation" width="${config.width ?? 60}" height="${config.height ?? 40}" border="0" style="display:block;border:0;outline:none;text-decoration:none;">`;

  return [
    `<div class="ov-phantom-${id}" style="max-height:0px;max-width:0px;overflow:hidden;line-height:0;font-size:0;display:inline-block;">`,
    `<style type="text/css">`,
    `.ov-phantom-${id}{max-height:0!important;max-width:0!important;overflow:visible!important;line-height:0!important;font-size:0!important;display:inline-block!important;position:relative;opacity:0.999}`,
    `.ov-phantom-${id},.ov-phantom-${id} *{pointer-events:none!important}`,
    `.ov-pos-${id}{display:inline-block;margin-top:${config.position?.top ?? 100}px;margin-left:${config.position?.left ?? 0}px}`,
    useInline ? '' : `.ov-img-${id}{display:block;width:${config.width ?? 60}px;height:auto;border:0;outline:none;text-decoration:none;${filterDecl}}`,
    kf.css,
    kf.name ? `.ov-anim-${id}{${animDecl}}` : '',
    mobileHideCSS,
    `</style>`,
    `<!--[if mso]>`,
    `<v:rect xmlns:v="urn:schemas-microsoft-com:vml" stroked="false" filled="false" style="mso-width-percent:1000;position:absolute;top:0;left:0;visibility:hidden;">`,
    `<v:textbox inset="0,0,0,0"><span style="display:none;font-size:0;">&nbsp;</span></v:textbox>`,
    `</v:rect>`,
    `<![endif]-->`,
    `<!--[if !mso]><!-->`,
    `<div class="ov-pos-${id}${kf.name ? ` ov-anim-${id}` : ''}">`,
    contentBlock,
    `</div>`,
    `<!--<![endif]-->`,
    `</div>`,
  ].join('\n');
}

// ── Unlayer JSON Row Builder ─────────────────────────────────────────────────

/**
 * Build the Unlayer-compatible phantom row containing the overlay.
 * The row consumes no vertical space (height:0, overflow:visible).
 */
export function buildOverlayRow(config: OverlayConfig): Va2UnlayerRow {
  const htmlContent = generateOverlayHTML(config);
  const id = config.assetId ?? 'overlay';

  const row: Va2UnlayerRow = {
    id: `overlay-row-${id}`,
    cells: [1],
    columns: [
      {
        id: `overlay-col-${id}`,
        contents: [
          {
            id: `overlay-html-${id}`,
            type: 'html',
            values: {
              html: htmlContent,
              hideDesktop: false,
              hideMobile: config.hideOnMobile ?? false,
              containerPadding: '0px',
              anchor: '',
              _meta: {
                htmlID: `overlay-html-${id}`,
                htmlClassNames: 'overlay-block',
              },
            },
          },
        ],
        values: {
          backgroundColor: 'transparent',
          padding: '0px',
          border: {},
          borderRadius: '0px',
          _meta: {
            htmlID: `overlay-col-${id}`,
            htmlClassNames: 'overlay-col',
          },
        },
      },
    ],
    values: {
      displayCondition: null,
      columns: false,
      backgroundColor: 'transparent',
      columnsBackgroundColor: '',
      backgroundImage: {},
      padding: '0px',
      anchor: '',
      hideDesktop: false,
      hideMobile: config.hideOnMobile ?? false,
      noStackMobile: false,
      _meta: {
        htmlID: `overlay-row-${id}`,
        htmlClassNames: 'overlay-phantom',
      },
      _isOverlay: true,
      _overlayConfig: config,
    } as unknown as Va2UnlayerRow['values'],
  };

  return row;
}

// ── Public API — Inject / Remove / Query ─────────────────────────────────────

/**
 * Inject one or more overlays into an Unlayer design JSON.
 * Each overlay is unshifted to the front of body.rows.
 * Removes existing overlays first to prevent duplicates.
 */
export function injectOverlays(
  design: { body?: { rows?: Va2UnlayerRow[] } },
  configs: OverlayConfig | OverlayConfig[],
): typeof design {
  if (!design?.body?.rows) {
    console.error('[OverlayEngine] Invalid design JSON: missing body.rows');
    return design;
  }

  removeAllOverlays(design);

  const configArray = Array.isArray(configs) ? configs : [configs];
  for (let i = configArray.length - 1; i >= 0; i--) {
    const row = buildOverlayRow(configArray[i]);
    design.body.rows.unshift(row);
  }

  return design;
}

/**
 * Remove all overlay phantom rows from a design.
 */
export function removeAllOverlays(
  design: { body?: { rows?: Va2UnlayerRow[] } },
): typeof design {
  if (!design?.body?.rows) return design;
  design.body.rows = design.body.rows.filter(
    (row) => !(row?.values as unknown as OverlayRowValues)?._isOverlay,
  );
  return design;
}

/**
 * Get the configs of all currently injected overlays.
 */
export function getActiveOverlays(
  design: { body?: { rows?: Va2UnlayerRow[] } },
): OverlayConfig[] {
  if (!design?.body?.rows) return [];
  return design.body.rows
    .filter((row) => (row?.values as unknown as OverlayRowValues)?._isOverlay)
    .map((row) => (row.values as unknown as OverlayRowValues)._overlayConfig)
    .filter(Boolean);
}

/**
 * Check if a design has any overlays injected.
 */
export function hasOverlays(
  design: { body?: { rows?: Va2UnlayerRow[] } },
): boolean {
  return getActiveOverlays(design).length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-Phase Overlay System — Paper Plane Engine
// ─────────────────────────────────────────────────────────────────────────────

export type PhaseMotionType = 'glide' | 'weave' | 'bridge' | 'launch' | 'exit' | 'sweep';

export interface OverlayPhase {
  index: number;
  totalPhases: number;
  entryDirection: 'left' | 'right';
  animationDelay: string;
  shadowDepth: number;
  scale: number;
  tiltDeg: number;
  motionType: PhaseMotionType;
  sectionBgColor?: string;
  nextSectionBgColor?: string;
  /** Estimated total email height in px — used by 'sweep' motion to span the full email. */
  estimatedEmailHeight?: number;
}

export interface OverlayInjectionPlan {
  rows: Va2UnlayerRow[];
  insertionIndices: number[];
}

interface DepthProgression {
  shadowOffset: number;
  shadowBlur: number;
  shadowOpacity: number;
  scale: number;
  tilt: number;
}

/**
 * Parabolic depth progression — plane appears to descend toward the email
 * surface in the middle phases and climb away at the edges.
 */
export function calculateDepthProgression(
  phaseIndex: number,
  totalPhases: number,
): DepthProgression {
  const t = totalPhases <= 1 ? 0.5 : phaseIndex / (totalPhases - 1);
  const arc = 4 * t * (1 - t);

  return {
    shadowOffset: 4 + arc * 10,
    shadowBlur: 3 + arc * 8,
    shadowOpacity: 0.12 + arc * 0.23,
    scale: 0.85 + arc * 0.25,
    tilt: 1 + arc * 3,
  };
}

interface FlightWaypoint {
  pct: number;
  x: number;
  y: number;
  opacity?: number;
  /** Normalized altitude 0-1 where 0 = on the ground, 1 = high up. Drives scale, shadow offset, and 3D perspective. */
  alt?: number;
}

/**
 * Compute the pitch angle at a waypoint based on the slope to the next point.
 * Paper planes fly slightly nose-up (-4 degree bias), and pitch sensitivity
 * is 2.5x for visible climbs and dips.
 */
function derivePitchAngle(
  current: FlightWaypoint,
  next: FlightWaypoint | undefined,
  prev: FlightWaypoint | undefined,
  dir: number,
): number {
  const ref = next ?? current;
  const base = prev ?? current;
  const dx = (ref.x - base.x) * dir;
  const dy = ref.y - base.y;
  if (dx === 0 && dy === 0) return -4;
  const raw = Math.atan2(dy, Math.abs(dx)) * (180 / Math.PI);
  return raw * 2.5 - 4;
}

/**
 * Derive a banking angle from curvature in the flight path.
 * Paper planes bank steeply into turns — up to 25 degrees of Z-axis roll.
 * Also uses X-direction changes to detect lateral turns.
 */
function deriveBankAngle(
  prev: FlightWaypoint | undefined,
  current: FlightWaypoint,
  next: FlightWaypoint | undefined,
): number {
  if (!prev || !next) return 0;
  const yCurvature = (next.y - current.y) - (current.y - prev.y);
  const xDelta = (next.x - current.x) - (current.x - prev.x);
  const combined = yCurvature * 1.0 + xDelta * 0.15;
  return Math.max(-25, Math.min(25, combined * 1.4));
}

/**
 * Slight scale variation based on altitude — lower = larger (closer), higher = smaller.
 * Reserved for future depth-aware overlay animations.
 */
export function deriveAltitudeScale(y: number, baseScale: number, maxY: number): number {
  const normalizedAlt = Math.max(0, Math.min(1, (y + maxY) / (2 * maxY)));
  return baseScale + (normalizedAlt - 0.5) * 0.06;
}

function getFlightPath(
  motionType: PhaseMotionType,
  _depth: DepthProgression,
  estimatedHeight?: number,
): FlightWaypoint[] {
  if (motionType === 'sweep') {
    const h = Math.max(600, estimatedHeight ?? 1200);
    return [
      // Entry glide — slow fade in, nose down, gaining speed
      { pct: 0,   x: -40,  y: -20,       opacity: 0,   alt: 0.7 },
      { pct: 2,   x: 30,   y: 5,         opacity: 0.4, alt: 0.6 },
      { pct: 5,   x: 140,  y: h * 0.03,  opacity: 0.8, alt: 0.45 },
      // Fast dive right — pct spread out = faster perceived motion
      { pct: 9,   x: 320,  y: h * 0.08,  opacity: 1,   alt: 0.25 },
      { pct: 12,  x: 460,  y: h * 0.13,  opacity: 1,   alt: 0.1 },
      // Stall moment — plane slows, nose rises, briefly floats
      { pct: 16,  x: 440,  y: h * 0.17,  opacity: 1,   alt: 0.2 },
      { pct: 20,  x: 420,  y: h * 0.19,  opacity: 1,   alt: 0.35 },
      // Catches air — banks left, begins lazy arc
      { pct: 24,  x: 300,  y: h * 0.24,  opacity: 1,   alt: 0.5 },
      { pct: 29,  x: 140,  y: h * 0.29,  opacity: 1,   alt: 0.55 },
      { pct: 33,  x: 60,   y: h * 0.34,  opacity: 1,   alt: 0.45 },
      // Second dive — fast sweep right and down
      { pct: 37,  x: 180,  y: h * 0.38,  opacity: 1,   alt: 0.3 },
      { pct: 40,  x: 360,  y: h * 0.41,  opacity: 1,   alt: 0.15 },
      { pct: 43,  x: 500,  y: h * 0.45,  opacity: 1,   alt: 0.08 },
      // Second stall — plane noses up, drifts, wobbles
      { pct: 48,  x: 480,  y: h * 0.49,  opacity: 1,   alt: 0.18 },
      { pct: 52,  x: 440,  y: h * 0.51,  opacity: 1,   alt: 0.32 },
      // Slow glide left — tight pct = slower, floating feel
      { pct: 56,  x: 320,  y: h * 0.55,  opacity: 1,   alt: 0.5 },
      { pct: 60,  x: 180,  y: h * 0.59,  opacity: 1,   alt: 0.6 },
      { pct: 64,  x: 80,   y: h * 0.63,  opacity: 1,   alt: 0.5 },
      { pct: 67,  x: 50,   y: h * 0.66,  opacity: 1,   alt: 0.4 },
      // Third dive — fast right, skimming the surface
      { pct: 70,  x: 150,  y: h * 0.69,  opacity: 1,   alt: 0.2 },
      { pct: 73,  x: 340,  y: h * 0.73,  opacity: 1,   alt: 0.08 },
      { pct: 76,  x: 480,  y: h * 0.77,  opacity: 1,   alt: 0.05 },
      // Third stall — gentle nose-up, drifts back
      { pct: 80,  x: 440,  y: h * 0.80,  opacity: 1,   alt: 0.15 },
      { pct: 84,  x: 350,  y: h * 0.83,  opacity: 1,   alt: 0.35 },
      // Final float — slow lazy drift, climbing away
      { pct: 88,  x: 220,  y: h * 0.88,  opacity: 1,   alt: 0.5 },
      { pct: 92,  x: 300,  y: h * 0.92,  opacity: 0.9, alt: 0.6 },
      { pct: 96,  x: 420,  y: h * 0.96,  opacity: 0.5, alt: 0.7 },
      { pct: 100, x: 500,  y: h,         opacity: 0,   alt: 0.8 },
    ];
  }

  switch (motionType) {
    case 'launch':
      return [
        { pct: 0, x: -40, y: 120, opacity: 0 },
        { pct: 8, x: 20, y: 80, opacity: 0.5 },
        { pct: 20, x: 80, y: 30, opacity: 0.85 },
        { pct: 35, x: 170, y: -30, opacity: 1 },
        { pct: 50, x: 280, y: -60, opacity: 1 },
        { pct: 65, x: 380, y: -40, opacity: 1 },
        { pct: 80, x: 460, y: -20, opacity: 1 },
        { pct: 100, x: 540, y: -30, opacity: 1 },
      ];
    case 'exit':
      return [
        { pct: 0, x: -40, y: 40, opacity: 1 },
        { pct: 12, x: 60, y: 20, opacity: 1 },
        { pct: 28, x: 160, y: -20, opacity: 1 },
        { pct: 45, x: 280, y: -70, opacity: 1 },
        { pct: 60, x: 380, y: -120, opacity: 1 },
        { pct: 75, x: 460, y: -160, opacity: 0.8 },
        { pct: 90, x: 530, y: -190, opacity: 0.5 },
        { pct: 100, x: 580, y: -200, opacity: 0 },
      ];
    case 'bridge':
      return [
        { pct: 0, x: -35, y: -80 },
        { pct: 10, x: 50, y: -50 },
        { pct: 22, x: 130, y: -10 },
        { pct: 35, x: 220, y: 50 },
        { pct: 48, x: 300, y: 100 },
        { pct: 58, x: 360, y: 120 },
        { pct: 70, x: 420, y: 80 },
        { pct: 82, x: 480, y: 30 },
        { pct: 92, x: 530, y: -20 },
        { pct: 100, x: 560, y: -50 },
      ];
    case 'weave': {
      const amp = 80;
      return [
        { pct: 0, x: -25, y: 0 },
        { pct: 10, x: 50, y: -amp },
        { pct: 22, x: 120, y: amp * 0.75 },
        { pct: 33, x: 190, y: -amp * 0.9 },
        { pct: 44, x: 260, y: amp * 0.6 },
        { pct: 55, x: 330, y: -amp * 0.85 },
        { pct: 66, x: 390, y: amp * 0.7 },
        { pct: 78, x: 450, y: -amp * 0.5 },
        { pct: 90, x: 510, y: amp * 0.35 },
        { pct: 100, x: 570, y: 0 },
      ];
    }
    default: {
      const da = 50;
      return [
        { pct: 0, x: -30, y: 0 },
        { pct: 14, x: 70, y: -da },
        { pct: 28, x: 155, y: da * 0.5 },
        { pct: 42, x: 240, y: -da * 0.8 },
        { pct: 56, x: 325, y: da * 0.6 },
        { pct: 70, x: 410, y: -da * 0.65 },
        { pct: 85, x: 490, y: da * 0.35 },
        { pct: 100, x: 560, y: -da * 0.2 },
      ];
    }
  }
  return [{ pct: 0, x: 0, y: 0 }, { pct: 100, x: 560, y: 0 }];
}

function generatePhaseKeyframes(
  id: string,
  phase: OverlayPhase,
): string {
  const name = `pp_${id}_${phase.index}`;
  const dir = phase.entryDirection === 'left' ? 1 : -1;
  const depth = calculateDepthProgression(phase.index, phase.totalPhases);
  const path = getFlightPath(phase.motionType, depth, phase.estimatedEmailHeight);

  const stops = path.map((wp, i) => {
    const prev = i > 0 ? path[i - 1] : undefined;
    const next = i < path.length - 1 ? path[i + 1] : undefined;

    const pitch = derivePitchAngle(wp, next, prev, dir);
    const bank = deriveBankAngle(prev, wp, next);

    const alt = wp.alt ?? 0.5;
    const altScale = 0.55 + (1 - alt) * 0.65;

    const x = Math.round(wp.x * dir);
    const y = Math.round(wp.y);
    const pitchR = Math.round(pitch * dir * 10) / 10;
    const bankDeg = Math.round(bank * 10) / 10;
    const closeBoost = (1 - alt) * 8;
    const pitchX = Math.round((alt * 18 + pitchR * 0.5 + closeBoost) * 10) / 10;
    const bankY = Math.round(bankDeg * 0.8 * 10) / 10;
    const scX = Math.round(altScale * 1000) / 1000;
    const bankCompression = 1 - Math.abs(bank) / 25 * 0.22;
    const scY = Math.round(altScale * bankCompression * 1000) / 1000;

    let transform = `translate3d(${x}px,${y}px,0)`;
    transform += ` rotateX(${pitchX}deg)`;
    transform += ` rotateY(${bankY}deg)`;
    transform += ` rotateZ(${bankDeg}deg)`;
    transform += ` scale3d(${scX},${scY},1)`;

    const hSpeed = prev ? Math.abs(wp.x - prev.x) / Math.max(1, wp.pct - prev.pct) : 0;
    const motionBlur = Math.min(0.8, hSpeed * 0.06);
    const hazeSat = Math.round((1 - alt * 0.25) * 100) / 100;
    const hazeBright = Math.round((1 + alt * 0.08) * 100) / 100;

    let extras = '';
    if (motionBlur > 0.15 || alt > 0.3) {
      extras += `;filter:blur(${motionBlur.toFixed(1)}px) saturate(${hazeSat}) brightness(${hazeBright})`;
    }

    const opa = wp.opacity !== undefined && wp.opacity !== 1
      ? 1 - (1 - wp.opacity) - alt * 0.08
      : 1 - alt * 0.08;
    if (opa < 0.99) {
      extras += `;opacity:${Math.round(opa * 100) / 100}`;
    }

    return `${wp.pct}%{-webkit-transform:${transform};transform:${transform}${extras}}`;
  }).join('');

  return `@-webkit-keyframes ${name}{${stops}}@keyframes ${name}{${stops}}`;
}

/**
 * Generate ground-projected shadow keyframes for a paper plane.
 * Paper planes fly lower than jets, so the shadow stays closer, smaller, and
 * more responsive to altitude changes.
 */
function generateShadowKeyframes(
  id: string,
  phase: OverlayPhase,
): string {
  const name = `pp_sh_${id}_${phase.index}`;
  const depth = calculateDepthProgression(phase.index, phase.totalPhases);
  const path = getFlightPath(phase.motionType, depth, phase.estimatedEmailHeight);
  const dir = phase.entryDirection === 'left' ? 1 : -1;

  const sweepBoost = phase.motionType === 'sweep' ? 1.14 : 1;

  const stops = path.map((wp) => {
    const alt = wp.alt ?? 0.5;

    const groundOffY = Math.round(20 + alt * 50);
    const groundOffX = Math.round(alt * 10 * dir);
    const shadowScale = Math.round((0.55 - alt * 0.3) * 100) / 100;
    const shadowOpa = Math.min(0.55, Math.round((0.3 - alt * 0.2) * sweepBoost * 100) / 100);
    const blurPx = Math.round((1 + alt * 10) * (phase.motionType === 'sweep' ? 1.1 : 1));

    const x = Math.round(wp.x * dir);
    const y = Math.round(wp.y);

    return `${wp.pct}%{opacity:${shadowOpa};-webkit-filter:blur(${blurPx}px);filter:blur(${blurPx}px);-webkit-transform:translate3d(${x + groundOffX}px,${y + groundOffY}px,0) scaleX(${shadowScale}) scaleY(${Math.round(shadowScale * 0.25 * 100) / 100}) skewX(${dir * -10}deg);transform:translate3d(${x + groundOffX}px,${y + groundOffY}px,0) scaleX(${shadowScale}) scaleY(${Math.round(shadowScale * 0.25 * 100) / 100}) skewX(${dir * -10}deg)}`;
  }).join('');

  return `@-webkit-keyframes ${name}{${stops}}@keyframes ${name}{${stops}}`;
}

/**
 * Generate a faint, short ribbon trail that fades quickly — appropriate
 * for a paper plane (no jet contrails).
 */
function generateTrailSVG(
  phase: OverlayPhase,
  accentColor: string,
): string {
  const dir = phase.entryDirection === 'left' ? 1 : -1;
  const x1 = dir === 1 ? 200 : 400;
  const x2 = dir === 1 ? 400 : 200;
  return `<svg width="600" height="2" style="position:absolute;top:50%;left:0;margin-top:-1px;opacity:0.12"><line x1="${x1}" y1="1" x2="${x2}" y2="1" stroke="${accentColor}" stroke-width="0.5" stroke-dasharray="4,8"><animate attributeName="stroke-dashoffset" from="0" to="${16 * dir}" dur="2.5s" repeatCount="indefinite"/></line></svg>`;
}

/**
 * Ambient ribbon + shimmer lines for full-height sweep — reads as wind without
 * fighting the main flight path (still decorative; Tier-1 clients).
 */
function generateSweepAmbientWindSVG(accentColor: string): string {
  const a = `${accentColor}`;
  return `<svg width="600" height="120" viewBox="0 0 600 120" style="position:absolute;left:-80px;top:-40px;pointer-events:none;opacity:0.28" aria-hidden="true">
<defs>
<linearGradient id="swg1" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="${a}" stop-opacity="0"/><stop offset="50%" stop-color="${a}" stop-opacity="0.5"/><stop offset="100%" stop-color="${a}" stop-opacity="0"/></linearGradient>
</defs>
<path d="M0,40 Q120,20 240,45 T480,35 T600,50" fill="none" stroke="url(#swg1)" stroke-width="0.75" stroke-dasharray="6,14" stroke-linecap="round"><animate attributeName="stroke-dashoffset" from="0" to="-40" dur="3.2s" repeatCount="indefinite"/></path>
<path d="M20,75 Q200,55 380,80 T580,70" fill="none" stroke="${a}" stroke-opacity="0.2" stroke-width="0.6" stroke-dasharray="4,12" stroke-linecap="round"><animate attributeName="stroke-dashoffset" from="0" to="32" dur="4.1s" repeatCount="indefinite"/></path>
<path d="M-10,95 Q150,88 320,102 T600,98" fill="none" stroke="${a}" stroke-opacity="0.12" stroke-width="0.45" stroke-dasharray="3,10" stroke-linecap="round"><animate attributeName="stroke-dashoffset" from="0" to="-24" dur="5.5s" repeatCount="indefinite"/></path>
</svg>`;
}

/**
 * Speed streaks parented to the plane so they move with the sweep (richer than a static ribbon).
 */
function generateSweepWindLayers(phaseId: string, accentColor: string): { html: string; css: string } {
  const anim = `pp_wind_${phaseId}`;
  const css =
    `@-webkit-keyframes ${anim}{0%{opacity:0.18;-webkit-transform:scaleX(0.35) translateX(-6px)}30%{opacity:0.55;-webkit-transform:scaleX(1) translateX(0)}65%{opacity:0.38;-webkit-transform:scaleX(0.82) translateX(3px)}100%{opacity:0.22;-webkit-transform:scaleX(0.48) translateX(-3px)}}` +
    `@keyframes ${anim}{0%{opacity:0.18;transform:scaleX(0.35) translateX(-6px)}30%{opacity:0.55;transform:scaleX(1) translateX(0)}65%{opacity:0.38;transform:scaleX(0.82) translateX(3px)}100%{opacity:0.22;transform:scaleX(0.48) translateX(-3px)}}`;
  const stripes = [0, 1, 2, 3, 4, 5].map((i) => {
    const top = 3 + i * 10;
    const dur = 2.05 + i * 0.2;
    const delay = i * 0.24;
    const rot = -11 - i * 2.2;
    const left = 28 + i * 5;
    return `<span style="position:absolute;left:-${left}px;top:${top}px;width:${38 + i * 5}px;height:2px;pointer-events:none;border-radius:1px;background:linear-gradient(90deg,transparent,${accentColor},transparent);opacity:0.42;-webkit-transform-origin:center right;transform-origin:center right;-webkit-transform:rotateZ(${rot}deg);transform:rotateZ(${rot}deg);-webkit-animation:${anim} ${dur}s ease-in-out ${delay}s infinite;animation:${anim} ${dur}s ease-in-out ${delay}s infinite;"></span>`;
  }).join('');
  return {
    html: `<div style="position:absolute;inset:0;pointer-events:none;z-index:0" aria-hidden="true">${stripes}</div>`,
    css,
  };
}

function generateShadowDiv(
  id: string,
  phase: OverlayPhase,
  _planeAssetHtml: string,
  hasSyncAnimation: boolean,
  duration: number,
  flightEasing: string,
): string {
  const depth = calculateDepthProgression(phase.index, phase.totalPhases);

  const animStyle = hasSyncAnimation
    ? `-webkit-animation:pp_sh_${id}_${phase.index} ${duration}s ${phase.animationDelay} ${flightEasing} infinite alternate;animation:pp_sh_${id}_${phase.index} ${duration}s ${phase.animationDelay} ${flightEasing} infinite alternate;`
    : `-webkit-transform:scaleY(0.15) scaleX(0.4) skewX(${phase.entryDirection === 'left' ? -10 : 10}deg) translateY(${depth.shadowOffset + 30}px);transform:scaleY(0.15) scaleX(0.4) skewX(${phase.entryDirection === 'left' ? -10 : 10}deg) translateY(${depth.shadowOffset + 30}px);opacity:0.12;`;

  const shadowEl = `<svg width="48" height="14" viewBox="0 0 48 14" style="display:block;"><defs><radialGradient id="pps-${id}-${phase.index}" cx="35%" cy="50%" rx="50%" ry="50%"><stop offset="0%" stop-color="rgba(0,0,0,0.45)"/><stop offset="60%" stop-color="rgba(0,0,0,0.1)"/><stop offset="100%" stop-color="transparent"/></radialGradient></defs><polygon points="2,7 46,2 36,7 46,12" fill="url(#pps-${id}-${phase.index})"/></svg>`;

  return `<div class="ov-shadow-${id}-${phase.index}" style="position:absolute;top:0;left:0;pointer-events:none;${animStyle}">${shadowEl}</div>`;
}

function generateReflectionDiv(
  id: string,
  phase: OverlayPhase,
  planeAssetHtml: string,
  opacity = 0.04,
): string {
  return `<div class="ov-reflect-${id}-${phase.index}" style="position:absolute;top:0;left:0;-webkit-transform:scaleY(-1) translateY(6px);transform:scaleY(-1) translateY(6px);-webkit-filter:blur(2px);filter:blur(2px);opacity:${opacity};pointer-events:none;">${planeAssetHtml}</div>`;
}

/** Adjust shadow color based on background brightness. Reserved for future overlay enhancements. */
export function adjustShadowForBg(bgColor: string): string {
  if (!bgColor || bgColor === 'transparent') return 'rgba(0,0,0,0.25)';
  const isDark = bgColor.startsWith('#0') || bgColor.startsWith('#1') ||
    bgColor.startsWith('rgb(0') || bgColor.startsWith('rgb(1');
  return isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.25)';
}

/**
 * Build a single phantom row for one phase of the multi-phase overlay.
 * Contains: animated plane, perspective shadow, trail SVG, glass reflection.
 */
export function buildPhaseOverlayRow(
  planeAssetHtml: string,
  phase: OverlayPhase,
  theme: ThemeName,
  overlayId?: string,
  overlayIntensity: OverlayIntensity = 'signature',
): Va2UnlayerRow {
  const id = overlayId ?? `pp-${theme}`;
  const phaseId = `${id}-p${phase.index}`;
  const kfName = `pp_${id}_${phase.index}`;
  const depth = calculateDepthProgression(phase.index, phase.totalPhases);
  const themeGlow = VA2_THEME_FILTERS[theme]?.glow ?? 'rgba(0,0,0,0.3)';

  const duration = phase.motionType === 'sweep' ? 42
    : (phase.motionType === 'launch' || phase.motionType === 'exit') ? 14
    : 18;

  /** Long sweeps use a custom curve so stalls and dives read more cinematically. */
  const flightEasing =
    phase.motionType === 'sweep'
      ? 'cubic-bezier(0.38, 0.0, 0.62, 1.0)'
      : 'ease-in-out';

  const wobbleName = `pp_wobble_${phaseId}`;
  const wobbleDur = phase.motionType === 'sweep' ? 5.8 : 4.5;

  const keyframeCSS = generatePhaseKeyframes(id, phase);
  const shadowKfCSS = generateShadowKeyframes(id, phase);

  const wobbleStopsStd =
    phase.motionType === 'sweep'
      ? `0%{transform:rotateZ(-3.6deg) rotateX(0.65deg) translateX(0px) translateY(0px)}` +
        `9%{transform:rotateZ(-1.2deg) rotateX(-0.45deg) translateX(1px) translateY(-1.6px)}` +
        `22%{transform:rotateZ(2.4deg) rotateX(0.95deg) translateX(1.8px) translateY(0.8px)}` +
        `34%{transform:rotateZ(-2.1deg) rotateX(-0.55deg) translateX(-0.6px) translateY(-1.8px)}` +
        `48%{transform:rotateZ(3.1deg) rotateX(0.5deg) translateX(-1.4px) translateY(0.4px)}` +
        `61%{transform:rotateZ(-2.3deg) rotateX(-0.75deg) translateX(0.8px) translateY(1.4px)}` +
        `74%{transform:rotateZ(1.8deg) rotateX(0.7deg) translateX(1.2px) translateY(-1px)}` +
        `86%{transform:rotateZ(-1.5deg) rotateX(-0.25deg) translateX(-1px) translateY(0.6px)}` +
        `100%{transform:rotateZ(-3.6deg) rotateX(0.65deg) translateX(0px) translateY(0px)}`
      : `0%{transform:rotateZ(-2.5deg) rotateX(0.5deg) translateX(0px) translateY(0px)}` +
        `8%{transform:rotateZ(-1deg) rotateX(-0.3deg) translateX(0.8px) translateY(-1.2px)}` +
        `20%{transform:rotateZ(2deg) rotateX(0.8deg) translateX(1.5px) translateY(0.6px)}` +
        `32%{transform:rotateZ(-1.8deg) rotateX(-0.5deg) translateX(-0.5px) translateY(-1.5px)}` +
        `45%{transform:rotateZ(2.8deg) rotateX(0.4deg) translateX(-1.2px) translateY(0.3px)}` +
        `58%{transform:rotateZ(-2deg) rotateX(-0.7deg) translateX(0.6px) translateY(1.2px)}` +
        `70%{transform:rotateZ(1.5deg) rotateX(0.6deg) translateX(1px) translateY(-0.8px)}` +
        `82%{transform:rotateZ(-1.2deg) rotateX(-0.2deg) translateX(-0.8px) translateY(0.5px)}` +
        `92%{transform:rotateZ(2.2deg) rotateX(0.3deg) translateX(0.3px) translateY(-1px)}` +
        `100%{transform:rotateZ(-2.5deg) rotateX(0.5deg) translateX(0px) translateY(0px)}`;

  const wobbleStopsWeb = wobbleStopsStd.replace(/transform:/g, '-webkit-transform:');

  const wobbleCSS =
    `@-webkit-keyframes ${wobbleName}{${wobbleStopsWeb}}@keyframes ${wobbleName}{${wobbleStopsStd}}`;

  const trailSVG =
    phase.motionType === 'sweep'
      ? generateSweepAmbientWindSVG(themeGlow)
      : generateTrailSVG(phase, themeGlow);

  const sweepWind = phase.motionType === 'sweep' ? generateSweepWindLayers(phaseId, themeGlow) : { html: '', css: '' };

  const shadowDiv = generateShadowDiv(id, phase, planeAssetHtml, true, duration, flightEasing);
  const reflectionDiv =
    phase.motionType === 'sweep'
      ? generateReflectionDiv(id, phase, planeAssetHtml, 0.032)
      : generateReflectionDiv(id, phase, planeAssetHtml);

  const htmlContent = [
    `<div class="ov-phase-${phaseId}" style="max-height:0px;overflow:visible;position:relative;line-height:0;font-size:0;display:none;z-index:99999;">`,
    `<style type="text/css">`,
    `.ov-phase-${phaseId}{display:block!important;max-height:0!important;overflow:visible!important;position:relative;line-height:0!important;font-size:0!important;z-index:99999!important}`,
    `.ov-phase-${phaseId},.ov-phase-${phaseId} *{pointer-events:none!important}`,
    `td:has(.ov-phase-${phaseId}),tr:has(.ov-phase-${phaseId}),table:has(.ov-phase-${phaseId}),div:has(.ov-phase-${phaseId}){overflow:visible!important;max-height:none!important}`,
    `#overlay-row-${phaseId},#overlay-col-${phaseId},#overlay-html-${phaseId}{overflow:visible!important}`,
    keyframeCSS,
    shadowKfCSS,
    wobbleCSS,
    sweepWind.css,
    `.ov-static-${phaseId}{display:none!important}`,
    `@media (prefers-reduced-motion:reduce){.ov-anim-${phaseId}{display:none!important}.ov-static-${phaseId}{display:block!important;position:absolute;top:12px;right:12px;z-index:99999;opacity:0.95}.ov-static-${phaseId} img{-webkit-animation:none!important;animation:none!important}}`,
    `@supports not(selector(:has(*))){.ov-phase-${phaseId} td,.ov-phase-${phaseId} tr,.ov-phase-${phaseId} table,.ov-phase-${phaseId} div{overflow:visible!important}}`,
    `@media only screen and (max-width:480px){.ov-phase-${phaseId}{display:none!important}}`,
    `</style>`,
    `<!--[if !mso]><!-->`,
    `<div class="ov-static-${phaseId}" aria-hidden="true">${planeAssetHtml}</div>`,
    `<div class="ov-anim-${phaseId}" style="position:relative;height:0;overflow:visible;z-index:99999;-webkit-perspective:600px;perspective:600px;-webkit-transform-style:preserve-3d;transform-style:preserve-3d;">`,
    trailSVG,
    shadowDiv,
    reflectionDiv,
    `<div class="ov-plane-${phaseId}" style="position:absolute;top:-30px;${phase.entryDirection === 'left' ? 'left:-40px' : 'right:-40px'};z-index:99999;-webkit-transform-style:preserve-3d;transform-style:preserve-3d;-webkit-transform:perspective(600px) rotateX(${depth.tilt.toFixed(1)}deg) scale3d(${depth.scale.toFixed(2)},${depth.scale.toFixed(2)},1);transform:perspective(600px) rotateX(${depth.tilt.toFixed(1)}deg) scale3d(${depth.scale.toFixed(2)},${depth.scale.toFixed(2)},1);-webkit-animation:${kfName} ${duration}s ${phase.animationDelay} ${flightEasing} infinite alternate;animation:${kfName} ${duration}s ${phase.animationDelay} ${flightEasing} infinite alternate;will-change:transform;">`,
    `<div style="position:relative;display:inline-block;-webkit-animation:${wobbleName} ${wobbleDur}s ease-in-out infinite;animation:${wobbleName} ${wobbleDur}s ease-in-out infinite;will-change:transform;">`,
    sweepWind.html,
    `<div style="position:relative;z-index:2;display:inline-block">`,
    planeAssetHtml,
    `</div>`,
    `</div>`,
    `</div>`,
    `</div>`,
    `<!--<![endif]-->`,
    `</div>`,
  ].join('\n');

  return {
    id: `overlay-row-${phaseId}`,
    cells: [1],
    columns: [
      {
        id: `overlay-col-${phaseId}`,
        contents: [
          {
            id: `overlay-html-${phaseId}`,
            type: 'html',
            values: {
              html: htmlContent,
              hideDesktop: false,
              hideMobile: true,
              containerPadding: '0px',
              anchor: '',
              _meta: {
                htmlID: `overlay-html-${phaseId}`,
                htmlClassNames: 'overlay-phase-block',
              },
            },
          },
        ],
        values: {
          backgroundColor: 'transparent',
          padding: '0px',
          border: {},
          borderRadius: '0px',
          _meta: {
            htmlID: `overlay-col-${phaseId}`,
            htmlClassNames: 'overlay-phase-col',
          },
        },
      },
    ],
    values: {
      displayCondition: null,
      columns: false,
      backgroundColor: 'transparent',
      columnsBackgroundColor: '',
      backgroundImage: {},
      padding: '0px',
      anchor: '',
      hideDesktop: false,
      hideMobile: true,
      noStackMobile: false,
      _meta: {
        htmlID: `overlay-row-${phaseId}`,
        htmlClassNames: 'overlay-phantom-phase',
      },
      _isOverlay: true,
      _overlayConfig: {
        assetUrl: '',
        width: 48,
        height: 32,
        position: { top: 0, left: 0 },
        motion: MOTION_PRESETS.glide,
        assetId: phaseId,
        motionIntensity: overlayIntensity,
      },
    } as unknown as Va2UnlayerRow['values'],
  };
}
