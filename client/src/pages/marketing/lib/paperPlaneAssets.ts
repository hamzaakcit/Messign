import type { ThemeName } from './types/designTokenTypes';
import { marketingAPI } from '../../../lib/marketingApi';

// ─────────────────────────────────────────────────────────────────────────────
// Paper Plane Assets — high-quality SVG fallback, URL cache, AI resolver
// ─────────────────────────────────────────────────────────────────────────────

const urlCache = new Map<ThemeName, string>();
const pendingRequests = new Map<ThemeName, Promise<string | null>>();
const resolveListeners = new Set<(theme: ThemeName, url: string) => void>();

/** Rendered dimensions for the plane `<img>` element. */
export const PLANE_WIDTH = 96;
export const PLANE_HEIGHT = 60;

interface PlaneThemeColors {
  paper: string;
  paperLight: string;
  paperDark: string;
  foldLine: string;
  accent: string;
  shadow: string;
}

const THEME_PLANE_COLORS: Record<ThemeName, PlaneThemeColors> = {
  executive: {
    paper: '#E2E8F0', paperLight: '#F8FAFC', paperDark: '#CBD5E1',
    foldLine: '#94A3B8', accent: '#2563EB', shadow: '#64748B',
  },
  startup: {
    paper: '#E0E7FF', paperLight: '#EEF2FF', paperDark: '#C7D2FE',
    foldLine: '#A5B4FC', accent: '#6366F1', shadow: '#7C85F5',
  },
  luxury: {
    paper: '#FEF3C7', paperLight: '#FFFBEB', paperDark: '#F3E3A4',
    foldLine: '#D6C9A8', accent: '#B8860B', shadow: '#A07808',
  },
  minimal: {
    paper: '#F3F4F6', paperLight: '#FFFFFF', paperDark: '#E5E7EB',
    foldLine: '#D1D5DB', accent: '#9CA3AF', shadow: '#9CA3AF',
  },
  bold: {
    paper: '#FEE2E2', paperLight: '#FFFFFF', paperDark: '#FECACA',
    foldLine: '#FCA5A5', accent: '#DC2626', shadow: '#B91C1C',
  },
  nature: {
    paper: '#ECFCCB', paperLight: '#F7FEE7', paperDark: '#D9F99D',
    foldLine: '#BBF7D0', accent: '#16A34A', shadow: '#15803D',
  },
  tech: {
    paper: '#EDE9FE', paperLight: '#F5F3FF', paperDark: '#DDD6FE',
    foldLine: '#C4B5FD', accent: '#A855F7', shadow: '#7C3AED',
  },
  warm: {
    paper: '#FEF3C7', paperLight: '#FFFBEB', paperDark: '#FDE68A',
    foldLine: '#FDBA74', accent: '#D97706', shadow: '#B45309',
  },
};

/**
 * High-quality 3D paper plane SVG at 480x300 viewBox (rendered at 96x60).
 *
 * Geometry: 14 polygon faces with foreshortened perspective (top wing ~30%
 * larger than bottom). Paper texture via feTurbulence, ambient occlusion
 * along the center fold, specular highlights, and secondary crease lines.
 *
 * SMIL micro-animations (Phase 5):
 *  - Wing flex: top wing rotates ±2.5 deg, bottom wing ±1.8 deg (3.2s loop)
 *  - Specular shimmer: highlight opacity oscillates 0.35–0.7 (2.8s)
 *  - Paper texture: feTurbulence seed cycles 3→7→3 (5s) for subtle grain shift
 *  - Shadow breathing: drop-shadow opacity pulses 0.15–0.25 (3.5s)
 *  - AO breathing: center-fold opacity oscillates 0.55–0.75 (4s)
 *  - Fold-line pulse: center fold stroke-width oscillates 1.2–1.8 (3.8s)
 *  - Accent edge glow: leading-edge opacity oscillates 0.08–0.2 (2.5s)
 */
