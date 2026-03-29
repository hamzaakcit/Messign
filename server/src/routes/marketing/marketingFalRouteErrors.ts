/**
 * Stable `error_code` values for marketing image routes (Lucy / cockpit toasts).
 */

export type MarketingImageErrorCode =
  | 'FAL_VALIDATION'
  | 'FAL_EMPTY_RESULT'
  | 'FAL_NOT_CONFIGURED'
  | 'IMAGE_GEN_FAILED';

/**
 * Maps thrown messages or failure strings to a stable code for clients (toasts, QA).
 * @param message — Error text from Fal, storage, or route handlers.
 */
export function inferMarketingImageErrorCode(message: string | undefined): MarketingImageErrorCode {
  if (!message) return 'IMAGE_GEN_FAILED';
  if (/422|400|validation|invalid input|unexpected field|rejected the request/i.test(message)) {
    return 'FAL_VALIDATION';
  }
  if (/no image URL|empty|download Fal|failed to download/i.test(message)) {
    return 'FAL_EMPTY_RESULT';
  }
  if (/Set FAL_KEY|FAL_AI_API_KEY|FALAI_API_KEY|not configured|credentials/i.test(message)) {
    return 'FAL_NOT_CONFIGURED';
  }
  return 'IMAGE_GEN_FAILED';
}
