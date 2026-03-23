/**
 * Instagram image regeneration — used by POST /api/marketing/content/:id/regenerate-image
 */
import type { CallerContext } from '../../../dal/types.js';
import * as contentDal from '../../../dal/marketing/content.js';
import type { ImageGenerationInput, ImageGenerationResult, AspectRatio } from '../../../dal/marketing/instagramTypes.js';
import { ASPECT_RATIO_RESOLUTIONS } from '../../../dal/marketing/instagramTypes.js';
import { generateImage, enhanceImagePrompt } from '../publishing/imageService.js';

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
    : '1024x1024';

  const enhanced = enhanceImagePrompt(input.new_prompt, input.style_preset ?? 'modern_noir');
  const result = await generateImage({
    org_id: orgId,
    content_id: input.content_id,
    prompt: enhanced,
    resolution: resolution ?? '1024x1024',
    style_preset: input.style_preset ?? 'modern_noir',
    aspect_ratio: input.aspect_ratio,
  });

  if (result.success && result.image_url) {
    await contentDal.updateContent(ctx, input.content_id, {
      image_prompt: input.new_prompt,
      image_url: result.image_url,
      visual_description: input.new_prompt,
      image_generation_metadata: result.metadata,
    });
  }

  return result;
}
