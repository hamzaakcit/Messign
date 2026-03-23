// ─────────────────────────────────────────────────────────────────────────────
// Design Tokens — Messign Visual Architect · v2.0
// ─────────────────────────────────────────────────────────────────────────────

import type { ColorTheme, DesignManifest, LayoutDensity, VisualStyle } from './types/designManifest.types';
import type {
  ContrastResult,
  DesignTheme,
  SpacingKey,
  SpacingScale,
  ThemeName,
  ThemeTypography,
  ThemeValidation,
} from './types';

export const SPACING = {
  xs: '8px',
  sm: '12px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  xxl: '40px',
  hero: '48px',
  section: '64px',
} as const;

export const MIN_ROW_PADDING = SPACING.xxl;

export const LUXURY_SPACING = {
  heroTop: '60px',
  heroBottom: '80px',
  sectionGap: '72px',
  cardInner: '48px',
  ctaBlock: '56px',
} as const;

export const TYPOGRAPHY = {
  fontFamily: {
    primary: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
    heading: "'Montserrat', 'Inter', 'Segoe UI', system-ui, sans-serif",
    display: "'Playfair Display', Georgia, 'Times New Roman', serif",
    mono: "'JetBrains Mono', 'Fira Code', monospace",
  },
  fontSize: {
    xs: '12px',
    sm: '14px',
    base: '16px',
    md: '18px',
    lg: '22px',
    xl: '28px',
    xxl: '36px',
    hero: '44px',
    display: '52px',
  },
  fontWeight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
    black: '900',
  },
  lineHeight: {
    tight: '1.2',
    snug: '1.3',
    normal: '1.5',
    relaxed: '1.7',
    loose: '1.8',
  },
  letterSpacing: {
    tight: '-0.02em',
    normal: '0',
    wide: '0.02em',
    caps: '0.08em',
    display: '-0.03em',
  },
} as const;

export interface GoogleFontConfig {
  label: string;
  value: string;
  url: string;
  weights: number[];
}

export const GOOGLE_FONTS: GoogleFontConfig[] = [
  {
    label: 'Montserrat',
    value: "'Montserrat', sans-serif",
    url: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap',
    weights: [400, 500, 600, 700, 800, 900],
  },
  {
    label: 'Playfair Display',
    value: "'Playfair Display', serif",
    url: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700;800;900&display=swap',
    weights: [400, 500, 600, 700, 800, 900],
  },
  {
    label: 'Inter',
    value: "'Inter', sans-serif",
    url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
    weights: [400, 500, 600, 700, 800],
  },
  {
    label: 'DM Sans',
    value: "'DM Sans', sans-serif",
    url: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap',
    weights: [400, 500, 600, 700],
  },
  {
    label: 'Space Grotesk',
    value: "'Space Grotesk', sans-serif",
    url: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap',
    weights: [400, 500, 600, 700],
  },
];

export const RADII = {
  none: '0px',
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  xxl: '20px',
  pill: '999px',
} as const;

export const DEFAULT_BORDER_RADIUS = RADII.lg;

export interface ColorPalette {
  background: string;
  surface: string;
  primary: string;
  primaryHover: string;
  text: string;
  textMuted: string;
  textOnPrimary: string;
  border: string;
  footerBg: string;
  footerText: string;
  heroOverlayText: string;
  heroOverlayScrim: string;
  heroCtaBg: string;
  heroCtaText: string;
  accent?: string;
  glassCardBg?: string;
  glassCardBorder?: string;
}

