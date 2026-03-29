/**
 * Shared pipeline for POST /marketing/content/:id/resolve-email-images and BullMQ bulk worker.
 */
import { randomUUID } from 'crypto';
import type { ImageGenContext } from './publishing/imageService.js';
import type { AspectRatio, ImageGenerationInput } from '../../dal/marketing/instagramTypes.js';
import {
  generateImage,
  enhanceImagePrompt,
  resolveStockImageUrl,
  pickNonHumanPlaceholderUrl,
  emailImagePromptExplicitlyRequestsPeople,
  emailCampaignCopySuggestsTechnicalPlatformImagery,
  buildCampaignImageContextForRasterModels,
  applyCampaignPrefixToPrompt,
  buildValuePropItemImagePrompt,
} from './publishing/imageService.js';

type EmailImageSlotStatus =
  | 'stock'
  | 'generated'
  | 'stock_fallback'
  | 'unsplash_fallback'
  | 'timeout'
  | 'skipped';

interface ManifestSection {
  type: string;
  order: number;
  content: Record<string, unknown>;
  variant?: string;
}

export interface ResolveImagesManifest {
  theme?: string;
  subject?: string;
  /** Inbox preview line — included when inferring whether imagery should include people. */
  preheader?: string;
  sections: ManifestSection[];
  artDirection?: { imageStyle?: string; colorNotes?: string };
  metadata?: { audience?: string };
}

/** Batch size per chunk. Uses shared `generateImage`: Fal first when FAL_KEY is set (never passes `skip_fal`). */
const MAX_PARALLEL_IMAGES = 10;
const IMAGE_RESOLVE_TIMEOUT_MS = 90_000;

/** Wide hero / editorial banners; square for product tiles. Uses same Fal-first stack as `generateImage`. */
function emailImageResolution(sectionType: string): {
  resolution: NonNullable<ImageGenerationInput['resolution']>;
  aspect_ratio?: AspectRatio;
} {
  if (sectionType === 'hero' || sectionType === 'image_text' || sectionType === 'image') {
    return { resolution: '1920x1080', aspect_ratio: '16:9' };
  }
  return { resolution: '1024x1024', aspect_ratio: '1:1' };
}

function mapEmailSectionToImageGenContext(sectionType: string): ImageGenContext['sectionType'] {
  if (sectionType === 'hero') return 'hero';
  if (sectionType === 'image_text') return 'image_text';
  if (sectionType === 'image') return 'lifestyle';
  if (sectionType === 'product_grid') return 'product_grid';
  if (sectionType === 'value_prop') return 'feature';
  return 'standalone';
}

function stripStockPrefix(prompt: string): string {
  return prompt.replace(/^\[STOCK\]\s*/i, '').trim();
}

/**
 * Surfaces duplicate normalized prompts so clients can tighten manifests before generation.
 */
function collectDuplicateImagePromptWarnings(
  tasks: { sectionOrder: number; prompt: string; sectionType: string }[],
  itemTasks: { key: string; prompt: string; kind: 'product' | 'value_prop' }[],
): string[] {
  const m = new Map<string, string[]>();
  for (const t of tasks) {
    const k = t.prompt.trim().toLowerCase();
    if (k.length < 8) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(`section:${t.sectionOrder}`);
  }
  for (const t of itemTasks) {
    const k = t.prompt.trim().toLowerCase();
    if (k.length < 8) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(`item:${t.key}`);
  }
  const out: string[] = [];
  for (const refs of m.values()) {
    if (refs.length > 1) {
      out.push(
        `Duplicate image prompt (${refs.length} slots): ${refs.join(', ')} — use distinct prompts per slot for varied imagery.`,
      );
    }
  }
  return out;
}