export function buildFallbackPlaneSVG(theme: ThemeName): string {
  const c = THEME_PLANE_COLORS[theme] ?? THEME_PLANE_COLORS.executive;
  const id = `pp-${theme}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300" width="${PLANE_WIDTH}" height="${PLANE_HEIGHT}">
<defs>
  <linearGradient id="${id}-wto" x1="0%" y1="15%" x2="95%" y2="85%">
    <stop offset="0%" stop-color="${c.paperLight}"/>
    <stop offset="35%" stop-color="${c.paper}"/>
    <stop offset="100%" stop-color="${c.paperDark}" stop-opacity="0.85"/>
  </linearGradient>
  <linearGradient id="${id}-wti" x1="0%" y1="40%" x2="80%" y2="60%">
    <stop offset="0%" stop-color="${c.paper}" stop-opacity="0.95"/>
    <stop offset="100%" stop-color="${c.paperDark}" stop-opacity="0.65"/>
  </linearGradient>
  <linearGradient id="${id}-wbo" x1="10%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="${c.paperDark}" stop-opacity="0.6"/>
    <stop offset="50%" stop-color="${c.shadow}" stop-opacity="0.4"/>
    <stop offset="100%" stop-color="${c.foldLine}" stop-opacity="0.3"/>
  </linearGradient>
  <linearGradient id="${id}-wbi" x1="0%" y1="60%" x2="80%" y2="40%">
    <stop offset="0%" stop-color="${c.shadow}" stop-opacity="0.35"/>
    <stop offset="100%" stop-color="${c.paperDark}" stop-opacity="0.5"/>
  </linearGradient>
  <linearGradient id="${id}-nose" x1="0%" y1="50%" x2="100%" y2="50%">
    <stop offset="0%" stop-color="${c.paperLight}"/>
    <stop offset="100%" stop-color="${c.paper}" stop-opacity="0.8"/>
  </linearGradient>
  <linearGradient id="${id}-ao" x1="0%" y1="0%" x2="0%" y2="100%">
    <stop offset="0%" stop-color="${c.shadow}" stop-opacity="0.3"/>
    <stop offset="50%" stop-color="${c.shadow}" stop-opacity="0.06"/>
    <stop offset="100%" stop-color="${c.shadow}" stop-opacity="0.25"/>
  </linearGradient>
  <linearGradient id="${id}-spec" x1="5%" y1="0%" x2="50%" y2="100%">
    <stop offset="0%" stop-color="#fff" stop-opacity="0.5">
      <animate attributeName="stop-opacity" values="0.5;0.7;0.5" dur="2.8s" repeatCount="indefinite"/>
    </stop>
    <stop offset="30%" stop-color="#fff" stop-opacity="0.15">
      <animate attributeName="stop-opacity" values="0.15;0.3;0.15" dur="2.8s" repeatCount="indefinite"/>
    </stop>
    <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="${id}-edge" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stop-color="${c.accent}" stop-opacity="0.15">
      <animate attributeName="stop-opacity" values="0.08;0.22;0.08" dur="2.5s" repeatCount="indefinite"/>
    </stop>
    <stop offset="100%" stop-color="${c.accent}" stop-opacity="0.04">
      <animate attributeName="stop-opacity" values="0.02;0.08;0.02" dur="2.5s" repeatCount="indefinite"/>
    </stop>
  </linearGradient>
  <filter id="${id}-tex" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="5" seed="3" result="noise">
      <animate attributeName="seed" values="3;5;7;5;3" dur="5s" repeatCount="indefinite"/>
    </feTurbulence>
    <feColorMatrix type="saturate" values="0" in="noise" result="gray"/>
    <feBlend in="SourceGraphic" in2="gray" mode="multiply" result="textured"/>
    <feComposite in="textured" in2="SourceGraphic" operator="in"/>
  </filter>
  <filter id="${id}-sh" x="-12%" y="-12%" width="135%" height="145%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="3.5" result="blr"/>
    <feOffset in="blr" dx="2" dy="4" result="off"/>
    <feFlood flood-color="#000" flood-opacity="0.2" result="clr">
      <animate attributeName="flood-opacity" values="0.15;0.25;0.15" dur="3.5s" repeatCount="indefinite"/>
    </feFlood>
    <feComposite in="clr" in2="off" operator="in" result="shadow"/>
    <feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>
<g filter="url(#${id}-sh)" transform="translate(12,24)">
  <g filter="url(#${id}-tex)">
    <g transform-origin="18 128">
      <animateTransform attributeName="transform" type="rotate" values="-1.2,18,128;1.5,18,128;-1.2,18,128" dur="3.2s" repeatCount="indefinite"/>
      <polygon points="18,128 450,35 300,124" fill="url(#${id}-wto)" stroke="${c.foldLine}" stroke-width="0.5" stroke-linejoin="round"/>
      <polygon points="18,128 300,128 450,35" fill="url(#${id}-wti)" opacity="0.5" stroke="none"/>
      <polygon points="18,128 300,128 450,35" fill="url(#${id}-spec)" opacity="0.55">
        <animate attributeName="opacity" values="0.35;0.7;0.35" dur="2.8s" repeatCount="indefinite"/>
      </polygon>
      <polygon points="410,58 450,35 450,65 430,82" fill="${c.paperLight}" opacity="0.3" stroke="${c.foldLine}" stroke-width="0.2"/>
      <polygon points="340,85 380,68 300,125" fill="${c.paperLight}" opacity="0.08"/>
    </g>
    <g transform-origin="18 138">
      <animateTransform attributeName="transform" type="rotate" values="0.8,18,138;-1.2,18,138;0.8,18,138" dur="3.2s" repeatCount="indefinite"/>
      <polygon points="18,138 300,138 450,225" fill="url(#${id}-wbo)" stroke="${c.foldLine}" stroke-width="0.5" stroke-linejoin="round"/>
      <polygon points="18,138 300,142 450,225" fill="url(#${id}-wbi)" opacity="0.4" stroke="none"/>
      <polygon points="410,200 450,225 450,195 430,178" fill="${c.paper}" opacity="0.18" stroke="${c.foldLine}" stroke-width="0.2"/>
      <polygon points="340,175 380,192 300,140" fill="${c.shadow}" opacity="0.06"/>
    </g>
    <polygon points="18,125 55,125 55,140 18,140" fill="url(#${id}-nose)" stroke="none"/>
    <polygon points="18,122 28,116 28,150 18,144" fill="${c.paperLight}" opacity="0.45"/>
    <polygon points="28,116 18,122 18,133 28,133" fill="${c.paperLight}" opacity="0.6"/>
    <polygon points="28,150 18,144 18,138 28,138" fill="${c.paper}" opacity="0.3"/>
  </g>
  <rect x="18" y="126" width="432" height="12" fill="url(#${id}-ao)" rx="1" opacity="0.65">
    <animate attributeName="opacity" values="0.55;0.75;0.55" dur="4s" repeatCount="indefinite"/>
  </rect>
  <line x1="18" y1="132" x2="450" y2="132" stroke="${c.foldLine}" stroke-width="1.5" opacity="0.5">
    <animate attributeName="stroke-width" values="1.2;1.8;1.2" dur="3.8s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.4;0.6;0.4" dur="3.8s" repeatCount="indefinite"/>
  </line>
  <line x1="18" y1="132" x2="300" y2="132" stroke="${c.accent}" stroke-width="1" opacity="0.25">
    <animate attributeName="opacity" values="0.18;0.35;0.18" dur="2.5s" repeatCount="indefinite"/>
  </line>
  <line x1="18" y1="128" x2="450" y2="35" stroke="${c.paperLight}" stroke-width="0.6" opacity="0.18"/>
  <line x1="18" y1="138" x2="450" y2="225" stroke="${c.foldLine}" stroke-width="0.6" opacity="0.1"/>
  <line x1="160" y1="80" x2="300" y2="127" stroke="${c.foldLine}" stroke-width="0.4" opacity="0.1"/>
  <line x1="300" y1="80" x2="300" y2="127" stroke="${c.foldLine}" stroke-width="0.3" opacity="0.06"/>
  <line x1="160" y1="180" x2="300" y2="139" stroke="${c.foldLine}" stroke-width="0.3" opacity="0.07"/>
  <line x1="300" y1="180" x2="300" y2="139" stroke="${c.foldLine}" stroke-width="0.2" opacity="0.04"/>
  <line x1="18" y1="128" x2="450" y2="35" stroke="url(#${id}-edge)" stroke-width="1.2"/>
  <line x1="18" y1="138" x2="450" y2="225" stroke="url(#${id}-edge)" stroke-width="0.8"/>
</g>
</svg>`;
}