export const COLOR_PALETTES: Record<ColorTheme, ColorPalette> = {
  messign_blue: {
    background: '#F8FAFC',
    surface: '#FFFFFF',
    primary: '#0070F3',
    primaryHover: '#005BD4',
    text: '#111827',
    textMuted: '#6B7280',
    textOnPrimary: '#FFFFFF',
    border: '#E5E7EB',
    footerBg: '#F1F5F9',
    footerText: '#9CA3AF',
    heroOverlayText: '#FFFFFF',
    heroOverlayScrim: 'rgba(0,0,0,0.45)',
    heroCtaBg: '#0070F3',
    heroCtaText: '#FFFFFF',
  },
  modern_noir: {
    background: '#09090B',
    surface: '#111113',
    primary: '#3B82F6',
    primaryHover: '#2563EB',
    text: '#FAFAFA',
    textMuted: '#A1A1AA',
    textOnPrimary: '#FFFFFF',
    border: '#27272A',
    footerBg: '#09090B',
    footerText: '#71717A',
    heroOverlayText: '#FFFFFF',
    heroOverlayScrim: 'rgba(0,0,0,0.60)',
    heroCtaBg: '#3B82F6',
    heroCtaText: '#FFFFFF',
    accent: '#3B82F6',
  },
  warm_sunrise: {
    background: '#FFFBF0',
    surface: '#FFFFFF',
    primary: '#E8A317',
    primaryHover: '#D4941A',
    text: '#1C1917',
    textMuted: '#78716C',
    textOnPrimary: '#FFFFFF',
    border: '#E7E5E4',
    footerBg: '#FEF3C7',
    footerText: '#A8A29E',
    heroOverlayText: '#FFFFFF',
    heroOverlayScrim: 'rgba(28,25,23,0.50)',
    heroCtaBg: '#E8A317',
    heroCtaText: '#FFFFFF',
  },
  ocean_breeze: {
    background: '#F0F9FF',
    surface: '#FFFFFF',
    primary: '#0891B2',
    primaryHover: '#0E7490',
    text: '#0C4A6E',
    textMuted: '#64748B',
    textOnPrimary: '#FFFFFF',
    border: '#BAE6FD',
    footerBg: '#ECFEFF',
    footerText: '#94A3B8',
    heroOverlayText: '#FFFFFF',
    heroOverlayScrim: 'rgba(12,74,110,0.50)',
    heroCtaBg: '#0891B2',
    heroCtaText: '#FFFFFF',
  },
  electric_violet: {
    background: '#FAF5FF',
    surface: '#FFFFFF',
    primary: '#7C3AED',
    primaryHover: '#6D28D9',
    text: '#1E1B4B',
    textMuted: '#6B7280',
    textOnPrimary: '#FFFFFF',
    border: '#E9D5FF',
    footerBg: '#F5F3FF',
    footerText: '#9CA3AF',
    heroOverlayText: '#FFFFFF',
    heroOverlayScrim: 'rgba(30,27,75,0.50)',
    heroCtaBg: '#7C3AED',
    heroCtaText: '#FFFFFF',
    accent: '#A78BFA',
  },
  forest_green: {
    background: '#F0FDF4',
    surface: '#FFFFFF',
    primary: '#15803D',
    primaryHover: '#166534',
    text: '#14532D',
    textMuted: '#6B7280',
    textOnPrimary: '#FFFFFF',
    border: '#BBF7D0',
    footerBg: '#ECFDF5',
    footerText: '#9CA3AF',
    heroOverlayText: '#FFFFFF',
    heroOverlayScrim: 'rgba(20,83,45,0.50)',
    heroCtaBg: '#15803D',
    heroCtaText: '#FFFFFF',
  },
  soft_pastel: {
    background: '#FFF8F3',
    surface: '#FFFFFF',
    primary: '#F472B6',
    primaryHover: '#EC4899',
    text: '#1F2937',
    textMuted: '#6B7280',
    textOnPrimary: '#FFFFFF',
    border: '#FECDD3',
    footerBg: '#FFF1F2',
    footerText: '#9CA3AF',
    heroOverlayText: '#1F2937',
    heroOverlayScrim: 'rgba(255,255,255,0.65)',
    heroCtaBg: '#F472B6',
    heroCtaText: '#FFFFFF',
  },
  glassmorphism: {
    background: '#0F172A',
    surface: '#1E293B',
    primary: '#38BDF8',
    primaryHover: '#0EA5E9',
    text: '#F1F5F9',
    textMuted: '#94A3B8',
    textOnPrimary: '#0F172A',
    border: 'rgba(148,163,184,0.2)',
    footerBg: '#0F172A',
    footerText: '#64748B',
    heroOverlayText: '#FFFFFF',
    heroOverlayScrim: 'rgba(15,23,42,0.40)',
    heroCtaBg: '#38BDF8',
    heroCtaText: '#0F172A',
    glassCardBg: 'rgba(30,41,59,0.60)',
    glassCardBorder: 'rgba(148,163,184,0.15)',
  },
} as const;