function buildImagePromptForSection(
  section: ManifestSection,
  manifest: ResolveImagesManifest,
): string | null {
  const c = section.content;
  const raw = typeof c.imagePrompt === 'string' ? c.imagePrompt.trim() : '';
  const withoutStock = stripStockPrefix(raw);
  if (withoutStock.length >= 10) return raw;

  const subject = (manifest.subject ?? 'email content').trim();
  const themeHint = (manifest.theme ?? '').trim();
  const preheader = (manifest.preheader ?? '').trim();

  const headline =
    typeof c.headline === 'string'
      ? c.headline.trim()
      : typeof c.overlayText === 'string'
        ? String(c.overlayText).trim()
        : '';
  const bodyPlain =
    typeof c.body === 'string'
      ? String(c.body)
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : '';
  const bodySnippet = bodyPlain.slice(0, 140);
  const bodySnippetLong = bodyPlain.slice(0, 280);

  const wantsPeople = emailImagePromptExplicitlyRequestsPeople(
    [raw, subject, preheader, headline, bodySnippet].filter(Boolean).join(' '),
  );

  if (section.type === 'hero' && manifest.artDirection?.imageStyle) {
    const style = manifest.artDirection.imageStyle.trim();
    if (style.length >= 5) {
      const prefix = raw.toLowerCase().startsWith('[stock]') ? '[STOCK] ' : '';
      const tail = wantsPeople
        ? `professional photo for: ${subject}`
        : `professional environmental or product photo for: ${subject}, no human faces as the main subject`;
      return `${prefix}${style}, ${tail}`;
    }
  }

  if (withoutStock.length > 0 && withoutStock.length < 10) {
    const base = wantsPeople
      ? `${withoutStock}${headline ? ` — ${headline}` : ''}, ${subject}${themeHint ? `, ${themeHint} aesthetic` : ''}, professional marketing photo, no text in frame`
      : `${withoutStock}${headline ? ` — ${headline}` : ''}, ${subject}${themeHint ? `, ${themeHint} aesthetic` : ''}, professional photo of products environment or objects not portraits, no human faces, no text in frame`;
    const out = raw.toLowerCase().startsWith('[stock]') ? `[STOCK] ${base}` : base;
    return out.length >= 10 ? out : null;
  }

  if (!withoutStock && headline) {
    if (wantsPeople) {
      return `[STOCK] ${headline} — ${subject}, editorial lifestyle photography${themeHint ? `, ${themeHint} mood` : ''}`;
    }
    return `[STOCK] ${headline} — ${subject} technology architecture nature product, editorial photography${themeHint ? `, ${themeHint} mood` : ''}, still life and environment not portraits`;
  }

  if (!withoutStock && bodySnippet.length >= 25) {
    if (wantsPeople) {
      return `[STOCK] ${subject}: ${bodySnippet} — editorial marketing imagery`;
    }
    return `[STOCK] ${subject}: ${bodySnippet} technology nature architecture — editorial marketing imagery, objects and spaces not faces`;
  }

  if ((section.type === 'image_text' || section.type === 'image') && bodySnippetLong.length >= 40) {
    const audience = (manifest.metadata?.audience ?? '').trim();
    const aud = audience ? `Audience: ${audience.slice(0, 120)}. ` : '';
    const tail = wantsPeople
      ? `Editorial marketing photography for: ${subject}.`
      : `Editorial photoreal scene aligned with this copy for: ${subject} — on-topic products, environment, or props; not unrelated stock.`;
    const pre = preheader ? ` Inbox line: ${preheader.slice(0, 140)}.` : '';
    return `${aud}Body context: ${bodySnippetLong} ${tail}${pre}`;
  }

  return null;
}



/**
 * When set, slots that already have `imageUrl` can still be regenerated (default: skip filled slots).
 * Use `force_all` or list specific section orders / item keys `"order:idx"`.
 * Optional prompt maps override the computed prompt for those targets (min 10 characters per override).
 */
