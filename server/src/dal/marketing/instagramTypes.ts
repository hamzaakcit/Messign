/** Fields added to marketing_content for image generation */
export interface ImageGenerationFields {
  image_prompt?: string | null;
  image_url?: string | null;
  /** User's real-world photo (HTTPS) — input for Kontext edits; result in image_url. */
  reference_image_url?: string | null;
  /** Shop logo placed on generated stills. The image model does not paint it. */
  brand_logo_url?: string | null;
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
  /** cover, product, detail, proof, close — in that order. */
  role?: CarouselSlideRole;
  /** Sheet claim for this slide. Empty when the sheet has no claim. */
  claim?: string;
}

export const CAROUSEL_SLIDE_ROLES = ['cover', 'product', 'detail', 'proof', 'close'] as const;

export type CarouselSlideRole = (typeof CAROUSEL_SLIDE_ROLES)[number];

export interface ImageVariant {
  id: string;
  image_url: string;
  style_preset: string;
  prompt: string;
  selected?: boolean;
  generated_at: string;
}

export type ImageGenerationBackend =
  | 'fal'
  | 'gemini_direct'
  | 'vertex_gemini'
  | 'aiplatform_global'
  | 'openai'
  | 'litellm';

/** Which connected image engine a still should use. `all` tries each configured engine. */
export type ImageProviderChoice = 'fal' | 'gemini' | 'openai' | 'litellm' | 'all';

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
  /** Which backend produced the image (Fal, Gemini, OpenAI, LiteLLM). */
  image_backend?: ImageGenerationBackend;
  /** Fal queue request id when returned by @fal-ai/client (support / QA correlation). */
  fal_request_id?: string;
  /** Set when output was produced by editing a user reference photo (Kontext or Flux img2img). */
  edit_mode?: 'flux_kontext' | 'flux_image_to_image';
  /** Snapshot of the reference URL used for the edit (for audit/debug). */
  reference_image_url?: string | null;
  /** Fal Kontext `aspect_ratio` sent with the edit request. */
  kontext_aspect_ratio?: string;
  /** Whether Fal `enhance_prompt` was enabled for this Kontext call. */
  kontext_enhance_prompt?: boolean;
  /** Style preset layered into the Kontext prompt (e.g. photoreal). */
  kontext_style_preset?: string;
  /** Prompt string Fal returned for this still. */
  fal_returned_prompt?: string;
  /** Seed Fal returned, when the payload includes one. */
  fal_seed?: number;
  /** Pixel size Fal returned. */
  fal_width?: number;
  fal_height?: number;
  /** True when Fal flagged the still. The image is not attached. */
  fal_nsfw?: boolean;
  /** `enhance_prompt` sent on the request that produced this still. */
  fal_enhance_prompt?: boolean;
  /** Ultra `raw` sent for a shop still. */
  fal_raw?: boolean;
  /** Ultra `aspect_ratio` sent on the request. */
  fal_aspect_ratio?: string;
  /** Ultra `image_prompt_strength` sent with a reference photo. */
  fal_image_prompt_strength?: number;
  /** Attached shop logo placed on the still after generation. */
  brand_mark?: 'attached_logo';
}

export type AspectRatio = '1:1' | '4:5' | '9:16' | '16:9';

/** Native-ish pixel sizes for social (1:1 default 1080 for feed sharpness vs 1024). */
export const ASPECT_RATIO_RESOLUTIONS: Record<AspectRatio, string> = {
  '1:1': '1080x1080',
  '4:5': '1080x1350',
  '9:16': '1080x1920',
  '16:9': '1920x1080',
};

export type StylePreset =
  | 'photoreal'
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
  /**
   * When true, skip Fal (Flux) and use Gemini / Vertex / OpenAI / LiteLLM first.
   * Used for email paper-plane overlays so Vertex/Gemini can win when Fal is configured.
   */
  skip_fal?: boolean;
  /** When true, use FAL_EMAIL_IMAGE_MODEL (if set) and email-oriented Fal negative defaults. */
  email_campaign?: boolean;
  /** B2B/technical topics (e.g. A2P SMS) — stronger anti-UI negative prompt for Fal. */
  technical_platform_topic?: boolean;
  /** Optional per-request negative prompt merged with FAL_NEGATIVE_PROMPT for Fal. */
  fal_negative_prompt?: string;
  /**
   * Instagram feed / social stills: use Fal defaults tuned for people-inclusive, photoreal posts
   * (softer stock-people suppression, optional higher Flux steps / model — see FAL_INSTAGRAM_* env).
   */
  instagram_feed?: boolean;
  /**
   * When true with `instagram_feed`, use only Fal for image bytes — no Gemini, Vertex, OpenAI, or LiteLLM
   * fallbacks (including post-JPEG “dark frame” repair).
   */
  instagram_fal_only?: boolean;
  /**
   * Hint for callers: prompt was built with the minimal direct Instagram path (`buildDirectInstagramFalPrompt`).
   * Generation still uses `prompt`; this flag is for logging and future metadata.
   */
  instagram_direct_prompt?: boolean;
  /**
   * VA2 paper-plane overlay assets: use FAL_OVERLAY_IMAGE_MODEL when set; preserve PNG alpha (no flatten-to-JPEG).
   */
  overlay_paper_plane?: boolean;
  /**
   * Public HTTPS URL of a user-uploaded photo. When set, Kontext-style edit uses this
   * instead of text-to-image (see FAL_IMAGE_EDIT_MODEL).
   */
  reference_image_url?: string | null;
  /** Return a placeholder and do not call an image provider. */
  mock?: boolean;
  /**
   * Engine for this still. Unset keeps the current route (Instagram stays on Fal when that lock is on).
   * `all` tries Fal, then Gemini, then OpenAI, then LiteLLM.
   */
  image_provider?: ImageProviderChoice;
  /** Product the returned Fal prompt must still name. */
  scene_product?: string;
  /** Place the returned Fal prompt must still name. */
  scene_place?: string;
  /** Bookstore or florist still. Ultra sends `raw: true`. */
  shop_still?: boolean;
  /** Ultra reference strength. Omitted keeps the 0.1 default. */
  image_prompt_strength?: number;
  /** Public URL of the shop logo placed on the finished still. */
  brand_logo_url?: string | null;
}