export const BUTTON_DEFAULTS = {
  padding: `${SPACING.sm} ${SPACING.lg}`,
  borderRadius: DEFAULT_BORDER_RADIUS,
  fontSize: TYPOGRAPHY.fontSize.base,
  fontWeight: TYPOGRAPHY.fontWeight.semibold,
  lineHeight: '120%',
  fullWidthOnMobile: true,
} as const;

export const BUTTON_PILL = {
  ...BUTTON_DEFAULTS,
  borderRadius: RADII.pill,
  padding: `${SPACING.md} ${SPACING.xl}`,
} as const;

export const BUTTON_SHARP = {
  ...BUTTON_DEFAULTS,
  borderRadius: RADII.sm,
} as const;

export const IMAGE_DEFAULTS = {
  borderRadius: DEFAULT_BORDER_RADIUS,
  fullWidthOnMobile: true,
  heroWidth: 800,
  heroHeight: 450,
  featureIconWidth: 80,
  featureIconHeight: 80,
  inlineWidth: 360,
  inlineHeight: 240,
} as const;

export const CONTENT_WIDTH = '640px';

export interface ArtDirectionModifier {
  suffix: string;
  negativePrompt?: string;
}

const VISUAL_STYLE_MODIFIERS: Record<VisualStyle, ArtDirectionModifier> = {
  '3D_isometric': {
    suffix:
      '3D high-fidelity render, Unreal Engine 5 style, volumetric lighting, isometric perspective, ray-traced reflections, studio quality',
    negativePrompt: 'flat, 2D, sketch, low-res, blurry',
  },
  glassmorphism: {
    suffix:
      'frosted glass effect, translucent surfaces, soft blurred background, gradient mesh lighting, premium UI aesthetic, depth of field',
    negativePrompt: 'opaque, flat, solid backgrounds',
  },
  editorial_photography: {
    suffix:
      'editorial photography, high-end magazine quality, dramatic natural lighting, shallow depth of field, 85mm lens, f/1.4 bokeh',
    negativePrompt: 'illustration, cartoon, 3D render, clip art',
  },
  neon_futuristic: {
    suffix:
      'neon glow, cyberpunk aesthetic, dark background, electric blue and magenta accents, volumetric fog, holographic elements',
    negativePrompt: 'daylight, natural, organic, warm tones',
  },
  minimal_clean: {
    suffix:
      'minimalist composition, clean white space, single focal point, soft shadows, product photography style, elegant simplicity',
    negativePrompt: 'cluttered, busy, noisy, chaotic',
  },
};

const THEME_MODIFIERS: Partial<Record<ColorTheme, string>> = {
  modern_noir: 'minimalist black glass backgrounds, dark moody atmosphere, high contrast, cool-toned accent lighting',
  soft_pastel: 'soft pastel color palette, mint and peach tones, gentle gradients, dreamy atmosphere, light and airy',
  glassmorphism: 'frosted glass UI elements, semi-transparent overlays, gradient mesh backgrounds, deep blue-slate tones',
  electric_violet: 'purple and violet color scheme, electric accents, deep shadows, premium feel',
  warm_sunrise: 'warm golden hour lighting, amber and honey tones, inviting atmosphere',
};

export function buildArtDirectionSuffix(visualStyle?: VisualStyle, colorTheme?: ColorTheme): string {
  const parts: string[] = [];

  if (visualStyle && VISUAL_STYLE_MODIFIERS[visualStyle]) {
    parts.push(VISUAL_STYLE_MODIFIERS[visualStyle].suffix);
  }

  if (colorTheme && THEME_MODIFIERS[colorTheme]) {
    parts.push(THEME_MODIFIERS[colorTheme]!);
  }

  if (parts.length === 0) {
    parts.push('high-quality, professional, modern aesthetic');
  }

  return parts.join(', ');
}

