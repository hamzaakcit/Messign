/**
 * Image generation can stay in the product without calling a provider.
 * IMAGE_GEN_MODE=live keeps the provider path. A request or the image_gen:mock tag still mocks.
 */

export const IMAGE_GEN_MOCK_TAG = 'image_gen:mock';

/** True when this call should return a placeholder and skip Fal, Gemini, and OpenAI. */
export function imageGenerationIsMock(requestMock?: boolean): boolean {
  if (requestMock === true) return true;
  const mode = process.env.IMAGE_GEN_MODE?.trim().toLowerCase();
  if (mode === 'live') return false;
  return mode === 'mock';
}

/** The draft asked for a placeholder when it was created. */
export function tagsRequestMockImage(tags: readonly string[] | null | undefined): boolean {
  return (tags ?? []).includes(IMAGE_GEN_MOCK_TAG);
}

/**
 * Whether this call should skip Fal / Gemini / OpenAI.
 * An explicit regenerate choice wins over the saved `image_gen:mock` tag.
 */
export function shouldUseMockImage(opts: {
  requestMock?: boolean;
  tags?: readonly string[] | null;
}): boolean {
  if (opts.requestMock === true) return true;
  if (opts.requestMock === false) return false;
  if (tagsRequestMockImage(opts.tags)) return true;
  return imageGenerationIsMock();
}

/** Tags without the mock marker after a live regenerate. */
export function tagsWithoutMockImage(tags: readonly string[] | null | undefined): string[] {
  return (tags ?? []).filter((tag) => tag !== IMAGE_GEN_MOCK_TAG);
}

/** Placeholder URL. No network call. */
export function mockImageUrl(prompt: string): string {
  const custom = process.env.IMAGE_GEN_PLACEHOLDER_URL?.trim();
  if (custom) return custom;
  const slice = (prompt.trim() || 'Instagram').slice(0, 40);
  return `https://placehold.co/1024x1024/1a1a2e/c084fc/png?text=${encodeURIComponent(slice)}`;
}

/** Same-origin photo saved when remote storage cannot be reached. */
export function localMarketingImageUrl(url: string | null | undefined): string | null {
  const value = url?.trim() ?? '';
  if (!value.startsWith('/uploads/')) return null;
  if (value.includes('..') || value.includes('\\') || value.includes('://')) return null;
  return value;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * URL the Instagram preview can load without a third-party image host.
 * A saved local photo wins. Tests keep the placehold.co URL.
 */
export async function resolveMockPreviewUrl(
  contentId: string,
  prompt: string,
  referenceUrl?: string | null,
): Promise<string> {
  const local = localMarketingImageUrl(referenceUrl);
  if (local) return local;
  if (process.env.VITEST) return mockImageUrl(prompt);
  try {
    const { saveLocalMarketingUpload } = await import('./publishing/imageService/storage.js');
    const label = escapeXml((prompt.trim() || 'Instagram').slice(0, 72));
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <rect width="1080" height="1080" fill="#1a1a2e"/>
  <text x="72" y="540" fill="#c084fc" font-family="sans-serif" font-size="36">${label}</text>
</svg>`;
    const safeId = contentId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80) || 'draft';
    return await saveLocalMarketingUpload(Buffer.from(svg), `mock/${safeId}.svg`);
  } catch (err) {
    console.warn('[imageGenMode] local preview was not written', err);
    return mockImageUrl(prompt);
  }
}
