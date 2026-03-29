import type { DesignManifest } from './types/manifestTypes';

/**
 * **Image slot contract (VA2)** — keep in sync with:
 * - {@link enrichManifestForVisualDensity} / {@link resolveVa2ManifestImages} (which sections gain URLs)
 * - Server `resolve-email-images` (`mapEmailSectionToImageGenContext`, product/value item keys)
 *
 * Rules:
 * - **Hero**: one slot if `imagePrompt` / `imageUrl` / meaningful `artDirection.imageStyle`.
 * - **image / image_text**: one slot per section when prompt or URL present.
 * - **value_prop**: up to one slot per item (prompt, URL, or heading-only heuristic for stock).
 * - **product_grid**: up to one slot per item (prompt, URL, or name-only heuristic).
 * - Footer / text / CTA rows without image prompts do not add slots.
 *
 * `countImageSlotsInManifest` implements this contract for layout richness hints (aim for ≥3, cap ~12).
 * Enrichment uses `metadata.target_image_slots` (3–12; default 6 when omitted) from the strategist or plain-text synthesis.
 */
export function countImageSlotsInManifest(manifest: DesignManifest): number {
  let n = 0;
  const art = manifest.artDirection;

  for (const s of manifest.sections) {
    const c = s.content as Record<string, unknown>;

    if (s.type === 'hero') {
      const hasPrompt = typeof c.imagePrompt === 'string' && c.imagePrompt.trim();
      const hasUrl = typeof c.imageUrl === 'string' && String(c.imageUrl).trim();
      if (hasPrompt || hasUrl) n += 1;
      else if (art?.imageStyle && String(art.imageStyle).trim().length >= 5) n += 1;
    } else if (s.type === 'image_text' || s.type === 'image') {
      const hasPrompt = typeof c.imagePrompt === 'string' && c.imagePrompt.trim();
      const hasUrl = typeof c.imageUrl === 'string' && String(c.imageUrl).trim();
      if (hasPrompt || hasUrl) n += 1;
    } else if (s.type === 'value_prop' && Array.isArray(c.items)) {
      for (const item of c.items as Record<string, unknown>[]) {
        const p = typeof item.imagePrompt === 'string' && item.imagePrompt.trim();
        const u = typeof item.imageUrl === 'string' && String(item.imageUrl).trim();
        const h = typeof item.heading === 'string' && item.heading.trim();
        if (p || u) n += 1;
        else if (h) n += 1;
      }
    } else if (s.type === 'product_grid' && Array.isArray(c.items)) {
      for (const item of c.items as Record<string, unknown>[]) {
        const p = typeof item.imagePrompt === 'string' && item.imagePrompt.trim();
        const u = typeof item.imageUrl === 'string' && String(item.imageUrl).trim();
        const name = typeof item.name === 'string' && item.name.trim();
        if (p || u) n += 1;
        else if (name) n += 1;
      }
    }
  }

  return n;
}