/**
 * Returns the plane asset URL — cached AI-generated PNG, or data-URI SVG fallback.
 * Synchronous: always returns immediately (may be the fallback SVG).
 */
export function getPlaneAssetUrl(theme: ThemeName): string {
  const cached = urlCache.get(theme);
  if (cached) return cached;

  const svg = buildFallbackPlaneSVG(theme);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Subscribe to AI asset resolution events. Called whenever a higher-quality
 * PNG finishes generating, so the caller can rebuild the overlay.
 */
export function onPlaneAssetResolved(
  listener: (theme: ThemeName, url: string) => void,
): () => void {
  resolveListeners.add(listener);
  return () => resolveListeners.delete(listener);
}

/**
 * Asynchronously resolves the AI-generated plane image.
 * Fires API call, updates cache, deduplicates in-flight requests.
 * Notifies listeners when a new URL is resolved so overlays can hot-swap.
 */
export async function resolvePlaneAssetAsync(
  theme: ThemeName,
  userId: string,
): Promise<string | null> {
  const cached = urlCache.get(theme);
  if (cached) return cached;

  const existing = pendingRequests.get(theme);
  if (existing) return existing;

  const promise = (async (): Promise<string | null> => {
    try {
      const checkResult = await marketingAPI.getOverlayAssetUrl(userId, theme);
      if (checkResult?.image_url) {
        const url = checkResult.image_url;
        urlCache.set(theme, url);
        resolveListeners.forEach((fn) => fn(theme, url));
        return url;
      }

      const genResult = await marketingAPI.generateOverlayAsset(userId, {
        theme,
        effect: 'paper_plane',
      });
      if (genResult?.image_url) {
        const url = genResult.image_url;
        urlCache.set(theme, url);
        resolveListeners.forEach((fn) => fn(theme, url));
        return url;
      }
      return null;
    } catch (err) {
      console.warn(`[paperPlaneAssets] Failed to resolve AI plane for ${theme}:`, err);
      return null;
    } finally {
      pendingRequests.delete(theme);
    }
  })();

  pendingRequests.set(theme, promise);
  return promise;
}

/** Directly set a cached URL (used after successful AI generation). */
export function setCachedPlaneUrl(theme: ThemeName, url: string): void {
  urlCache.set(theme, url);
}

/** Check whether a cached URL exists for a theme. */
export function hasCachedPlaneUrl(theme: ThemeName): boolean {
  return urlCache.has(theme);
}