export interface EmailImageResolveRegenerateOptions {
  /** Regenerate every image slot that has a resolvable prompt, including when URL is already set. */
  force_all?: boolean;
  /** Section `order` values to regenerate even if `imageUrl` is set. */
  regenerate_section_orders?: number[];
  /** Item keys `order:idx` for product_grid / value_prop rows to regenerate even if `imageUrl` is set. */
  regenerate_item_keys?: string[];
  /** Override prompt for a section order (key as number or string matching JSON). */
  section_prompt_overrides?: Record<string, string> | Record<number, string>;
  /** Override prompt for an item key `order:idx`. */
  item_prompt_overrides?: Record<string, string>;
}

function normalizeRegenerateOrders(raw: number[] | undefined): Set<number> {
  const s = new Set<number>();
  if (!raw?.length) return s;
  for (const n of raw) {
    if (typeof n === 'number' && Number.isFinite(n)) s.add(n);
  }
  return s;
}

function normalizeRegenerateItemKeys(raw: string[] | undefined): Set<string> {
  const s = new Set<string>();
  if (!raw?.length) return s;
  for (const k of raw) {
    if (typeof k === 'string' && k.trim()) s.add(k.trim());
  }
  return s;
}

function sectionPromptOverride(
  order: number,
  overrides: EmailImageResolveRegenerateOptions['section_prompt_overrides'] | undefined,
): string | null {
  if (!overrides || typeof overrides !== 'object') return null;
  const v = (overrides as Record<string, unknown>)[String(order)];
  const t = typeof v === 'string' ? v.trim() : '';
  return t.length >= 10 ? t : null;
}

function itemPromptOverride(
  key: string,
  overrides: EmailImageResolveRegenerateOptions['item_prompt_overrides'] | undefined,
): string | null {
  if (!overrides || typeof overrides !== 'object') return null;
  const t = (overrides[key] ?? overrides[key.trim()])?.trim() ?? '';
  return t.length >= 10 ? t : null;
}

export interface RunEmailImageResolveParams {
  orgId: string;
  contentId: string;
  manifest: ResolveImagesManifest;
  includeResolveDebug?: boolean;
  idempotencyKey?: string;
  /** Targeted regeneration for slots that already have image URLs; see {@link EmailImageResolveRegenerateOptions}. */
  regenerate?: EmailImageResolveRegenerateOptions;
}

