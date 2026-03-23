// Re-export barrel — all logic moved to ./imageService/ for single-responsibility modules.
// This file kept for backward compatibility; all existing imports continue to work.
export {
  generateImage,
  buildDevPlaceholderImageUrl,
  extractDalleStylePromptFromGeminiText,
  shouldOpenAiFastPathAfterGeminiNoImage,
} from './imageService/generateImage.js';

export type { ImageGenContext } from './imageService/promptBuilder.js';
export {
  buildChannelCompositionHint,
  buildMarketingImageSystemText,
  enhanceImagePrompt,
} from './imageService/promptBuilder.js';

export {
  validateImageGenerationInput,
  validateRasterImageBuffer,
  ALLOWED_RESOLUTIONS,
  ALLOWED_STYLE_PRESETS,
  MAX_IMAGE_BYTES,
} from './imageService/validation.js';

export { resolveStockImageUrl } from './imageService/stockImages.js';

export { buildStorageKey, uploadToStorage } from './imageService/storage.js';

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
