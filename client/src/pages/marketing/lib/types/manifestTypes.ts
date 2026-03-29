// ─────────────────────────────────────────────────────────────────────────────
// Manifest Types — Visual Architect v2.0
// ─────────────────────────────────────────────────────────────────────────────

import type { ThemeName, SpacingKey } from './designTokenTypes';
import type { LayoutDensity } from './designManifest.types';

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
  | 'product_grid';

export interface ManifestSection {
  type: SectionType;
  order: number;
  content: Record<string, unknown>;
  variant?: string;
  /** Vertical rhythm between sections; object form is merged by the assembler. */
  spacing?: string | { paddingTop?: SpacingKey; paddingBottom?: SpacingKey };
}

export interface HeroContent {
  headline: string;
  subheadline?: string;
  ctaText?: string;
  ctaUrl?: string;
  imageUrl?: string;
  imagePrompt?: string;
  /** Screen-reader description of the hero image (not the headline). */
  altText?: string;
  alignment?: 'left' | 'center' | 'right';
  /** Row background image position (CSS), e.g. \`center top\` for faces/logos, \`center center\` default. */
  imagePosition?: string;
  /** Single editorial letter behind headline (low-contrast watermark). */
  decorativeInitial?: string;
  /** Watermark opacity 0.03–0.12; default 0.06 when \`decorativeInitial\` is set. */
  watermarkOpacity?: number;
  /**
   * `editorial_tall` — taller minimum frame for photo heroes (magazine-style); token-safe overlays only.
   * `split` — two-column hero: copy + image (requires `imageUrl` after resolve).
   * Omit or `standard` for default ~300px-class framing.
   */
  heroLayout?: 'standard' | 'editorial_tall' | 'split';
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
  variant?: 'pill' | 'ghost' | 'fullWidth';
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
  /** When true, body sits in a framed surface column (border + radius). */
  insetCard?: boolean;
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
  /**
   * Vertical typography and section rhythm (`airy` | `normal` | `compact`).
   * Distinct from `metadata.visual_density` (image slot enrichment).
   */
  layoutDensity?: LayoutDensity;
  sections: ManifestSection[];
  metadata?: {
    channel?: string;
    tone?: string;
    audience?: string;
    campaign_id?: string;
    brand_profile_id?: string;
    ab_variant?: 'A' | 'B';
    /** How this manifest entered the VA2 pipeline (telemetry / diagnostics). */
    assembly_source?: 'legacy_flat_bridge' | 'va2_pipeline';
    /** When `minimal`, the client does not auto-insert extra `image_text` sections for visual density. */
    visual_density?: 'minimal' | 'rich';
    /**
     * Desired number of campaign image slots (hero, image_text, image, value_prop, product_grid items).
     * Client enrichment inserts sections until this count is reached (clamped 3–12). Omit to use default 6.
     */
    target_image_slots?: number;
    /** True when the client auto-inserted `image_text` rows to reach minimum campaign image slots. */
    visual_slots_auto_enriched?: boolean;
    /** Last server-side image resolve (POST resolve-email-images) — diagnostics / Phase 2 persistence. */
    email_resolve?: {
      resolveRunId?: string;
      resolvedAt?: string;
      partial?: boolean;
      idempotencyReplayed?: boolean;
      errorCount?: number;
    };
  };
  artDirection?: {
    imageStyle?: string;
    [key: string]: unknown;
  };
  /**
   * Preferred VA2 field: decorative motion overlay in the email builder.
   * `paper_plane_sweep` enables the paper-plane effect; `off` disables.
   */
  motionOverlay?: 'off' | 'paper_plane_sweep';
  /**
   * When `motionOverlay` is `paper_plane_sweep`: `signature` = full sweep (default),
   * `subtle` = shorter weave motion (better for transactional / dense layouts).
   */
  overlayIntensity?: 'signature' | 'subtle';
  /** @deprecated Use `motionOverlay: "paper_plane_sweep"` — still accepted for LLM round-trips */
  easterEgg?: 'paper_plane' | 'none';
}