export async function runEmailImageResolvePipeline(
  params: RunEmailImageResolveParams,
): Promise<{ responseBody: Record<string, unknown>; resolveRunId: string }> {
  const { orgId, contentId, manifest } = params;
  const idemKey = params.idempotencyKey;
  const reg = params.regenerate;
  const forceAll = reg?.force_all === true;
  const regOrders = normalizeRegenerateOrders(reg?.regenerate_section_orders);
  const regItemKeys = normalizeRegenerateItemKeys(reg?.regenerate_item_keys);
  if (reg?.section_prompt_overrides && typeof reg.section_prompt_overrides === 'object') {
    for (const k of Object.keys(reg.section_prompt_overrides)) {
      const n = Number(k);
      if (Number.isFinite(n)) regOrders.add(n);
    }
  }
  if (reg?.item_prompt_overrides && typeof reg.item_prompt_overrides === 'object') {
    for (const k of Object.keys(reg.item_prompt_overrides)) {
      if (k.includes(':')) regItemKeys.add(k.trim());
    }
  }

  const forceSection = (order: number): boolean => forceAll || regOrders.has(order);
  const forceItem = (key: string): boolean => forceAll || regItemKeys.has(key.trim());

const resolveRunId = randomUUID();

const campaignPrefixRaster = buildCampaignImageContextForRasterModels(manifest);
const includeResolveDebug =
    params.includeResolveDebug ??
    (process.env.EMAIL_RESOLVE_DEBUG === '1' || process.env.NODE_ENV === 'development');
const debugEffective: {
  campaignPrefix: string;
  effectivePromptBySection: Record<number, string>;
  effectivePromptByItem: Record<string, string>;
  effectiveModelBySection: Record<number, string>;
  effectiveBackendBySection: Record<number, string>;
  effectiveModelByItem: Record<string, string>;
  effectiveBackendByItem: Record<string, string>;
} = {
  campaignPrefix: campaignPrefixRaster,
  effectivePromptBySection: {},
  effectivePromptByItem: {},
  effectiveModelBySection: {},
  effectiveBackendBySection: {},
  effectiveModelByItem: {},
  effectiveBackendByItem: {},
};

const tasks: { sectionOrder: number; prompt: string; sectionType: string }[] = [];
const itemTasks: { key: string; prompt: string; kind: 'product' | 'value_prop' }[] = [];
const sectionResults: Record<number, { status: EmailImageSlotStatus; error?: string }> = {};
const slotItemResults: Record<string, { status: EmailImageSlotStatus; error?: string }> = {};

for (const section of manifest.sections) {
  if (section.type === 'value_prop' && Array.isArray(section.content.items)) {
    const items = section.content.items as Array<Record<string, unknown>>;
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const itemKey = `${section.order}:${idx}`;
      const hasItemUrl = typeof item.imageUrl === 'string' && String(item.imageUrl).trim();
      if (hasItemUrl && !forceItem(itemKey)) {
        slotItemResults[itemKey] = { status: 'skipped' };
        continue;
      }
      let resolvedPrompt = buildValuePropItemImagePrompt(item, manifest);
      const itemOv = itemPromptOverride(itemKey, reg?.item_prompt_overrides);
      if (itemOv) {
        resolvedPrompt = itemOv;
      }
      if (resolvedPrompt) {
        itemTasks.push({ key: itemKey, prompt: resolvedPrompt, kind: 'value_prop' });
      }
    }
    continue;
  }

  if (section.type === 'product_grid' && Array.isArray(section.content.items)) {
    const items = section.content.items as Array<Record<string, unknown>>;
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const itemKey = `${section.order}:${idx}`;
      const hasItemUrl = typeof item.imageUrl === 'string' && String(item.imageUrl).trim();
      if (hasItemUrl && !forceItem(itemKey)) {
        slotItemResults[itemKey] = { status: 'skipped' };
        continue;
      }
      const promptRaw = typeof item.imagePrompt === 'string' ? String(item.imagePrompt).trim() : '';
      const fallbackPrompt = typeof item.name === 'string' ? String(item.name).trim() : '';
      let resolvedPrompt = promptRaw.length >= 5 ? promptRaw : (fallbackPrompt.length >= 3 ? `product photo of ${fallbackPrompt}` : '');
      const itemOv = itemPromptOverride(itemKey, reg?.item_prompt_overrides);
      if (itemOv) {
        resolvedPrompt = itemOv;
      }
      if (resolvedPrompt) {
        itemTasks.push({ key: itemKey, prompt: resolvedPrompt, kind: 'product' });
      }
    }
    continue;
  }

  const hasUrl = typeof section.content.imageUrl === 'string' && section.content.imageUrl.trim();
  if (hasUrl && !forceSection(section.order)) {
    sectionResults[section.order] = { status: 'skipped' };
    continue;
  }
  let prompt = buildImagePromptForSection(section, manifest);
  const secOv = sectionPromptOverride(section.order, reg?.section_prompt_overrides);
  if (secOv) {
    prompt = secOv;
  }
  if (prompt) {
    tasks.push({ sectionOrder: section.order, prompt, sectionType: section.type });
  }
}

const promptDuplicateWarnings = collectDuplicateImagePromptWarnings(tasks, itemTasks);

/** Same normalized prompt → one generation; URL copied to sibling section orders (cost + consistency). */
const promptNorm = (p: string): string => p.trim().toLowerCase();
const promptToSectionOrders = new Map<string, number[]>();
for (const t of tasks) {
  const k = promptNorm(t.prompt);
  if (!promptToSectionOrders.has(k)) promptToSectionOrders.set(k, []);
  promptToSectionOrders.get(k)!.push(t.sectionOrder);
}
const seenPromptKeys = new Set<string>();
const uniqueTasks = tasks.filter((t) => {
  const k = promptNorm(t.prompt);
  if (seenPromptKeys.has(k)) return false;
  seenPromptKeys.add(k);
  return true;
});

