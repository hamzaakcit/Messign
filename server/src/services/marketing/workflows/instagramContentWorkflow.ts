/**
 * Instagram image regeneration — used by POST /api/marketing/content/:id/regenerate-image
 */
import type { CallerContext } from '../../../dal/types.js';
import * as contentDal from '../../../dal/marketing/content.js';
import type { ImageGenerationInput, ImageGenerationResult, AspectRatio } from '../../../dal/marketing/instagramTypes.js';
import { ASPECT_RATIO_RESOLUTIONS } from '../../../dal/marketing/instagramTypes.js';
import { generateImage, enhanceImagePrompt, editMarketingPhotoWithKontext } from '../publishing/imageService.js';
import {
  buildInstagramFeedT2iPrompt,
  isInstagramImageFalOnlyFromEnv,
} from './instagramFeedT2i.js';

export async function regenerateImageForContent(
  ctx: CallerContext,
  input: {
    content_id: string;
    new_prompt: string;
    style_preset?: ImageGenerationInput['style_preset'];
    aspect_ratio?: AspectRatio;
  },
): Promise<ImageGenerationResult> {
  const orgId = ctx.organizationId;
  if (!orgId) {
    return {
      success: false,
      image_url: null,
      storage_key: null,
      metadata: {
        model: 'n/a',
        resolution: '1024x1024',
        retries: 0,
        generated_at: new Date().toISOString(),
        duration_ms: 0,
      },
      error: 'Organization context required',
    };
  }

  const resolution = input.aspect_ratio
    ? (ASPECT_RATIO_RESOLUTIONS[input.aspect_ratio] as ImageGenerationInput['resolution'])
    : '1080x1080';

  const row = await contentDal.getContentById(ctx, input.content_id);
  const refUrl = row?.reference_image_url?.trim() ?? null;
  const isInstagram = (row?.channel ?? '').toLowerCase() === 'instagram';
  const stylePreset = input.style_preset ?? 'photoreal';
  const trimmedPrompt = input.new_prompt.trim();

  const t2iInstagram =
    isInstagram && !refUrl
      ? buildInstagramFeedT2iPrompt(trimmedPrompt, stylePreset, {
          userBrief: row?.user_brief?.trim() ?? null,
        })
      : null;

  const promptForT2I =
    t2iInstagram != null
      ? t2iInstagram.prompt
      : enhanceImagePrompt(trimmedPrompt, stylePreset, undefined);

  const result = refUrl
    ? await editMarketingPhotoWithKontext({
        org_id: orgId,
        content_id: input.content_id,
        reference_image_url: refUrl,
        edit_instruction: trimmedPrompt,
        style_preset: stylePreset,
      })
    : await generateImage({
        org_id: orgId,
        content_id: input.content_id,
        prompt: promptForT2I,
        resolution: resolution ?? '1024x1024',
        style_preset: stylePreset,
        aspect_ratio: input.aspect_ratio,
        ...(isInstagram && !refUrl && t2iInstagram
          ? {
              instagram_feed: true as const,
              instagram_fal_only: isInstagramImageFalOnlyFromEnv(),
              instagram_direct_prompt: t2iInstagram.instagram_direct_prompt,
            }
          : {}),
      });

  if (result.success && result.image_url) {
    const existingCarousel = row?.carousel_images;
    const patch: Parameters<typeof contentDal.updateContent>[2] = {
      image_prompt: input.new_prompt,
      image_url: result.image_url,
      visual_description: input.new_prompt,
      image_generation_metadata: result.metadata,
    };
    if (Array.isArray(existingCarousel) && existingCarousel.length > 0) {
      patch.carousel_images = existingCarousel.map((slide, i) =>
        i === 0
          ? {
              ...slide,
              image_url: result.image_url!,
              storage_key: result.storage_key ?? slide.storage_key ?? null,
            }
          : slide,
      );
    }
    await contentDal.updateContent(ctx, input.content_id, patch);
  }

  return result;
}
