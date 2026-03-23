import type { DesignManifest } from '../../lib/types/manifestTypes';

/**
 * Returns true when the manifest has section or product_grid item image prompts that the API can resolve.
 */
export function manifestHasResolvableImagePrompts(manifest: DesignManifest): boolean {
  return manifest.sections.some((s) => {
    const c = s.content as Record<string, unknown>;
    const hasUrl = typeof c.imageUrl === 'string' && String(c.imageUrl).trim();
    const hasPrompt = typeof c.imagePrompt === 'string' && String(c.imagePrompt).trim();
    const heroArt = s.type === 'hero' && manifest.artDirection?.imageStyle;
    if (!hasUrl && (hasPrompt || heroArt)) return true;
    if (s.type === 'product_grid' && Array.isArray(c.items)) {
      return (c.items as Record<string, unknown>[]).some(
        (item) => !item.imageUrl && typeof item.imagePrompt === 'string' && String(item.imagePrompt).trim(),
      );
    }
    return false;
  });
}

/**
 * Merges resolve-email-images API results into a copy of the manifest.
 */
export function mergeResolvedEmailImagesIntoManifest(
  manifest: DesignManifest,
  resolvedImages: Record<number, string> | undefined,
  resolvedItemImages: Record<string, string> | undefined,
): DesignManifest {
  let m = manifest;
  if (resolvedImages && Object.keys(resolvedImages).length > 0) {
    m = {
      ...m,
      sections: m.sections.map((s) => {
        const url = resolvedImages[s.order];
        if (!url) return s;
        const prev = s.content as Record<string, unknown>;
        return { ...s, content: { ...prev, imageUrl: url } };
      }),
    };
  }
  if (resolvedItemImages && Object.keys(resolvedItemImages).length > 0) {
    m = {
      ...m,
      sections: m.sections.map((s) => {
        if (s.type !== 'product_grid') return s;
        const prev = s.content as Record<string, unknown>;
        const items = Array.isArray(prev.items) ? [...(prev.items as Record<string, unknown>[])] : [];
        let changed = false;
        for (let idx = 0; idx < items.length; idx++) {
          const key = `${s.order}:${idx}`;
          const url = resolvedItemImages[key];
          if (url) {
            items[idx] = { ...items[idx], imageUrl: url };
            changed = true;
          }
        }
        if (!changed) return s;
        return { ...s, content: { ...prev, items } };
      }),
    };
  }
  return m;
}