if (uniqueTasks.length === 0 && itemTasks.length === 0) {
  const emptyBody: Record<string, unknown> = {
    images: {},
    itemImages: {},
    errors: [],
    resolveRunId,
    sectionResults,
    itemResults: slotItemResults,
    partial: false,
    idempotencyKey: idemKey ?? undefined,
    promptDuplicateWarnings,
  };
  return { responseBody: emptyBody, resolveRunId };
}

const images: Record<number, string> = {};
const itemImages: Record<string, string> = {};
const errors: string[] = [];

const timedOut = Symbol('timeout');
const deadline = new Promise<typeof timedOut>((resolve) =>
  setTimeout(() => resolve(timedOut), IMAGE_RESOLVE_TIMEOUT_MS),
);

const chunks: { sectionOrder: number; prompt: string; sectionType: string }[][] = [];
for (let i = 0; i < uniqueTasks.length; i += MAX_PARALLEL_IMAGES) {
  chunks.push(uniqueTasks.slice(i, i + MAX_PARALLEL_IMAGES));
}

const themeHint = manifest.theme ?? undefined;

for (const chunk of chunks) {
  const stockResolved: { order: number; url: string }[] = [];
  const genTasks: { order: number; prompt: string; sectionType: string }[] = [];

  for (const task of chunk) {
    const stockUrl = resolveStockImageUrl(task.prompt);
    if (stockUrl) {
      stockResolved.push({ order: task.sectionOrder, url: stockUrl });
    } else {
      genTasks.push({
        order: task.sectionOrder,
        prompt: task.prompt,
        sectionType: task.sectionType,
      });
    }
  }

  for (const sr of stockResolved) {
    images[sr.order] = sr.url;
    sectionResults[sr.order] = { status: 'stock' };
  }

  if (genTasks.length === 0) continue;

  const results = await Promise.race([
    Promise.allSettled(
      genTasks.map((task) => {
        const { resolution, aspect_ratio } = emailImageResolution(task.sectionType);
        const technicalCombined = [
          manifest.subject,
          manifest.preheader ?? '',
          campaignPrefixRaster,
          task.prompt,
        ].join(' ');
        const technicalPlatformTopic =
          emailCampaignCopySuggestsTechnicalPlatformImagery(technicalCombined) &&
          !emailImagePromptExplicitlyRequestsPeople(task.prompt);
        const ctx: ImageGenContext = {
          channel: 'email',
          sectionType: mapEmailSectionToImageGenContext(task.sectionType),
          themeHint,
          technicalPlatformTopic,
        };
        const rawForGen = applyCampaignPrefixToPrompt(task.prompt, campaignPrefixRaster);
        if (includeResolveDebug) {
          const capped = rawForGen.length > 4000 ? `${rawForGen.slice(0, 4000)}…` : rawForGen;
          debugEffective.effectivePromptBySection[task.order] = capped;
        }
        const enhanced = enhanceImagePrompt(rawForGen, 'photoreal', ctx);
        return generateImage({
          org_id: orgId,
          content_id: randomUUID(),
          prompt: enhanced,
          resolution,
          aspect_ratio,
          style_preset: 'photoreal',
          email_campaign: true,
          technical_platform_topic: technicalPlatformTopic,
          // Fal-first: do not set skip_fal (see imageService/generateImage.ts step 1).
        });
      }),
    ),
    deadline,
  ]);

  if (results === timedOut) {
    errors.push('Image generation timed out — returning partial results');
    for (const t of genTasks) {
      if (images[t.order] === undefined) {
        sectionResults[t.order] = { status: 'timeout' };
      }
    }
    break;
  }

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const order = genTasks[i].order;
    if (r.status === 'fulfilled' && r.value.success && r.value.image_url) {
      images[order] = r.value.image_url;
      sectionResults[order] = { status: 'generated' };
      if (includeResolveDebug && r.value.metadata) {
        const meta = r.value.metadata;
        debugEffective.effectiveModelBySection[order] = meta.model;
        if (meta.image_backend) {
          debugEffective.effectiveBackendBySection[order] = meta.image_backend;
        }
      }
    } else {
      const msg = r.status === 'rejected'
        ? String(r.reason)
        : r.value.error ?? 'Unknown generation failure';
      errors.push(`Section ${order}: ${msg}`);
      const fallbackUrl = resolveStockImageUrl(genTasks[i].prompt);
      if (fallbackUrl) {
        images[order] = fallbackUrl;
        sectionResults[order] = { status: 'stock_fallback', error: msg };
      } else {
        // Last resort when stock + AI both fail: rotate non-portrait placeholders (avoid one corporate stock face).
        const seed = `${contentId}:${order}:${genTasks[i].prompt.slice(0, 80)}`;
        images[order] = `${pickNonHumanPlaceholderUrl(seed)}&auto=format&fit=crop&w=1200&q=80`;
        sectionResults[order] = { status: 'unsplash_fallback', error: msg };
      }
    }
  }
}

