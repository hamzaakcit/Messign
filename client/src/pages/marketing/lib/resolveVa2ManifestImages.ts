// ─────────────────────────────────────────────────────────────────────────────
// Resolve image URLs for VA2 DesignManifest sections (parallel to legacy asset resolver)
// ─────────────────────────────────────────────────────────────────────────────

import type { DesignManifest as Va2DesignManifest } from './types/manifestTypes';
import type { ResolvedAssets } from './designAssembler';
import { enhanceImagePrompt, VA2_IMAGE_GEN_DIMENSIONS } from './designTokens';
import type { DesignManifest as LegacyPick } from './types/designManifest.types';

type Va2ForPrompt = Pick<LegacyPick, 'visualStyle' | 'colorTheme'>;

export type Va2ImageResolver = (req: {
  prompt: string;
  width: number;
  height: number;
  style?: string;
}) => Promise<string | null>;

export interface Va2ImageResolveConfig {
  generateImages?: boolean;
  imageTimeoutMs?: number;
}

function promptContextFromVa2(manifest: Va2DesignManifest): Va2ForPrompt {
  const art = manifest.artDirection;
  return {
    visualStyle: (typeof art?.imageStyle === 'string' ? art.imageStyle : undefined) as LegacyPick['visualStyle'],
    colorTheme: 'messign_blue',
  };
}

/**
 * Walk VA2 sections and resolve `imagePrompt` fields via the async resolver; returns merged asset map.
 *
 * **Order:** `featureUrls` follow manifest section order: each section’s `value_prop` / `product_grid`
 * item prompts (in item order), then standalone `image` sections — must stay aligned with
 * `POST /content/:id/resolve-email-images` (same section walk + item keys `order:idx`).
 * After enrichment ({@link enrichManifestForVisualDensity}), slot counts should match the server chunker.
 */
