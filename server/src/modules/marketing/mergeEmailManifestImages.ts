/**
 * Server-side parity with client `mergeResolvedEmailImagesIntoManifest` — merge resolve API maps into manifest JSON.
 */

export function mergeResolvedEmailImagesIntoManifestRecord(
  manifest: Record<string, unknown>,
  resolvedImages: Record<number, string> | undefined,
  resolvedItemImages: Record<string, string> | undefined,
): Record<string, unknown> {
  let m = { ...manifest };
  const sections = Array.isArray(m.sections) ? [...(m.sections as Record<string, unknown>[])] : [];

  if (resolvedImages && Object.keys(resolvedImages).length > 0) {
    m = {
      ...m,
      sections: sections.map((s) => {
        const order = typeof s.order === 'number' ? s.order : Number(s.order);
        const url = resolvedImages[order];
        if (!url) return s;
        const content = (s.content && typeof s.content === 'object' ? s.content : {}) as Record<string, unknown>;
        return { ...s, content: { ...content, imageUrl: url } };
      }),
    };
  }

  if (resolvedItemImages && Object.keys(resolvedItemImages).length > 0) {
    const secs = (m.sections as Record<string, unknown>[]) ?? [];
    m = {
      ...m,
      sections: secs.map((s) => {
        const t = typeof s.type === 'string' ? s.type : '';
        if (t !== 'product_grid' && t !== 'value_prop') return s;
        const content = (s.content && typeof s.content === 'object' ? s.content : {}) as Record<string, unknown>;
        const items = Array.isArray(content.items) ? [...(content.items as Record<string, unknown>[])] : [];
        const ord = typeof s.order === 'number' ? s.order : Number(s.order);
        let changed = false;
        for (let idx = 0; idx < items.length; idx++) {
          const key = `${ord}:${idx}`;
          const url = resolvedItemImages[key];
          if (url) {
            items[idx] = { ...items[idx], imageUrl: url };
            changed = true;
          }
        }
        if (!changed) return s;
        return { ...s, content: { ...content, items } };
      }),
    };
  }

  return m;
}
