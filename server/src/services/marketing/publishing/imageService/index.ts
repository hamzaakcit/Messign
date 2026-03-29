// Barrel re-export — keeps all existing `from '../publishing/imageService.js'` imports working.

export { resolveStockImageUrl, pickNonHumanPlaceholderUrl } from './stockImages.js';

export {
  emailCampaignCopySuggestsTechnicalPlatformImagery,
  emailImagePromptExplicitlyRequestsPeople,
} from './emailImagePromptSubject.js';

export {
  buildCampaignImageContextPrefix,
  buildCampaignImageContextForRasterModels,
  buildCampaignTopicBlobForRasterModels,
  extractTopicKeywordsForRasterContext,
  applyCampaignPrefixToPrompt,
} from './campaignImageContext.js';

export { buildValuePropItemImagePrompt } from './valuePropImagePrompt.js';

export type { ImageGenContext, MarketingImageSystemOptions } from './promptBuilder.js';
export {
  buildChannelCompositionHint,
  buildMarketingImageSystemText,
  buildDirectInstagramFalPrompt,
  enhanceImagePrompt,
} from './promptBuilder.js';

export {
  validateImageGenerationInput,
  validateRasterImageBuffer,
  ALLOWED_RESOLUTIONS,
  ALLOWED_STYLE_PRESETS,
  MAX_IMAGE_BYTES,
} from './validation.js';

export {
  buildStorageKey,
  buildReferenceUploadStorageKey,
  buildLucyReferenceUploadStorageKey,
  uploadToStorage,
} from './storage.js';

export type { PhotoEditPromptOptions } from './photoEditPrompt.js';
export { buildAdditivePhotoEditPrompt } from './photoEditPrompt.js';
export { editMarketingPhotoWithKontext } from './editMarketingPhoto.js';
export {
  mapDimensionsToFalKontextAspectRatio,
  FAL_KONTEXT_ASPECT_RATIOS,
} from './falKontextAspectRatio.js';
export type { FalKontextAspectRatio } from './falKontextAspectRatio.js';
export type { PreparedReferenceForFal } from './falReferenceImage.js';
export {
  buildKontextFalSubscribeInput,
  callFalKontextImageEdit,
  resolveFalImageEditModelId,
  isRetryableFalKontextError,
  resolveKontextOutputFormat,
  resolveKontextEnhancePrompt,
} from './falKontextEdit.js';
export type { KontextFalSubscribeInputOptions, CallFalKontextImageEditOptions } from './falKontextEdit.js';

export {
  generateImage,
  buildDevPlaceholderImageUrl,
  extractDalleStylePromptFromGeminiText,
  shouldOpenAiFastPathAfterGeminiNoImage,
} from './generateImage.js';

import { generateImage } from './generateImage.js';
import { enhanceImagePrompt } from './promptBuilder.js';
import { resolveStockImageUrl } from './stockImages.js';
import { validateImageGenerationInput, validateRasterImageBuffer } from './validation.js';

export default {
  generateImage,
  enhanceImagePrompt,
  resolveStockImageUrl,
  validateImageGenerationInput,
  validateRasterImageBuffer,
};
