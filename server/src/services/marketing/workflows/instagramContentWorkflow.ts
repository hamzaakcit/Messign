/**
 * Instagram image regeneration — used by POST /api/marketing/content/:id/regenerate-image
 */
import type { CallerContext } from '../../../dal/types.js';
import * as contentDal from '../../../dal/marketing/content.js';
import type { ImageGenerationInput, ImageGenerationResult, AspectRatio } from '../../../dal/marketing/instagramTypes.js';
import { ASPECT_RATIO_RESOLUTIONS } from '../../../dal/marketing/instagramTypes.js';
import { generateImage, enhanceImagePrompt, editMarketingPhotoWithKontext } from '../publishing/imageService.js';
import { resolveStillLook } from '../publishing/imageService/promptBuilder.js';
import { checkFeedStill, feedFrameAspect, feedRegenScene, formatFeedPackageErrors } from '../feedPackage.js';
import { parseOfferSheet } from '../offerSheet.js';
import {
  isInstagramImageFalOnlyFromEnv,
} from './instagramFeedT2i.js';
import { applyCarouselSlideEdit, carouselEditAllowed, promptWithProduct, returnedPromptOmitsProduct } from './carouselSlides.js';
import { resolveMockPreviewUrl, shouldUseMockImage, tagsWithoutMockImage } from '../imageGenMode.js';

export async function regenerateImageForContent(
  ctx: CallerContext,
  input: {
    content_id: string;
    new_prompt: string;
    style_preset?: ImageGenerationInput['style_preset'];
    aspect_ratio?: AspectRatio;
    /** Zero-based carousel slide. Defaults to the hero (slide 0). */
    slide_index?: number;
    /** Skip the image provider and store a placeholder. */
    mock?: boolean;
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
  const slideIndex = input.slide_index ?? 0;
  const existingCarousel = row?.carousel_images ?? [];
  const slideError = carouselEditAllowed(existingCarousel.length, slideIndex);
  if (slideError) {
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
      error: slideError,
    };
  }
  const refUrl = row?.reference_image_url?.trim() ?? null;
  const isInstagram = (row?.channel ?? '').toLowerCase() === 'instagram';
  const stylePreset = resolveStillLook(parseOfferSheet(row?.user_brief).sheet.style || input.style_preset);
  const trimmedPrompt = input.new_prompt.trim();

  const scene = isInstagram
    ? feedRegenScene({
        userBrief: row?.user_brief,
        newPrompt: trimmedPrompt,
        stylePreset,
        aspectRatio: input.aspect_ratio,
      })
    : null;

  const promptForT2I = scene != null ? scene.prompt : enhanceImagePrompt(trimmedPrompt, stylePreset, undefined);

  const useMock = shouldUseMockImage({ requestMock: input.mock, tags: row?.tags });
  const result = useMock
    ? {
        success: true,
        image_url: await resolveMockPreviewUrl(input.content_id, trimmedPrompt, refUrl),
        storage_key: null,
        metadata: {
          model: 'mock',
          resolution: resolution ?? '1024x1024',
          retries: 0,
          generated_at: new Date().toISOString(),
          duration_ms: 0,
          dev_placeholder: true,
        },
      }
    : refUrl
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
        aspect_ratio: scene?.aspectRatio ?? input.aspect_ratio,
        ...(isInstagram && !refUrl && scene
          ? {
              instagram_feed: true as const,
              instagram_fal_only: isInstagramImageFalOnlyFromEnv(),
              instagram_direct_prompt: scene.direct,
              scene_product: scene.sceneProduct,
              scene_place: scene.scenePlace,
              shop_still: scene.shopStill,
            }
          : {}),
      });

  if (result.success && result.image_url) {
    const sheet = parseOfferSheet(row?.user_brief).sheet;
    if (
      isInstagram &&
      !refUrl &&
      (sheet.product.trim() || sheet.place.trim()) &&
      (scene?.aspectRatio ?? '1:1') === '1:1'
    ) {
      const stillErrors = checkFeedStill({
        sheet,
        returnedPrompt: result.metadata?.fal_returned_prompt,
        aspectRatio: feedFrameAspect(result.metadata?.fal_aspect_ratio, scene?.aspectRatio ?? '1:1'),
      });
      if (stillErrors.length > 0) {
        return { ...result, success: false, image_url: null, error: formatFeedPackageErrors(stillErrors) };
      }
    }
    const patch: Parameters<typeof contentDal.updateContent>[2] = {
      image_generation_metadata: result.metadata,
    };
    if (!useMock && tagsWithoutMockImage(row?.tags).length !== (row?.tags ?? []).length) {
      patch.tags = tagsWithoutMockImage(row?.tags);
    }
    if (existingCarousel.length > 0) {
      if (returnedPromptOmitsProduct(result.metadata?.fal_returned_prompt, sheet.product)) {
        return {
          ...result,
          success: false,
          image_url: null,
          error: 'product: Returned prompt must name the product.',
        };
      }
      const edited = applyCarouselSlideEdit(existingCarousel, slideIndex, {
        image_url: result.image_url,
        prompt: promptWithProduct(input.new_prompt, sheet.product),
        storage_key: result.storage_key,
        claim: sheet.claim,
      });
      if (!edited.ok) {
        return { ...result, success: false, error: edited.error };
      }
      patch.carousel_images = edited.slides;
      if (edited.updatesHero) {
        patch.image_prompt = input.new_prompt;
        patch.image_url = result.image_url;
        patch.visual_description = input.new_prompt;
      }
    } else {
      patch.image_prompt = input.new_prompt;
      patch.image_url = result.image_url;
      patch.visual_description = input.new_prompt;
    }
    await contentDal.updateContent(ctx, input.content_id, patch);
  }

  return result;
}
