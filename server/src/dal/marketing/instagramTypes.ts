/** Fields added to marketing_content for image generation */
export interface ImageGenerationFields {
  image_prompt?: string | null;
  image_url?: string | null;
  visual_description?: string | null;
  image_generation_metadata?: ImageGenerationMetadata | null;
  /** Carousel: ordered list of generated image URLs (slide 0 = main, slide 1+ = carousel). */
  carousel_images?: CarouselSlideImage[] | null;
  /** A/B: alternative image variants the user can choose from. */
  image_variants?: ImageVariant[] | null;
}

export interface CarouselSlideImage {
  index: number;
  image_url: string;
  prompt: string;
  storage_key?: string | null;
}

export interface ImageVariant {
  id: string;
  image_url: string;
  style_preset: string;
  prompt: string;
  selected?: boolean;
  generated_at: string;
}

export interface ImageGenerationMetadata {
  model: string;
  resolution: string;
  seed?: number;
  retries: number;
  generated_at: string;
  duration_ms: number;
  storage_key?: string;
  /** True when image_url is a dev placeholder (LiteLLM missing/unreachable). */
  dev_placeholder?: boolean;
  /** Aspect ratio used for this generation. */
  aspect_ratio?: AspectRatio;
}

export type AspectRatio = '1:1' | '4:5' | '9:16' | '16:9';

export const ASPECT_RATIO_RESOLUTIONS: Record<AspectRatio, string> = {
  '1:1': '1024x1024',
  '4:5': '1080x1350',
  '9:16': '1080x1920',
  '16:9': '1920x1080',
};

export type StylePreset =
  | 'modern_noir'
  | 'vibrant_lifestyle'
  | 'minimal_flat'
  | 'editorial'
  | 'product_spotlight'
  | 'team_culture'
  | 'data_viz'
  | 'seasonal'
  | 'ugc_style';

export interface ImageGenerationResult {
  success: boolean;
  image_url: string | null;
  storage_key: string | null;
  metadata: ImageGenerationMetadata;
  error?: string;
}

export interface ImageGenerationInput {
  org_id: string;
  content_id: string;
  prompt: string;
  resolution?: '1024x1024' | '1080x1080' | '1080x1350' | '1080x1920' | '1920x1080';
  style_preset?: StylePreset;
  aspect_ratio?: AspectRatio;
}
