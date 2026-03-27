// Barrel re-export — keeps all existing `from '../publishing/imageService.js'` imports working.

export { resolveStockImageUrl } from './stockImages.js';

export type { ImageGenContext } from './promptBuilder.js';
export {
  buildChannelCompositionHint,
  buildMarketingImageSystemText,
  enhanceImagePrompt,
} from './promptBuilder.js';

export {
  validateImageGenerationInput,
  validateRasterImageBuffer,
  ALLOWED_RESOLUTIONS,
  ALLOWED_STYLE_PRESETS,
  MAX_IMAGE_BYTES,
} from './validation.js';

export { buildStorageKey, uploadToStorage } from './storage.js';

export {
  generateImage,
  buildDevPlaceholderImageUrl,
  extractDalleStylePromptFromGeminiText,
  shouldOpenAiFastPathAfterGeminiNoImage,
} from './generateImage.js';

export {
  hasFalCredentials,
  callFalImageGeneration,
  selectFalConfig,
  contextToFalSection,
} from './falProvider.js';

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
