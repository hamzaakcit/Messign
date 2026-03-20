/** Fields added to marketing_content for image generation */
export interface ImageGenerationFields {
  image_prompt?: string | null;
  image_url?: string | null;
  visual_description?: string | null;
  image_generation_metadata?: ImageGenerationMetadata | null;
}

export interface ImageGenerationMetadata {
  model: string;
  resolution: string;
  seed?: number;
  retries: number;
  generated_at: string;
  duration_ms: number;
  storage_key?: string;
}

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
  resolution?: '1024x1024' | '1080x1080' | '1080x1350';
  style_preset?: 'modern_noir' | 'vibrant_lifestyle' | 'minimal_flat' | 'editorial';
}