/** Art-direction wrapper for image-gen prompts (Visual Architect v2). */
export function enhanceImagePrompt(
  rawPrompt: string,
  manifest: Pick<DesignManifest, 'visualStyle' | 'colorTheme'>,
): string {
  const t = rawPrompt.trim();
  if (!t) return rawPrompt;

  const suffix = buildArtDirectionSuffix(manifest.visualStyle, manifest.colorTheme);
  if (!suffix) return rawPrompt;

  const lower = t.toLowerCase();
  const alreadyDirected =
    lower.includes('unreal engine') ||
    lower.includes('volumetric') ||
    lower.includes('editorial photography') ||
    lower.includes('frosted glass');

  if (alreadyDirected) return rawPrompt;

  return `${rawPrompt}, ${suffix}`;
}

export const MESSIGN_BRAND = {
  logoUrl: 'https://cdn.messign.com/brand/messign-logo-horizontal.png',
  logoWidth: 140,
  logoHeight: 36,
  logoAlt: 'Messign',
  logoFallbackUrl: 'https://placehold.co/140x36/transparent/0070F3?text=Messign&font=inter',
} as const;


export function resolvePalette(theme: ColorTheme): ColorPalette {
  return COLOR_PALETTES[theme] ?? COLOR_PALETTES.messign_blue;
}

export function resolveRowPadding(density?: LayoutDensity): string {
  switch (density) {
    case 'airy':
      return LUXURY_SPACING.sectionGap;
    case 'compact':
      return SPACING.lg;
    default:
      return MIN_ROW_PADDING;
  }
}
// ════════════════════════════════════════════════════════════
// Visual Architect v2 — Design Token System
// ════════════════════════════════════════════════════════════
// Note: A few hex values (CTA primaries, some muted tones) are nudged from the
// paper spec so `validateThemeContrast` meets WCAG AA (4.5:1) on all pairs.

const VA2_SPACING_SCALE: SpacingScale = {
  xs: 8,
  sm: 16,
  md: 24,
  lg: 40,
  xl: 64,
  xxl: 96,
};

// ── Color Utilities ──

/**
 * Convert hex color to RGB array.
 * Handles both "#RGB" and "#RRGGBB" formats.
 */
export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/**
 * Get relative luminance of a hex color per WCAG 2.1.
 * Returns value between 0 (black) and 1 (white).
 */
export function getRelativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const srgb = c / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculate WCAG 2.1 contrast ratio between two hex colors.
 * Returns ratio from 1 (identical) to 21 (black on white).
 */
