// ─────────────────────────────────────────────────────────────────────────────
// Design Manifest Types — Visual Architect v1 (Legacy)
// ─────────────────────────────────────────────────────────────────────────────

export type ColorTheme =
  | 'messign_blue'
  | 'modern_noir'
  | 'warm_sunrise'
  | 'ocean_breeze'
  | 'electric_violet'
  | 'forest_green'
  | 'soft_pastel'
  | 'glassmorphism';

export type LayoutPreset = 'minimalist' | 'magazine' | 'editorial' | 'immersive';

export type HeroImageStyle = 'background' | 'inline' | 'side-by-side';

export type VisualStyle =
  | '3D_isometric'
  | 'glassmorphism'
  | 'editorial_photography'
  | 'neon_futuristic'
  | 'minimal_clean';

export type LayoutDensity = 'compact' | 'normal' | 'airy';

export type CTAStyle = 'pill' | 'sharp' | 'rounded' | 'ghost' | 'fullWidth';

export type Alignment = 'left' | 'center' | 'right';

export interface ManifestSection {
  type: string;
  [key: string]: unknown;
}

export interface ManifestHeroSection extends ManifestSection {
  type: 'hero';
  headline?: string;
  subheadline?: string;
  alignment?: Alignment;
  overlayText?: string;
  imagePrompt?: string;
  imageStyle?: string;
  cta?: {
    text: string;
    url: string;
    style?: CTAStyle;
  };
}

export interface ManifestHeadlineSection extends ManifestSection {
  type: 'headline';
  text: string;
  alignment?: Alignment;
  level?: 'h1' | 'h2' | 'h3';
}

export interface ManifestBodySection extends ManifestSection {
  type: 'body';
  text: string;
  alignment?: Alignment;
}

export interface ManifestFeatureGridSection extends ManifestSection {
  type: 'feature-grid';
  columns: number;
  items: Array<{
    title: string;
    description: string;
    imagePrompt?: string;
  }>;
}

export interface ManifestDividerSection extends ManifestSection {
  type: 'divider';
  style?: 'line' | 'spacer' | 'dotted';
}

export interface ManifestCTASection extends ManifestSection {
  type: 'cta';
  text: string;
  url: string;
  style?: CTAStyle;
  alignment?: Alignment;
  secondary?: { text: string; url: string };
}

export interface ManifestImageTextSection extends ManifestSection {
  type: 'image-text';
  imagePosition?: 'left' | 'right';
  headline?: string;
  text?: string;
  imagePrompt?: string;
  cta?: {
    text: string;
    url: string;
    style?: CTAStyle;
  };
}

export interface ManifestSocialSection extends ManifestSection {
  type: 'social';
  platforms?: Array<{
    name: string;
    url: string;
  }>;
}

export interface ManifestFooterSection extends ManifestSection {
  type: 'footer';
  companyName?: string;
  unsubscribeUrl?: string;
  address?: string;
}

export interface ManifestTestimonialSection extends ManifestSection {
  type: 'testimonial';
  quote: string;
  author?: string;
  role?: string;
  company?: string;
  avatar?: string;
  alignment?: Alignment;
  attribution?: string;
}

export interface DesignManifest {
  colorTheme: ColorTheme;
  layout: LayoutPreset;
  visualStyle?: VisualStyle;
  layoutDensity?: LayoutDensity;
  showBrandHeader?: boolean;
  easterEgg?: 'paper_plane' | 'none';
  meta: {
    preheader: string;
    subject?: string;
    [key: string]: unknown;
  };
  sections: ManifestSection[];
}

/**
 * Validate and normalize a raw object as a v1 DesignManifest.
 * Returns the manifest if valid, null otherwise.
 */
export function validateManifest(input: unknown): DesignManifest | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;

  const raw = input as Record<string, unknown>;

  if (!raw.colorTheme || typeof raw.colorTheme !== 'string') return null;
  if (!raw.layout || typeof raw.layout !== 'string') return null;
  if (!raw.sections || !Array.isArray(raw.sections)) return null;
  if (raw.sections.length === 0) return null;

  const meta =
    raw.meta && typeof raw.meta === 'object' && !Array.isArray(raw.meta)
      ? (raw.meta as Record<string, unknown>)
      : { preheader: '' };

  return {
    colorTheme: raw.colorTheme as ColorTheme,
    layout: raw.layout as LayoutPreset,
    visualStyle: typeof raw.visualStyle === 'string' ? (raw.visualStyle as VisualStyle) : undefined,
    layoutDensity:
      typeof raw.layoutDensity === 'string' ? (raw.layoutDensity as LayoutDensity) : undefined,
    showBrandHeader: typeof raw.showBrandHeader === 'boolean' ? raw.showBrandHeader : undefined,
    easterEgg: typeof raw.easterEgg === 'string' ? (raw.easterEgg as DesignManifest['easterEgg']) : undefined,
    meta: {
      ...meta,
      preheader: typeof meta.preheader === 'string' ? (meta.preheader as string) : '',
    },
    sections: raw.sections as ManifestSection[],
  };
}
