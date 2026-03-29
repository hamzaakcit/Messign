/**
 * Shared Instagram feed text-to-image prompt building and env flags.
 * Used by `instagramImagePipeline` and `instagramContentWorkflow` (regenerate) so behavior cannot drift.
 */

import type { StylePreset } from '../../../dal/marketing/instagramTypes.js';
import {
  buildDirectInstagramFalPrompt,
  enhanceImagePrompt,
} from '../publishing/imageService.js';

/** Optional: original user ask — aligns image gen when the draft is generic or on regenerate. */
export interface InstagramPromptIntentContext {
  title?: string | null;
  userBrief?: string | null;
}

/**
 * Default on: set INSTAGRAM_IMAGE_FAL_ONLY=0 to allow Gemini/OpenAI/LiteLLM fallbacks for Instagram feed.
 */
export function isInstagramImageFalOnlyFromEnv(): boolean {
  const v = process.env.INSTAGRAM_IMAGE_FAL_ONLY?.trim().toLowerCase();
  if (v === '0' || v === 'false') return false;
  return true;
}

/**
 * Default on: set INSTAGRAM_FAL_DIRECT_PROMPT=0 to use full `enhanceImagePrompt` for Instagram T2I.
 */
export function isInstagramFalDirectPromptFromEnv(): boolean {
  const v = process.env.INSTAGRAM_FAL_DIRECT_PROMPT?.trim().toLowerCase();
  if (v === '0' || v === 'false') return false;
  return true;
}

/**
 * Instagram feed T2I: short direct Flux prompt vs. legacy enhanced prompt.
 */
export function buildInstagramFeedT2iPrompt(
  imagePrompt: string,
  stylePreset: StylePreset,
  intentContext?: InstagramPromptIntentContext,
): { prompt: string; instagram_direct_prompt: boolean } {
  if (isInstagramFalDirectPromptFromEnv()) {
    return {
      prompt: buildDirectInstagramFalPrompt({
        userBrief: intentContext?.userBrief ?? null,
        imagePrompt,
      }),
      instagram_direct_prompt: true,
    };
  }
  return {
    prompt: enhanceImagePrompt(imagePrompt, stylePreset, {
      channel: 'instagram',
      sectionType: 'standalone',
    }),
    instagram_direct_prompt: false,
  };
}
