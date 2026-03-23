/**
 * Creative Hub — image generation DTOs (contract-first; handlers implement later).
 */

export type ImageGenProvider = 'openai' | 'replicate' | 'litellm';

export type ImageGenAspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

/** Request body for POST /api/creative/images/generate (future). */
export interface CreativeImageGenerateRequest {
  prompt: string;
  /** Negative / avoidance hints for models that support it */
  negativePrompt?: string;
  aspectRatio?: ImageGenAspectRatio;
  /** Override default from env (e.g. flux-schnell) */
  model?: string;
  provider?: ImageGenProvider;
  /** Optional campaign or asset linkage for audit */
  organizationId?: string;
}

export interface CreativeImageGenerateResult {
  id: string;
  url: string;
  provider: ImageGenProvider;
  model: string;
  createdAt: string;
}