export async function resolveAssetsForVa2Manifest(
  manifest: Va2DesignManifest,
  resolver: Va2ImageResolver,
  config: Va2ImageResolveConfig,
): Promise<ResolvedAssets> {
  const assets: ResolvedAssets = {};
  if (!config.generateImages) return assets;

  const ctx = promptContextFromVa2(manifest);
  const promises: Array<{
    key: 'hero' | 'feature' | 'imageText';
    index?: number;
    promise: Promise<string | null>;
  }> = [];

  let imageTextSectionIndex = 0;

  for (const section of manifest.sections) {
    const content = section.content as Record<string, unknown>;
    switch (section.type) {
      case 'hero': {
        const prompt = typeof content.imagePrompt === 'string' ? content.imagePrompt : '';
        if (prompt) {
          const { width, height } = VA2_IMAGE_GEN_DIMENSIONS.hero;
          promises.push({
            key: 'hero',
            promise: resolver({
              prompt: enhanceImagePrompt(prompt, ctx),
              width,
              height,
              style: typeof content.imageStyle === 'string' ? content.imageStyle : undefined,
            }),
          });
        }
        break;
      }
      case 'value_prop': {
        const items = (content.items as Array<Record<string, unknown>>) ?? [];
        items.forEach((item) => {
          const p = typeof item.imagePrompt === 'string' ? item.imagePrompt : '';
          if (p) {
            promises.push({
              key: 'feature',
              promise: resolver({
                prompt: enhanceImagePrompt(p, ctx),
                width: VA2_IMAGE_GEN_DIMENSIONS.valuePropIcon.width,
                height: VA2_IMAGE_GEN_DIMENSIONS.valuePropIcon.height,
                style: 'flat_illustration',
              }),
            });
          }
        });
        break;
      }
      case 'product_grid': {
        const items = (content.items as Array<Record<string, unknown>>) ?? [];
        items.forEach((item) => {
          const p = typeof item.imagePrompt === 'string' ? item.imagePrompt : '';
          if (p) {
            const { width, height } = VA2_IMAGE_GEN_DIMENSIONS.productCard;
            promises.push({
              key: 'feature',
              promise: resolver({
                prompt: enhanceImagePrompt(p, ctx),
                width,
                height,
                style: 'product_photo',
              }),
            });
          }
        });
        break;
      }
      case 'image_text': {
        const p = typeof content.imagePrompt === 'string' ? content.imagePrompt : '';
        if (p) {
          const idx = imageTextSectionIndex;
          const it = VA2_IMAGE_GEN_DIMENSIONS.imageText;
          promises.push({
            key: 'imageText',
            index: idx,
            promise: resolver({
              prompt: enhanceImagePrompt(p, ctx),
              width: it.width,
              height: it.height,
            }),
          });
        }
        imageTextSectionIndex += 1;
        break;
      }
      case 'image': {
        const p = typeof content.imagePrompt === 'string' ? content.imagePrompt : '';
        if (p) {
          const st = VA2_IMAGE_GEN_DIMENSIONS.standaloneFull;
          promises.push({
            key: 'feature',
            promise: resolver({
              prompt: enhanceImagePrompt(p, ctx),
              width: st.width,
              height: st.height,
            }),
          });
        }
        break;
      }
      default:
        break;
    }
  }

  const timeout = config.imageTimeoutMs ?? 15_000;
  const results = await Promise.allSettled(
    promises.map(({ promise }) =>
      Promise.race([
        promise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), timeout)),
      ]),
    ),
  );

  const featureUrls: string[] = [];
  const imageTextUrls: Record<number, string> = {};

  results.forEach((result, i) => {
    const url = result.status === 'fulfilled' ? result.value : null;
    if (!url) return;
    const { key, index } = promises[i];
    if (key === 'hero') {
      assets.heroImageUrl = url;
    } else if (key === 'feature') {
      featureUrls.push(url);
    } else if (key === 'imageText' && index !== undefined) {
      imageTextUrls[index] = url;
    }
  });

  if (featureUrls.length > 0) assets.featureImageUrls = featureUrls;
  if (Object.keys(imageTextUrls).length > 0) assets.imageTextUrls = imageTextUrls;

  return assets;
}

/**
 * Inject resolved asset URLs back into a VA2 manifest (same ordering as {@link resolveAssetsForVa2Manifest}).
 */
export function mergeResolvedAssetsIntoVa2Manifest(
  manifest: Va2DesignManifest,
  assets: ResolvedAssets,
): Va2DesignManifest {
  const m = structuredClone(manifest);
  let featureIdx = 0;
  let imageTextIdx = 0;

  for (const section of m.sections) {
    const content = section.content as Record<string, unknown>;
    if (section.type === 'hero' && assets.heroImageUrl) {
      content.imageUrl = assets.heroImageUrl;
    }
    if (section.type === 'value_prop') {
      const items = (content.items as Array<Record<string, unknown>>) ?? [];
      for (const item of items) {
        if (typeof item.imagePrompt === 'string' && item.imagePrompt) {
          const url = assets.featureImageUrls?.[featureIdx];
          if (url) item.imageUrl = url;
          featureIdx += 1;
        }
      }
    }
    if (section.type === 'product_grid') {
      const items = (content.items as Array<Record<string, unknown>>) ?? [];
      for (const item of items) {
        if (typeof item.imagePrompt === 'string' && item.imagePrompt) {
          const url = assets.featureImageUrls?.[featureIdx];
          if (url) item.imageUrl = url;
          featureIdx += 1;
        }
      }
    }
    if (section.type === 'image_text') {
      const url = assets.imageTextUrls?.[imageTextIdx];
      if (url) content.imageUrl = url;
      imageTextIdx += 1;
    }
    if (section.type === 'image' && typeof content.imagePrompt === 'string' && content.imagePrompt) {
      const url = assets.featureImageUrls?.[featureIdx];
      if (url) content.imageUrl = url;
      featureIdx += 1;
    }
  }

  return m;
}