/** Copy resolved URL + section result from first section order to siblings with identical prompts. */
for (const orders of promptToSectionOrders.values()) {
  if (orders.length < 2) continue;
  const donor = orders[0];
  const url = images[donor];
  const donorResult = sectionResults[donor];
  if (url === undefined) continue;
  for (let i = 1; i < orders.length; i++) {
    const o = orders[i];
    if (images[o] === undefined) {
      images[o] = url;
      sectionResults[o] = donorResult ?? { status: 'generated' };
    }
  }
}

// Resolve product_grid item-level images (separate deadline so section timeouts don't skip items)
if (itemTasks.length > 0) {
  const itemDeadline = new Promise<typeof timedOut>((resolve) =>
    setTimeout(() => resolve(timedOut), IMAGE_RESOLVE_TIMEOUT_MS),
  );

  const itemChunks: typeof itemTasks[] = [];
  for (let i = 0; i < itemTasks.length; i += MAX_PARALLEL_IMAGES) {
    itemChunks.push(itemTasks.slice(i, i + MAX_PARALLEL_IMAGES));
  }

  for (const chunk of itemChunks) {
    const stockResolved: { key: string; url: string }[] = [];
    const genItemTasks: typeof itemTasks = [];

    for (const task of chunk) {
      const stockUrl = resolveStockImageUrl(task.prompt);
      if (stockUrl) {
        stockResolved.push({ key: task.key, url: stockUrl });
      } else {
        genItemTasks.push(task);
      }
    }

    for (const sr of stockResolved) {
      itemImages[sr.key] = sr.url;
      slotItemResults[sr.key] = { status: 'stock' };
    }

    if (genItemTasks.length === 0) continue;

    const settledItemGen = await Promise.race([
      Promise.allSettled(
        genItemTasks.map((task) => {
          const isFeature = task.kind === 'value_prop';
          /** Value-prop tiles: abstract/diagram style reads more on-topic than "flat-lay" minimal_flat. */
          const style = isFeature ? 'data_viz' : 'photoreal';
          const itemTechnicalCombined = [
            manifest.subject,
            manifest.preheader ?? '',
            campaignPrefixRaster,
            task.prompt,
          ].join(' ');
          const technicalPlatformTopic =
            emailCampaignCopySuggestsTechnicalPlatformImagery(itemTechnicalCombined) &&
            !emailImagePromptExplicitlyRequestsPeople(task.prompt);
          const ctx: ImageGenContext = {
            channel: 'email',
            sectionType: isFeature ? 'feature' : 'product',
            themeHint,
            technicalPlatformTopic,
          };
          const rawForGen = applyCampaignPrefixToPrompt(task.prompt, campaignPrefixRaster);
          if (includeResolveDebug) {
            const capped = rawForGen.length > 4000 ? `${rawForGen.slice(0, 4000)}…` : rawForGen;
            debugEffective.effectivePromptByItem[task.key] = capped;
          }
          const enhanced = enhanceImagePrompt(rawForGen, style, ctx);
          return generateImage({
            org_id: orgId,
            content_id: randomUUID(),
            prompt: enhanced,
            resolution: '1024x1024',
            aspect_ratio: '1:1',
            style_preset: style as ImageGenerationInput['style_preset'],
            email_campaign: true,
            technical_platform_topic: technicalPlatformTopic,
            // Fal-first: do not set skip_fal.
          });
        }),
      ),
      itemDeadline,
    ]);

    if (settledItemGen === timedOut) {
      errors.push('Item image generation timed out — returning partial results');
      for (const t of genItemTasks) {
        if (itemImages[t.key] === undefined) {
          slotItemResults[t.key] = { status: 'timeout' };
        }
      }
      break;
    }

    for (let i = 0; i < settledItemGen.length; i++) {
      const r = settledItemGen[i];
      const key = genItemTasks[i].key;
      const task = genItemTasks[i];
      if (r.status === 'fulfilled' && r.value.success && r.value.image_url) {
        itemImages[key] = r.value.image_url;
        slotItemResults[key] = { status: 'generated' };
        if (includeResolveDebug && r.value.metadata) {
          const meta = r.value.metadata;
          debugEffective.effectiveModelByItem[key] = meta.model;
          if (meta.image_backend) {
            debugEffective.effectiveBackendByItem[key] = meta.image_backend;
          }
        }
      } else {
        const msg = r.status === 'rejected'
          ? String(r.reason)
          : r.value.error ?? 'Unknown generation failure';
        errors.push(`${task.kind === 'value_prop' ? 'Value prop' : 'Product'} item ${key}: ${msg}`);
        const fallbackUrl = resolveStockImageUrl(task.prompt);
        if (fallbackUrl) {
          itemImages[key] = fallbackUrl;
          slotItemResults[key] = { status: 'stock_fallback', error: msg };
        } else if (task.kind === 'product') {
          const nameMatch = task.prompt.match(/product photo of (.+)/i);
          const keyword = encodeURIComponent(nameMatch?.[1]?.trim() || 'product');
          itemImages[key] = `https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80&text=${keyword}`;
          slotItemResults[key] = { status: 'unsplash_fallback', error: msg };
        } else {
          const seed = `${contentId}:${key}:${task.prompt.slice(0, 48)}`;
          itemImages[key] = `${pickNonHumanPlaceholderUrl(seed)}&auto=format&fit=crop&w=800&q=80`;
          slotItemResults[key] = { status: 'unsplash_fallback', error: msg };
        }
      }
    }
  }
}

