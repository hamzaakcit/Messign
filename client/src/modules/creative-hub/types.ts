/**
 * Creative Hub — client DTOs (keep aligned with server/src/modules/creative/types/imageGen.ts).
 */

export type ImageGenProvider = 'openai' | 'replicate' | 'litellm';

export type ImageGenAspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

export interface CreativeImageGenerateRequest {
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: ImageGenAspectRatio;
  model?: string;
  provider?: ImageGenProvider;
  organizationId?: string;
}

export interface CreativeImageGenerateResult {
  id: string;
  url: string;
  provider: ImageGenProvider;
  model: string;
  createdAt: string;
}
