import type { DesignManifest } from '../../lib/types/manifestTypes';
import type { EmailResolveRegeneratePayload, ResolveEmailImagesResponse } from '../../lib/emailResolveTypes';

/**
 * Fingerprint of everything that affects generated image bytes: copy, prompts, art direction,
 * and per-slot item prompts. Section order is normalized so reordering changes the hash.
 */
export function buildImageResolveIdempotencyPayload(manifest: DesignManifest, contentId: string): unknown {
  const sections = [...manifest.sections].sort((a, b) => a.order - b.order);
  return {
    cid: contentId,
    v: manifest.version,
    theme: manifest.theme,
    sub: manifest.subject,
    ph: manifest.preheader ?? '',
    art: manifest.artDirection?.imageStyle ?? '',
    secs: sections.map((s) => {
      const c = s.content as Record<string, unknown>;
      const row: Record<string, unknown> = {
        o: s.order,
        t: s.type,
        ip: typeof c.imagePrompt === 'string' ? c.imagePrompt.trim() : '',
        hl:
          typeof c.headline === 'string'
            ? c.headline.trim()
            : typeof c.overlayText === 'string'
              ? String(c.overlayText).trim()
              : '',
      };
      if (s.type === 'product_grid' || s.type === 'value_prop') {
        const items = Array.isArray(c.items) ? (c.items as Record<string, unknown>[]) : [];
        row.items = items.map((it) => ({
          ip: typeof it.imagePrompt === 'string' ? String(it.imagePrompt).trim() : '',
          n: typeof it.name === 'string' ? String(it.name).trim() : '',
          h: typeof it.heading === 'string' ? String(it.heading).trim() : '',
        }));
      }
      return row;
    }),
  };
}

/**
 * Stable idempotency key for `POST resolve-email-images`.
 * Includes subject, preheader, art direction, and all imagePrompt / item prompt fields so
 * cache replays cannot return stale URLs after the user edits campaign copy or prompts.
 * When `regenerate` is set, it is folded in so targeted re-runs never replay an empty resolve.
 */
export function hashManifestForIdempotencyKey(
  manifest: DesignManifest,
  contentId: string,
  regenerate?: EmailResolveRegeneratePayload | null,
): string {
  const base = buildImageResolveIdempotencyPayload(manifest, contentId);
  const stable = JSON.stringify({
    ...(typeof base === 'object' && base !== null ? (base as Record<string, unknown>) : {}),
    regenerate: regenerate ?? null,
  });
  let h = 0;
  for (let i = 0; i < stable.length; i++) {
    h = ((h << 5) - h + stable.charCodeAt(i)) | 0;
  }
  return `va2-${contentId.slice(0, 8)}-${String(h)}`;
}

/** True when `POST resolve-email-images` should run even if every slot already has an `imageUrl`. */
export function hasEmailResolveRegenerateTargets(r: EmailResolveRegeneratePayload | undefined): boolean {
  if (!r) return false;
  if (r.force_all) return true;
  if (r.regenerate_section_orders?.length) return true;
  if (r.regenerate_item_keys?.length) return true;
  if (r.section_prompt_overrides && Object.keys(r.section_prompt_overrides).length > 0) return true;
  if (r.item_prompt_overrides && Object.keys(r.item_prompt_overrides).length > 0) return true;
  return false;
}

/** Row for “regenerate AI image” controls in the email builder. */
export interface EmailImageSlotPick {
  kind: 'section' | 'item';
  order: number;
  itemKey?: string;
  label: string;
}

/**
 * Lists manifest slots that participate in email image resolve (section-level and grid items).
 */
export function listEmailImageSlotsForRegen(manifest: DesignManifest): EmailImageSlotPick[] {
  const out: EmailImageSlotPick[] = [];
  const sorted = [...manifest.sections].sort((a, b) => a.order - b.order);
  for (const s of sorted) {
    const t = s.type;
    if (t === 'hero' || t === 'image_text' || t === 'image') {
      out.push({
        kind: 'section',
        order: s.order,
        label: `${t} · order ${s.order}`,
      });
    }
    if (
      (t === 'product_grid' || t === 'value_prop') &&
      Array.isArray((s.content as { items?: unknown }).items)
    ) {
      const items = (s.content as { items: Record<string, unknown>[] }).items;
      for (let idx = 0; idx < items.length; idx++) {
        const it = items[idx];
        const name =
          typeof it?.name === 'string'
            ? String(it.name).slice(0, 40)
            : typeof it?.heading === 'string'
              ? String(it.heading).slice(0, 40)
              : `item ${idx + 1}`;
        out.push({
          kind: 'item',
          order: s.order,
          itemKey: `${s.order}:${idx}`,
          label: `${t} · ${name} · ${s.order}:${idx}`,
        });
      }
    }
  }
  return out;
}

export interface ResolveManifestEmailImagesResult {
  manifest: DesignManifest;
  filledSlots: number;
}

/**
 * Best-effort: set `imageUrl` on the first `hero` section (Unlayer image callback does not report which block was edited).
 */
export function patchFirstHeroSectionImageUrl(manifest: DesignManifest, imageUrl: string): DesignManifest {
  let hit = false;
  const sections = manifest.sections.map((s) => {
    if (!hit && s.type === 'hero') {
      hit = true;
      const c = s.content as Record<string, unknown>;
      return { ...s, content: { ...c, imageUrl } };
    }
    return s;
  });
  return { ...manifest, sections };
}

/**
 * Returns true when the manifest has section or product_grid item image prompts that the API can resolve.
 */
/**
 * True when `body_design` already contains a full Unlayer export (rows), not only VA2 sidecar fields.
 */
export function isPersistedUnlayerDesign(bodyDesign: unknown): boolean {
  if (!bodyDesign || typeof bodyDesign !== 'object') return false;
  const o = bodyDesign as Record<string, unknown>;
  const body = o.body;
  if (!body || typeof body !== 'object') return false;
  const rows = (body as { rows?: unknown }).rows;
  return Array.isArray(rows) && rows.length > 0;
}

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
    if (s.type === 'value_prop' && Array.isArray(c.items)) {
      return (c.items as Record<string, unknown>[]).some((item) => {
        const hasUrl = typeof item.imageUrl === 'string' && String(item.imageUrl).trim();
        const hasPrompt = typeof item.imagePrompt === 'string' && String(item.imagePrompt).trim();
        const heading = typeof item.heading === 'string' && String(item.heading).trim();
        return !hasUrl && (hasPrompt || Boolean(heading));
      });
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
        if (s.type !== 'product_grid' && s.type !== 'value_prop') return s;
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

/**
 * Stamps manifest metadata with the last resolve-email-images run (for diagnostics and reload parity).
 */
export function mergeResolveTelemetryIntoManifest(
  manifest: DesignManifest,
  res: Pick<ResolveEmailImagesResponse, 'resolveRunId' | 'partial' | 'idempotencyReplayed' | 'errors'>,
): DesignManifest {
  return {
    ...manifest,
    metadata: {
      ...manifest.metadata,
      email_resolve: {
        resolveRunId: res.resolveRunId,
        partial: res.partial ?? Boolean(res.errors?.length),
        idempotencyReplayed: res.idempotencyReplayed,
        resolvedAt: new Date().toISOString(),
        errorCount: res.errors?.length ?? 0,
      },
    },
  };
}

