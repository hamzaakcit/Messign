// ─────────────────────────────────────────────────────────────────────────────
// Manifest Types — Visual Architect v2.0
// ─────────────────────────────────────────────────────────────────────────────

import type { ThemeName } from './designTokenTypes';

export type SectionType =
  | 'hero'
  | 'value_prop'
  | 'testimonial'
  | 'social_proof'
  | 'cta'
  | 'divider'
  | 'footer'
  | 'text_block'
  | 'image'
  | 'image_text'
  | 'preheader'
  | 'product_grid'
  | 'stats_counter'
  | 'logo_bar';

export type ImageStylePreset =
  | 'cinematic-hero'
  | 'editorial-lifestyle'
  | 'clean-product'
  | 'abstract-pattern'
  | 'portrait-headshot'
  | 'isometric-icon';

export type ImageMood = 'warm' | 'cool' | 'dramatic' | 'minimal' | 'playful';

export interface SectionArtDirection {
  imageStyle?: ImageStylePreset;
  imageMood?: ImageMood;
  imageColorHint?: string;
}

export interface ManifestSection {
  type: SectionType;
  order: number;
  content: Record<string, unknown>;
  variant?: string;
  spacing?: string;
  artDirection?: SectionArtDirection;
}

export interface HeroContent {
  headline: string;
  subheadline?: string;
  ctaText?: string;
  ctaUrl?: string;
  imageUrl?: string;
  imagePrompt?: string;
  alignment?: 'left' | 'center' | 'right';
  [key: string]: unknown;
}

export interface ValuePropItem {
  icon?: string;
  heading: string;
  description: string;
  [key: string]: unknown;
}

export interface ValuePropContent {
  sectionTitle?: string;
  columns: number;
  items: ValuePropItem[];
  [key: string]: unknown;
}

export interface CTAContent {
  headline?: string;
  description?: string;
  buttonText: string;
  buttonUrl: string;
  variant?: 'pill' | 'ghost' | 'fullWidth' | 'gradient';
  urgencyText?: string;
  microCopy?: string;
  [key: string]: unknown;
}

export interface TestimonialContent {
  quote: string;
  authorName: string;
  authorRole?: string;
  authorCompany?: string;
  rating?: number;
  [key: string]: unknown;
}

export interface SocialProofItem {
  label: string;
  value?: string;
  logoUrl?: string;
  [key: string]: unknown;
}

export interface SocialProofContent {
  style: 'metrics' | 'logos' | 'mixed';
  items: SocialProofItem[];
  [key: string]: unknown;
}

export interface TextBlockContent {
  body: string;
  alignment?: 'left' | 'center' | 'right';
  [key: string]: unknown;
}

export interface ImageContent {
  imageUrl?: string;
  imagePrompt?: string;
  altText?: string;
  caption?: string;
  linkUrl?: string;
  width?: 'full' | 'medium' | 'small';
  [key: string]: unknown;
}

export interface ImageTextContent {
  headline?: string;
  body: string;
  imageUrl?: string;
  imagePrompt?: string;
  altText?: string;
  layout?: 'image_left' | 'image_right' | 'image_top';
  ctaText?: string;
  ctaUrl?: string;
  [key: string]: unknown;
}

export interface ProductItem {
  name: string;
  description?: string;
  price?: string;
  originalPrice?: string;
  imageUrl?: string;
  imagePrompt?: string;
  linkUrl?: string;
  badge?: string;
  [key: string]: unknown;
}

export interface ProductGridContent {
  sectionTitle?: string;
  columns: 2 | 3;
  items: ProductItem[];
  [key: string]: unknown;
}

export interface FooterContent {
  companyName: string;
  address: string;
  links?: Array<{ text: string; url: string }>;
  socialLinks?: Array<{ platform: string; url: string }>;
  unsubscribeText?: string;
  [key: string]: unknown;
}

// ── New v2 section content types ──────────────────────────────────────────

export interface StatsCounterItem {
  value: string;
  label: string;
}

export interface StatsCounterContent {
  items: StatsCounterItem[];
  style?: 'horizontal' | 'stacked';
  [key: string]: unknown;
}

export interface LogoBarItem {
  name: string;
  logoUrl?: string;
  altText?: string;
  url?: string;
}

export interface LogoBarContent {
  headline?: string;
  items: LogoBarItem[];
  grayscale?: boolean;
  [key: string]: unknown;
}

export interface ManifestValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ManifestValidationResult {
  valid: boolean;
  errors: ManifestValidationError[];
  warnings: ManifestValidationError[];
  normalizedManifest?: DesignManifest;
}

export interface DesignManifest {
  version: string;
  theme: ThemeName;
  subject: string;
  preheader: string;
  sections: ManifestSection[];
  metadata?: {
    channel?: string;
    tone?: string;
    audience?: string;
    campaign_id?: string;
    brand_profile_id?: string;
    ab_variant?: 'A' | 'B';
  };
  artDirection?: {
    imageStyle?: string;
    colorTemperature?: 'warm' | 'cool' | 'neutral';
    overallMood?: string;
    visualStyle?: string;
    [key: string]: unknown;
  };
  easterEgg?: 'paper_plane' | 'none';
}
