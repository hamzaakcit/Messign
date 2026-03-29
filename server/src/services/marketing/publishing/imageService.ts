// Re-export barrel — all logic moved to ./imageService/ for single-responsibility modules.
// This file kept for backward compatibility; all existing imports continue to work.
export {
  generateImage,
  buildDevPlaceholderImageUrl,
  extractDalleStylePromptFromGeminiText,
  shouldOpenAiFastPathAfterGeminiNoImage,
} from './imageService/generateImage.js';

export type { ImageGenContext, MarketingImageSystemOptions } from './imageService/promptBuilder.js';
export {
  buildChannelCompositionHint,
  buildMarketingImageSystemText,
  buildDirectInstagramFalPrompt,
  enhanceImagePrompt,
} from './imageService/promptBuilder.js';

export {
  validateImageGenerationInput,
  validateRasterImageBuffer,
  ALLOWED_RESOLUTIONS,
  ALLOWED_STYLE_PRESETS,
  MAX_IMAGE_BYTES,
} from './imageService/validation.js';

export { resolveStockImageUrl, pickNonHumanPlaceholderUrl } from './imageService/stockImages.js';

export {
  emailCampaignCopySuggestsTechnicalPlatformImagery,
  emailImagePromptExplicitlyRequestsPeople,
} from './imageService/emailImagePromptSubject.js';

export {
  buildCampaignImageContextPrefix,
  buildCampaignImageContextForRasterModels,
  buildCampaignTopicBlobForRasterModels,
  extractTopicKeywordsForRasterContext,
  applyCampaignPrefixToPrompt,
} from './imageService/campaignImageContext.js';

export { buildValuePropItemImagePrompt } from './imageService/valuePropImagePrompt.js';

export {
  buildStorageKey,
  buildReferenceUploadStorageKey,
  buildLucyReferenceUploadStorageKey,
  uploadToStorage,
} from './imageService/storage.js';

export type { PhotoEditPromptOptions } from './imageService/photoEditPrompt.js';
export { buildAdditivePhotoEditPrompt } from './imageService/photoEditPrompt.js';
export { editMarketingPhotoWithKontext } from './imageService/editMarketingPhoto.js';
export {
  mapDimensionsToFalKontextAspectRatio,
  FAL_KONTEXT_ASPECT_RATIOS,
} from './imageService/falKontextAspectRatio.js';
export type { FalKontextAspectRatio } from './imageService/falKontextAspectRatio.js';
export type { PreparedReferenceForFal } from './imageService/falReferenceImage.js';
export {
  buildKontextFalSubscribeInput,
  callFalKontextImageEdit,
  resolveFalImageEditModelId,
  isRetryableFalKontextError,
  resolveKontextOutputFormat,
  resolveKontextEnhancePrompt,
} from './imageService/falKontextEdit.js';
export type { KontextFalSubscribeInputOptions, CallFalKontextImageEditOptions } from './imageService/falKontextEdit.js';
export { callFalFluxImageToImageEdit, resolveFluxI2iEditModelId } from './imageService/falFluxI2iEdit.js';

import { generateImage } from './imageService/generateImage.js';
import { enhanceImagePrompt } from './imageService/promptBuilder.js';
import { resolveStockImageUrl } from './imageService/stockImages.js';
import { validateImageGenerationInput, validateRasterImageBuffer } from './imageService/validation.js';

export default {
  generateImage,
  enhanceImagePrompt,
  resolveStockImageUrl,
  validateImageGenerationInput,
  validateRasterImageBuffer,
};