export function getContrastRatio(hex1: string, hex2: string): number {
  const lum1 = getRelativeLuminance(hex1);
  const lum2 = getRelativeLuminance(hex2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Adjust brightness of a hex color by a percentage.
 * Positive values lighten, negative values darken.
 * Used for hover states on CTA buttons.
 */
export function adjustBrightness(hex: string, percent: number): string {
  const [r, g, b] = hexToRgb(hex);
  const adjust = (c: number) => Math.min(255, Math.max(0, Math.round(c + (c * percent) / 100)));
  const toHex = (c: number) => c.toString(16).padStart(2, '0');
  return `#${toHex(adjust(r))}${toHex(adjust(g))}${toHex(adjust(b))}`;
}

// ── Theme definitions (exported) ──

const executiveTypography: ThemeTypography = {
  hero: { fontFamily: 'Inter', fontSize: 36, fontWeight: 700, lineHeight: 1.2, letterSpacing: -0.5 },
  heading: { fontFamily: 'Inter', fontSize: 24, fontWeight: 600, lineHeight: 1.3 },
  subheading: { fontFamily: 'Inter', fontSize: 18, fontWeight: 500, lineHeight: 1.4 },
  body: { fontFamily: 'Inter', fontSize: 16, fontWeight: 400, lineHeight: 1.6 },
  caption: { fontFamily: 'Inter', fontSize: 13, fontWeight: 400, lineHeight: 1.4 },
  cta: { fontFamily: 'Inter', fontSize: 16, fontWeight: 600, lineHeight: 1.0 },
  preheader: { fontFamily: 'Inter', fontSize: 12, fontWeight: 400, lineHeight: 1.0 },
};

export const executiveTheme: DesignTheme = {
  name: 'executive',
  label: 'Executive',
  description: 'B2B enterprise, SaaS. Navy + white + blue accent. Clean authority.',
  colors: {
    primary: '#1B2A4A',
    secondary: '#475569',
    accent: '#2563EB',
    background: '#FFFFFF',
    surface: '#F8FAFC',
    text: '#1E293B',
    textMuted: '#64748B',
    ctaPrimary: '#2563EB',
    ctaText: '#FFFFFF',
    divider: '#E2E8F0',
    heroOverlayStart: 'rgba(27,42,74,0.7)',
    heroOverlayEnd: 'rgba(27,42,74,0.3)',
  },
  typography: executiveTypography,
  spacing: VA2_SPACING_SCALE,
  borderRadius: 8,
  shadowStyle: 'soft',
  googleFonts: ['Inter'],
};

const startupTypography: ThemeTypography = {
  hero: {
    fontFamily: 'Space Grotesk',
    fontSize: 36,
    fontWeight: 700,
    lineHeight: 1.2,
    letterSpacing: -0.5,
  },
  heading: { fontFamily: 'Space Grotesk', fontSize: 24, fontWeight: 600, lineHeight: 1.3 },
  subheading: { fontFamily: 'Inter', fontSize: 18, fontWeight: 500, lineHeight: 1.4 },
  body: { fontFamily: 'Inter', fontSize: 16, fontWeight: 400, lineHeight: 1.6 },
  caption: { fontFamily: 'Inter', fontSize: 13, fontWeight: 400, lineHeight: 1.4 },
  cta: { fontFamily: 'Space Grotesk', fontSize: 16, fontWeight: 600, lineHeight: 1.0 },
  preheader: { fontFamily: 'Inter', fontSize: 12, fontWeight: 400, lineHeight: 1.0 },
};

export const startupTheme: DesignTheme = {
  name: 'startup',
  label: 'Startup',
  description: 'Early-stage, tech launch. Dark gray + light background + indigo accent.',
  colors: {
    primary: '#111827',
    secondary: '#4B5563',
    accent: '#6366F1',
    background: '#F9FAFB',
    surface: '#FFFFFF',
    text: '#111827',
    textMuted: '#6B7280',
    ctaPrimary: '#4F46E5',
    ctaText: '#FFFFFF',
    divider: '#E5E7EB',
    heroOverlayStart: 'rgba(17,24,39,0.7)',
    heroOverlayEnd: 'rgba(17,24,39,0.3)',
  },
  typography: startupTypography,
  spacing: VA2_SPACING_SCALE,
  borderRadius: 12,
  shadowStyle: 'medium',
  googleFonts: ['Space Grotesk', 'Inter'],
};

const luxuryTypography: ThemeTypography = {
  hero: {
    fontFamily: 'Playfair Display',
    fontSize: 40,
    fontWeight: 700,
    lineHeight: 1.2,
    letterSpacing: -0.3,
    textTransform: 'none',
  },
  heading: { fontFamily: 'Playfair Display', fontSize: 28, fontWeight: 600, lineHeight: 1.3 },
  subheading: { fontFamily: 'Inter', fontSize: 18, fontWeight: 500, lineHeight: 1.4 },
  body: { fontFamily: 'Inter', fontSize: 16, fontWeight: 400, lineHeight: 1.6 },
  caption: { fontFamily: 'Inter', fontSize: 13, fontWeight: 400, lineHeight: 1.4 },
  cta: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1.0,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  preheader: { fontFamily: 'Inter', fontSize: 12, fontWeight: 400, lineHeight: 1.0 },
};

export const luxuryTheme: DesignTheme = {
  name: 'luxury',
  label: 'Luxury',
  description: 'Premium brands, fashion. Near-black + cream + gold accent.',
  colors: {
    primary: '#1A1A1A',
    secondary: '#525252',
    accent: '#B8860B',
    background: '#FAF9F6',
    surface: '#FFFFFF',
    text: '#1A1A1A',
    textMuted: '#737373',
    ctaPrimary: '#1A1A1A',
    ctaText: '#FAF9F6',
    divider: '#E5E5E5',
    heroOverlayStart: 'rgba(26,26,26,0.6)',
    heroOverlayEnd: 'rgba(26,26,26,0.2)',
  },
  typography: luxuryTypography,
  spacing: VA2_SPACING_SCALE,
  borderRadius: 0,
  shadowStyle: 'none',
  googleFonts: ['Playfair Display', 'Inter'],
};

export const minimalTheme: DesignTheme = {
  name: 'minimal',
  label: 'Minimal',
  description: 'General/default. Gray tones, no frills, maximum readability.',
  colors: {
    primary: '#1F2937',
    secondary: '#4B5563',
    accent: '#374151',
    background: '#FFFFFF',
    surface: '#F9FAFB',
    text: '#1F2937',
    textMuted: '#6B7280',
    ctaPrimary: '#1F2937',
    ctaText: '#FFFFFF',
    divider: '#E5E7EB',
    heroOverlayStart: 'rgba(31,41,55,0.7)',
    heroOverlayEnd: 'rgba(31,41,55,0.3)',
  },
  typography: executiveTypography,
  spacing: VA2_SPACING_SCALE,
  borderRadius: 6,
  shadowStyle: 'soft',
  googleFonts: ['Inter'],
};

const boldTypography: ThemeTypography = {
  hero: {
    fontFamily: 'Space Grotesk',
    fontSize: 42,
    fontWeight: 800,
    lineHeight: 1.2,
    textTransform: 'uppercase',
  },
  heading: { fontFamily: 'Space Grotesk', fontSize: 24, fontWeight: 600, lineHeight: 1.3 },
  subheading: { fontFamily: 'Inter', fontSize: 18, fontWeight: 500, lineHeight: 1.4 },
  body: { fontFamily: 'Inter', fontSize: 16, fontWeight: 400, lineHeight: 1.6 },
  caption: { fontFamily: 'Inter', fontSize: 13, fontWeight: 400, lineHeight: 1.4 },
  cta: {
    fontFamily: 'Space Grotesk',
    fontSize: 16,
    fontWeight: 700,
    lineHeight: 1.0,
    textTransform: 'uppercase',
  },
  preheader: { fontFamily: 'Inter', fontSize: 12, fontWeight: 400, lineHeight: 1.0 },
};

export const boldTheme: DesignTheme = {
  name: 'bold',
  label: 'Bold',
  description: 'D2C, ecommerce, youth. Dark + white + red accent. High energy.',
  colors: {
    primary: '#0F172A',
    secondary: '#334155',
    accent: '#EF4444',
    background: '#FFFFFF',
    surface: '#FEF2F2',
    text: '#0F172A',
    textMuted: '#5B6470',
    ctaPrimary: '#DC2626',
    ctaText: '#FFFFFF',
    divider: '#FCA5A5',
    heroOverlayStart: 'rgba(15,23,42,0.7)',
    heroOverlayEnd: 'rgba(15,23,42,0.3)',
  },
  typography: boldTypography,
  spacing: VA2_SPACING_SCALE,
  borderRadius: 16,
  shadowStyle: 'dramatic',
  googleFonts: ['Space Grotesk', 'Inter'],
};

const natureTypography: ThemeTypography = {
  hero: { fontFamily: 'Inter', fontSize: 36, fontWeight: 700, lineHeight: 1.2, letterSpacing: -0.5 },
  heading: { fontFamily: 'Inter', fontSize: 24, fontWeight: 600, lineHeight: 1.3 },
  subheading: { fontFamily: 'Inter', fontSize: 18, fontWeight: 500, lineHeight: 1.4 },
  body: { fontFamily: 'Inter', fontSize: 16, fontWeight: 400, lineHeight: 1.7 },
  caption: { fontFamily: 'Inter', fontSize: 13, fontWeight: 400, lineHeight: 1.4 },
  cta: { fontFamily: 'Inter', fontSize: 16, fontWeight: 600, lineHeight: 1.0 },
  preheader: { fontFamily: 'Inter', fontSize: 12, fontWeight: 400, lineHeight: 1.0 },
};

export const natureTheme: DesignTheme = {
  name: 'nature',
  label: 'Nature',
  description: 'Sustainability, organic. Deep green + light green bg + green accent.',
  colors: {
    primary: '#1B4332',
    secondary: '#2D6A4F',
    accent: '#15803D',
    background: '#F0FDF4',
    surface: '#FFFFFF',
    text: '#1B4332',
    textMuted: '#4D7C62',
    ctaPrimary: '#15803D',
    ctaText: '#FFFFFF',
    divider: '#BBF7D0',
    heroOverlayStart: 'rgba(27,67,50,0.65)',
    heroOverlayEnd: 'rgba(27,67,50,0.25)',
  },
  typography: natureTypography,
  spacing: VA2_SPACING_SCALE,
  borderRadius: 24,
  shadowStyle: 'soft',
  googleFonts: ['Inter'],
};

const techTypography: ThemeTypography = {
  hero: {
    fontFamily: 'JetBrains Mono',
    fontSize: 34,
    fontWeight: 700,
    lineHeight: 1.2,
    letterSpacing: -1,
  },
  heading: { fontFamily: 'Inter', fontSize: 24, fontWeight: 600, lineHeight: 1.3 },
  subheading: { fontFamily: 'Inter', fontSize: 18, fontWeight: 500, lineHeight: 1.4 },
  body: { fontFamily: 'Inter', fontSize: 16, fontWeight: 400, lineHeight: 1.6 },
  caption: { fontFamily: 'Inter', fontSize: 13, fontWeight: 400, lineHeight: 1.4 },
  cta: {
    fontFamily: 'JetBrains Mono',
    fontSize: 16,
    fontWeight: 600,
    lineHeight: 1.0,
    letterSpacing: 0.5,
  },
  preheader: { fontFamily: 'Inter', fontSize: 12, fontWeight: 400, lineHeight: 1.0 },
};

export const techTheme: DesignTheme = {
  name: 'tech',
  label: 'Tech',
  description: 'Developer tools, AI. Near-black + light gray + purple accent.',
  colors: {
    primary: '#0A0A0B',
    secondary: '#3F3F46',
    accent: '#8B5CF6',
    background: '#FAFAFA',
    surface: '#F4F4F5',
    text: '#18181B',
    textMuted: '#6B6B73',
    ctaPrimary: '#7C3AED',
    ctaText: '#FFFFFF',
    divider: '#E4E4E7',
    heroOverlayStart: 'rgba(10,10,11,0.75)',
    heroOverlayEnd: 'rgba(10,10,11,0.35)',
  },
  typography: techTypography,
  spacing: VA2_SPACING_SCALE,
  borderRadius: 8,
  shadowStyle: 'medium',
  googleFonts: ['JetBrains Mono', 'Inter'],
};

const warmTypography: ThemeTypography = {
  hero: { fontFamily: 'Inter', fontSize: 36, fontWeight: 700, lineHeight: 1.2, letterSpacing: -0.5 },
  heading: { fontFamily: 'Inter', fontSize: 24, fontWeight: 600, lineHeight: 1.3 },
  subheading: { fontFamily: 'Inter', fontSize: 18, fontWeight: 500, lineHeight: 1.4 },
  body: { fontFamily: 'Inter', fontSize: 16, fontWeight: 400, lineHeight: 1.7 },
  caption: { fontFamily: 'Inter', fontSize: 13, fontWeight: 400, lineHeight: 1.4 },
  cta: { fontFamily: 'Inter', fontSize: 16, fontWeight: 600, lineHeight: 1.0 },
  preheader: { fontFamily: 'Inter', fontSize: 12, fontWeight: 400, lineHeight: 1.0 },
};

export const warmTheme: DesignTheme = {
  name: 'warm',
  label: 'Warm',
  description: 'Lifestyle, food, travel. Dark brown + cream + amber accent.',
  colors: {
    primary: '#451A03',
    secondary: '#78350F',
    accent: '#D97706',
    background: '#FFFBEB',
    surface: '#FFFFFF',
    text: '#451A03',
    textMuted: '#92400E',
    ctaPrimary: '#B45309',
    ctaText: '#FFFFFF',
    divider: '#FDE68A',
    heroOverlayStart: 'rgba(69,26,3,0.6)',
    heroOverlayEnd: 'rgba(69,26,3,0.25)',
  },
  typography: warmTypography,
  spacing: VA2_SPACING_SCALE,
  borderRadius: 12,
  shadowStyle: 'soft',
  googleFonts: ['Inter'],
};

/** Map of all available themes */
const THEMES: Record<ThemeName, DesignTheme> = {
  executive: executiveTheme,
  startup: startupTheme,
  luxury: luxuryTheme,
  minimal: minimalTheme,
  bold: boldTheme,
  nature: natureTheme,
  tech: techTheme,
  warm: warmTheme,
};

/**
 * Get a theme by name. Falls back to "minimal" with a console.warn for invalid names.
 */
export function getTheme(name: ThemeName | string): DesignTheme {
  if (name in THEMES) {
    return THEMES[name as ThemeName];
  }
  console.warn(`[DesignTokens] Unknown theme "${name}", falling back to "minimal"`);
  return THEMES.minimal;
}

/**
 * Get all available themes as an array (for theme picker dropdown).
 */
export function getAllThemes(): DesignTheme[] {
  return Object.values(THEMES);
}

/**
 * Get spacing value from a theme by key.
 */
export function getSpacing(theme: DesignTheme, key: SpacingKey): number {
  return theme.spacing[key];
}

/**
 * Get Google Fonts stylesheet URL for a theme.
 * Returns a <link> href for injecting into Unlayer.
 */
export function getGoogleFontsUrl(theme: DesignTheme): string {
  if (theme.googleFonts.length === 0) return '';
  const families = theme.googleFonts
    .map((font) => {
      const encoded = font.replace(/ /g, '+');
      return `family=${encoded}:wght@400;500;600;700;800`;
    })
    .join('&');
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

/**
 * Validate all critical contrast pairs in a theme against WCAG AA (4.5:1).
 */
export function validateThemeContrast(theme: DesignTheme): ThemeValidation {
  const pairs: Array<[string, string, string]> = [
    ['text-on-background', theme.colors.text, theme.colors.background],
    ['text-on-surface', theme.colors.text, theme.colors.surface],
    ['textMuted-on-background', theme.colors.textMuted, theme.colors.background],
    ['textMuted-on-surface', theme.colors.textMuted, theme.colors.surface],
    ['primary-on-background', theme.colors.primary, theme.colors.background],
    ['primary-on-surface', theme.colors.primary, theme.colors.surface],
    ['ctaText-on-ctaPrimary', theme.colors.ctaText, theme.colors.ctaPrimary],
  ];

  const results: ContrastResult[] = pairs.map(([pair, fg, bg]) => {
    const ratio = parseFloat(getContrastRatio(fg, bg).toFixed(2));
    return {
      pair,
      ratio,
      passes: ratio >= 4.5,
      level: ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : 'FAIL',
    };
  });

  return {
    theme: theme.name,
    valid: results.every((r) => r.passes),
    results,
    failures: results.filter((r) => !r.passes),
  };
}

/**
 * Generate a unique ID for Unlayer elements.
 * Format: u_{prefix}_{counter} where counter increments.
 */
let _idCounter = 0;
export function generateId(prefix: string = 'el'): string {
  _idCounter += 1;
  return `u_${prefix}_${_idCounter}`;
}

/** Reset ID counter (for testing only) */
export function resetIdCounter(): void {
  _idCounter = 0;
}