if (errors.length > 0) {
  const duplicatePromptGroups = [...promptToSectionOrders.values()].filter((o) => o.length > 1)
    .length;
  console.warn(
    '[marketing/content] resolve-email-images partial',
    JSON.stringify({
      event: 'email_resolve_partial',
      contentId,
      orgId,
      resolveRunId,
      errorCount: errors.length,
      errorSample: errors.slice(0, 5),
      duplicatePromptGroups,
    }),
  );
}

const responseBody: Record<string, unknown> = {
  images,
  itemImages,
  errors,
  resolveRunId,
  sectionResults,
  itemResults: slotItemResults,
  partial: errors.length > 0,
  idempotencyKey: idemKey ?? undefined,
  promptDuplicateWarnings,
  ...(includeResolveDebug
    ? {
        debug: {
          campaignPrefix: campaignPrefixRaster || undefined,
          effectivePromptBySection: debugEffective.effectivePromptBySection,
          effectivePromptByItem: debugEffective.effectivePromptByItem,
          effectiveModelBySection: debugEffective.effectiveModelBySection,
          effectiveBackendBySection: debugEffective.effectiveBackendBySection,
          effectiveModelByItem: debugEffective.effectiveModelByItem,
          effectiveBackendByItem: debugEffective.effectiveBackendByItem,
        },
      }
    : {}),
};

  return { responseBody, resolveRunId };
}
