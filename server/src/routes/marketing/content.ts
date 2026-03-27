import { randomUUID } from 'crypto';
import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import type { CallerContext } from '../../dal/types.js';
import type { CreateContentInput, UpdateContentInput } from '../../dal/marketing/content.js';
import * as contentDal from '../../dal/marketing/content.js';
import { buildCtx, parseDateRange, parsePositiveInt, parseSort } from './common.js';
import {
  runProductTruthValidation,
  type ProductTruthValidationResult,
} from '../../services/ai/marketing/productTruthValidator.js';
import { runBrandVoiceCheck } from '../../services/ai/marketing/brandVoiceChecker.js';
import { regenerateImageForContent } from '../../services/marketing/workflows/instagramContentWorkflow.js';
import { generateImageVariations } from '../../services/marketing/workflows/instagramImagePipeline.js';
import { repurposeContent } from '../../services/ai/marketing/repurposeService.js';
import { generateImage, enhanceImagePrompt, resolveStockImageUrl } from '../../services/marketing/publishing/imageService.js';
import type { ImageGenContext } from '../../services/marketing/publishing/imageService.js';
import type { StylePreset, AspectRatio } from '../../dal/marketing/instagramTypes.js';
import { triggerBrandComplianceScan } from '../../services/marketing/complianceScanner.js';
import { query as dbQuery } from '../../db/index.js';

const router = Router();

/** Strip tags for plain-text gatekeepers when only HTML is present. */
function stripHtmlToPlain(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeContentText(body: string | undefined, html: string | undefined, title: string): string {
  const plain = (body ?? '').trim();
  if (plain) return plain;
  const h = (html ?? '').trim();
  if (h) return stripHtmlToPlain(h) || title.trim();
  return title.trim();
}

/** Normalize publishing channel for brand voice / policy prompts (matches orchestrator defaults). */
function resolveBrandVoiceChannel(channel: string | null | undefined): string {
  const c = (channel ?? '').trim().toLowerCase();
  return c || 'linkedin';
}

async function validateTruthForReview(
  ctx: CallerContext,
  text: string,
  topic?: string,
): Promise<{ ok: true; validation: ProductTruthValidationResult } | { ok: false; status: number; json: object }> {
  const orgId = ctx.organizationId;
  if (!orgId) return { ok: false, status: 400, json: { error: 'Organization required' } };
  if (!text.trim()) {
    return { ok: false, status: 400, json: { error: 'Content text required to submit for review' } };
  }
  const validation = await runProductTruthValidation({
    organizationId: orgId,
    contentText: text,
    tenantId: orgId,
    topic,
    userQuery: 'product_truth_validation_api',
  });
  if (validation.verdict === 'FAIL') {
    return {
      ok: false,
      status: 422,
      json: { error: 'Product truth validation failed', truth_validation: validation },
    };
  }
  return { ok: true, validation };
}

async function brandVoiceAfterTruthPass(
  ctx: CallerContext,
  text: string,
  /** From `marketing_content.channel` or request body — drives channel-specific brand rules */
  targetChannel?: string | null,
): Promise<{ brand_voice_check: Record<string, unknown>; brand_voice_checked_at: string } | undefined> {
  const orgId = ctx.organizationId;
  if (!orgId || !text.trim()) return undefined;
  try {
    const bvc = await runBrandVoiceCheck({
      organizationId: orgId,
      contentText: text,
      tenantId: orgId,
      userQuery: 'marketing_submit_review_brand_voice',
      targetChannel: resolveBrandVoiceChannel(targetChannel),
    });
    return {
      brand_voice_check: bvc as unknown as Record<string, unknown>,
      brand_voice_checked_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[marketing/content] brand voice check', err);
    return undefined;
  }
}

router.post('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    if (!req.body?.title || !req.body?.content_type) {
      res.status(400).json({ error: 'Title and content_type are required' });
      return;
    }
    const ctx = buildCtx(req);
    const submitForReview = req.body.submit_for_review === true;
    let status = typeof req.body.status === 'string' ? req.body.status : 'idea';
    if (submitForReview) status = 'in_review';

    let truthValidation: ProductTruthValidationResult | undefined;
    let truthValidatedAt: string | undefined;
    let brandVoiceCheck: Record<string, unknown> | undefined;
    let brandVoiceCheckedAt: string | undefined;
    if (status === 'in_review') {
      const text = mergeContentText(req.body.body, req.body.body_html, req.body.title);
      const channelForVoice =
        typeof req.body.channel === 'string' && req.body.channel.trim() ? req.body.channel : undefined;

      const [v, bvc] = await Promise.all([
        validateTruthForReview(ctx, text, req.body.title),
        brandVoiceAfterTruthPass(ctx, text, channelForVoice),
      ]);

      if (!v.ok) {
        res.status(v.status).json(v.json);
        return;
      }
      truthValidation = v.validation;
      truthValidatedAt = new Date().toISOString();
      if (bvc) {
        brandVoiceCheck = bvc.brand_voice_check;
        brandVoiceCheckedAt = bvc.brand_voice_checked_at;
      }
    }

    const {
      submit_for_review: _sr,
      truth_validation: _tv0,
      truth_validated_at: _ta0,
      brand_voice_check: _bvc0,
      brand_voice_checked_at: _bca0,
      ...raw
    } = req.body as Record<string, unknown> & { title: string; content_type: string };
    const content = await contentDal.createContent(ctx, {
      ...(raw as CreateContentInput),
      status,
      truth_validation: truthValidation as unknown as Record<string, unknown>,
      truth_validated_at: truthValidatedAt,
      brand_voice_check: brandVoiceCheck,
      brand_voice_checked_at: brandVoiceCheckedAt,
    });
    if (status === 'in_review' && content.id && ctx.organizationId) {
      triggerBrandComplianceScan(content.id, ctx.organizationId, { query: dbQuery });
    }
    res.status(201).json(content);
  } catch (err) {
    console.error('[marketing/content POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create content' });
  }
});

router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const result = await contentDal.listContent(
      buildCtx(req),
      {
        status: req.query.status as string | undefined,
        contentType: req.query.contentType as string | undefined,
        channel: req.query.channel as string | undefined,
        campaignId: req.query.campaignId as string | undefined,
        scheduledDateRange: parseDateRange(req.query.dateFrom, req.query.dateTo),
        authorId: req.query.authorId as string | undefined,
        parentContentId: typeof req.query.parent_id === 'string' ? req.query.parent_id : undefined,
        brandProfileId: typeof req.query.brand_profile_id === 'string' ? req.query.brand_profile_id : undefined,
      },
      parseSort(req.query.sortBy, req.query.sortDir, {
        title: 'title',
        status: 'status',
        contentType: 'content_type',
        channel: 'channel',
        scheduledDate: 'scheduled_date',
        engagement: 'engagement',
      }),
      parsePositiveInt(req.query.page, 1),
      parsePositiveInt(req.query.pageSize, 20),
    );
    res.json(result);
  } catch (err) {
    console.error('[marketing/content GET]', err);
    res.status(500).json({ error: 'Failed to list content' });
  }
});

router.get('/calendar', async (req: ReimbursementRequest, res: Response) => {
  try {
    const month = parsePositiveInt(req.query.month, new Date().getMonth() + 1);
    const year = parsePositiveInt(req.query.year, new Date().getFullYear());
    const calendar = await contentDal.getCalendarView(buildCtx(req), month, year);
    res.json(calendar);
  } catch (err) {
    console.error('[marketing/content/calendar GET]', err);
    res.status(500).json({ error: 'Failed to load content calendar' });
  }
});

router.post('/:id/repurpose', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    const orgId = ctx.organizationId;
    if (!orgId) {
      res.status(400).json({ success: false, error: 'Organization required' });
      return;
    }

    const raw = req.body?.target_channels;
    if (!Array.isArray(raw) || raw.length === 0) {
      res.status(400).json({
        success: false,
        error: 'target_channels must be a non-empty array',
      });
      return;
    }

    const source = await contentDal.getContentById(ctx, req.params.id);
    if (!source) {
      res.status(404).json({ success: false, error: 'Source content not found' });
      return;
    }

    const styleHints =
      req.body?.style_hints && typeof req.body.style_hints === 'object' && !Array.isArray(req.body.style_hints)
        ? (req.body.style_hints as Record<string, string>)
        : {};

    console.log('[REPURPOSE] Starting repurpose:', {
      sourceId: req.params.id,
      sourceChannel: source.channel,
      targetChannels: raw,
    });

    const result = await repurposeContent({
      ctx,
      sourceContent: source,
      targetChannels: raw.map((c) => String(c)),
      styleHints,
    });

    console.log('[REPURPOSE] Complete:', {
      sourceId: req.params.id,
      variantsCreated: result.variants.length,
      errors: result.errors.length,
    });

    res.json({
      success: result.errors.length === 0,
      variants: result.variants,
      ...(result.errors.length > 0 ? { errors: result.errors } : {}),
    });
  } catch (err) {
    console.error('[REPURPOSE] Error:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: 'Repurpose failed' });
  }
});

router.post('/:id/regenerate-image', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    const imagePrompt = req.body?.image_prompt;
    if (typeof imagePrompt !== 'string' || !imagePrompt.trim()) {
      res.status(400).json({ success: false, error: 'image_prompt is required' });
      return;
    }
    const trimmed = imagePrompt.trim();
    if (trimmed.length < 10) {
      res.status(400).json({ success: false, error: 'Image prompt must be at least 10 characters' });
      return;
    }
    const stylePresetRaw =
      (typeof req.body?.style_preset === 'string' && req.body.style_preset) ||
      (typeof req.body?.style === 'string' && req.body.style);
    const stylePreset = (stylePresetRaw || undefined) as StylePreset | undefined;
    const aspectRatio = (typeof req.body?.aspect_ratio === 'string' ? req.body.aspect_ratio : undefined) as AspectRatio | undefined;
    const result = await regenerateImageForContent(ctx, {
      content_id: req.params.id,
      new_prompt: trimmed,
      style_preset: stylePreset,
      aspect_ratio: aspectRatio,
    });
    res.json({
      success: result.success,
      image_url: result.image_url,
      error: result.error ?? null,
    });
  } catch (err) {
    console.error('[marketing/content/:id/regenerate-image POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to regenerate image' });
  }
});

router.post('/:id/image-variants', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    const prompt = req.body?.image_prompt;
    if (typeof prompt !== 'string' || prompt.trim().length < 10) {
      res.status(400).json({ success: false, error: 'image_prompt (min 10 chars) is required' });
      return;
    }

    const defaultPresets: StylePreset[] = ['modern_noir', 'vibrant_lifestyle', 'minimal_flat', 'editorial'];
    const requestedPresets = Array.isArray(req.body?.style_presets)
      ? req.body.style_presets.filter((p: unknown): p is StylePreset => typeof p === 'string')
      : defaultPresets;
    const presets = requestedPresets.length > 0 ? requestedPresets.slice(0, 6) : defaultPresets;
    const aspectRatio = (typeof req.body?.aspect_ratio === 'string' ? req.body.aspect_ratio : undefined) as AspectRatio | undefined;

    const variants = await generateImageVariations({
      orgId: ctx.organizationId ?? '',
      contentId: req.params.id,
      prompt: prompt.trim(),
      caller: ctx,
      stylePresets: presets,
      aspectRatio,
    });

    res.json({ success: true, variants });
  } catch (err) {
    console.error('[marketing/content/:id/image-variants POST]', err);
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Failed to generate variants' });
  }
});

interface ManifestSection {
  type: string;
  order: number;
  content: Record<string, unknown>;
  variant?: string;
}

interface ResolveImagesManifest {
  theme?: string;
  subject?: string;
  sections: ManifestSection[];
  artDirection?: { imageStyle?: string; colorNotes?: string };
}

const MAX_PARALLEL_IMAGES = 4;
const IMAGE_RESOLVE_TIMEOUT_MS = 90_000;

function buildImagePromptForSection(
  section: ManifestSection,
  manifest: ResolveImagesManifest,
): string | null {
  const c = section.content;
  const prompt = typeof c.imagePrompt === 'string' ? c.imagePrompt.trim() : '';
  if (prompt.length >= 10) return prompt;

  if (section.type === 'hero' && manifest.artDirection?.imageStyle) {
    const style = manifest.artDirection.imageStyle.trim();
    const subject = manifest.subject ?? 'email content';
    if (style.length >= 5) return `${style}, professional photo for: ${subject}`;
  }

  return null;
}

router.post('/:id/resolve-email-images', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    const orgId = ctx.organizationId;
    if (!orgId) {
      res.status(400).json({ error: 'Organization required' });
      return;
    }
    const contentId = req.params.id;
    const manifest = req.body?.manifest as ResolveImagesManifest | undefined;
    if (!manifest?.sections || !Array.isArray(manifest.sections)) {
      res.status(400).json({ error: 'manifest with sections array is required' });
      return;
    }

    const tasks: { sectionOrder: number; prompt: string }[] = [];
    const itemTasks: { key: string; prompt: string }[] = [];

    for (const section of manifest.sections) {
      if (section.type === 'product_grid' && Array.isArray(section.content.items)) {
        const items = section.content.items as Array<Record<string, unknown>>;
        for (let idx = 0; idx < items.length; idx++) {
          const item = items[idx];
          const hasItemUrl = typeof item.imageUrl === 'string' && String(item.imageUrl).trim();
          if (hasItemUrl) continue;
          const prompt = typeof item.imagePrompt === 'string' ? String(item.imagePrompt).trim() : '';
          const fallbackPrompt = typeof item.name === 'string' ? String(item.name).trim() : '';
          const resolvedPrompt = prompt.length >= 5 ? prompt : (fallbackPrompt.length >= 3 ? `product photo of ${fallbackPrompt}` : '');
          if (resolvedPrompt) {
            itemTasks.push({ key: `${section.order}:${idx}`, prompt: resolvedPrompt });
          }
        }
        continue;
      }

      const hasUrl = typeof section.content.imageUrl === 'string' && section.content.imageUrl.trim();
      if (hasUrl) continue;
      const prompt = buildImagePromptForSection(section, manifest);
      if (prompt) {
        tasks.push({ sectionOrder: section.order, prompt });
      }
    }

    if (tasks.length === 0 && itemTasks.length === 0) {
      res.json({ images: {}, itemImages: {}, errors: [] });
      return;
    }

    const images: Record<number, string> = {};
    const itemImages: Record<string, string> = {};
    const errors: string[] = [];

    const timedOut = Symbol('timeout');
    const deadline = new Promise<typeof timedOut>((resolve) =>
      setTimeout(() => resolve(timedOut), IMAGE_RESOLVE_TIMEOUT_MS),
    );

    const chunks: { sectionOrder: number; prompt: string }[][] = [];
    for (let i = 0; i < tasks.length; i += MAX_PARALLEL_IMAGES) {
      chunks.push(tasks.slice(i, i + MAX_PARALLEL_IMAGES));
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
          const section = manifest.sections.find((s) => s.order === task.sectionOrder);
          genTasks.push({
            order: task.sectionOrder,
            prompt: task.prompt,
            sectionType: section?.type ?? 'standalone',
          });
        }
      }

      for (const sr of stockResolved) {
        images[sr.order] = sr.url;
      }

      if (genTasks.length === 0) continue;

      const results = await Promise.race([
        Promise.allSettled(
          genTasks.map((task) => {
            const sectionTypeMap: Record<string, ImageGenContext['sectionType']> = {
              hero: 'hero',
              product_grid: 'product',
              value_prop: 'value_prop',
              testimonial: 'testimonial',
              image_text: 'image_text',
              social_proof: 'social_proof',
              feature: 'feature',
              lifestyle: 'lifestyle',
            };
            const section = manifest.sections.find((s) => s.order === task.order);
            const artDir = section?.content?.artDirection as ImageGenContext['artDirection'] | undefined;
            const ctx: ImageGenContext = {
              channel: 'email',
              sectionType: sectionTypeMap[task.sectionType] ?? 'standalone',
              themeHint,
              artDirection: artDir,
            };
            const enhanced = enhanceImagePrompt(task.prompt, undefined, ctx);
            // fal.ai provider handles its own resolution per section type;
            // this resolution is the fallback for other providers in the cascade.
            const resolution = '1024x1024' as const;
            return generateImage({
              org_id: orgId,
              content_id: randomUUID(),
              prompt: enhanced,
              resolution,
            }, ctx);
          }),
        ),
        deadline,
      ]);

      if (results === timedOut) {
        errors.push('Image generation timed out — returning partial results');
        break;
      }

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const order = genTasks[i].order;
        if (r.status === 'fulfilled' && r.value.success && r.value.image_url) {
          images[order] = r.value.image_url;
        } else {
          const msg = r.status === 'rejected'
            ? String(r.reason)
            : r.value.error ?? 'Unknown generation failure';
          errors.push(`Section ${order}: ${msg}`);
          const fallbackUrl = resolveStockImageUrl(genTasks[i].prompt);
          if (fallbackUrl) {
            images[order] = fallbackUrl;
          } else {
            const keyword = encodeURIComponent(genTasks[i].prompt.slice(0, 60).trim() || 'business');
            images[order] = `https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=1200&q=80&text=${keyword}`;
          }
        }
      }
    }

    // Resolve product_grid item-level images (separate deadline so section timeouts don't skip items)
    if (itemTasks.length > 0) {
      const itemDeadline = new Promise<typeof timedOut>((resolve) =>
        setTimeout(() => resolve(timedOut), IMAGE_RESOLVE_TIMEOUT_MS),
      );

      const itemChunks: { key: string; prompt: string }[][] = [];
      for (let i = 0; i < itemTasks.length; i += MAX_PARALLEL_IMAGES) {
        itemChunks.push(itemTasks.slice(i, i + MAX_PARALLEL_IMAGES));
      }

      for (const chunk of itemChunks) {
        const stockResolved: { key: string; url: string }[] = [];
        const genItemTasks: { key: string; prompt: string }[] = [];

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
        }

        if (genItemTasks.length === 0) continue;

        const itemResults = await Promise.race([
          Promise.allSettled(
            genItemTasks.map((task) => {
              const ctx: ImageGenContext = {
                channel: 'email',
                sectionType: 'product',
                themeHint,
              };
              const enhanced = enhanceImagePrompt(task.prompt, undefined, ctx);
              return generateImage({
                org_id: orgId,
                content_id: randomUUID(),
                prompt: enhanced,
                resolution: '1024x1024',
              });
            }),
          ),
          itemDeadline,
        ]);

        if (itemResults === timedOut) {
          errors.push('Product image generation timed out — returning partial results');
          break;
        }

        for (let i = 0; i < itemResults.length; i++) {
          const r = itemResults[i];
          const key = genItemTasks[i].key;
          if (r.status === 'fulfilled' && r.value.success && r.value.image_url) {
            itemImages[key] = r.value.image_url;
          } else {
            const msg = r.status === 'rejected'
              ? String(r.reason)
              : r.value.error ?? 'Unknown generation failure';
            errors.push(`Product item ${key}: ${msg}`);
            const fallbackUrl = resolveStockImageUrl(genItemTasks[i].prompt);
            if (fallbackUrl) {
              itemImages[key] = fallbackUrl;
            } else {
              const nameMatch = genItemTasks[i].prompt.match(/product photo of (.+)/i);
              const keyword = encodeURIComponent(nameMatch?.[1]?.trim() || 'product');
              itemImages[key] = `https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80&text=${keyword}`;
            }
          }
        }
      }
    }

    res.json({ images, itemImages, errors });
  } catch (err) {
    console.error('[marketing/content/:id/resolve-email-images POST]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to resolve images' });
  }
});

router.get('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const content = await contentDal.getContentById(buildCtx(req), req.params.id);
    if (!content) {
      res.status(404).json({ error: 'Content not found' });
      return;
    }
    res.json(content);
  } catch (err) {
    console.error('[marketing/content/:id GET]', err);
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

router.put('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    const existing = await contentDal.getContentById(ctx, req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Content not found' });
      return;
    }
    const submitForReview = req.body.submit_for_review === true;
    let nextStatus = req.body.status !== undefined ? String(req.body.status) : existing.status;
    if (submitForReview) nextStatus = 'in_review';

    const movingToReview = nextStatus === 'in_review' && existing.status !== 'in_review';

    let truthValidation: ProductTruthValidationResult | undefined;
    let truthValidatedAt: string | undefined;
    let brandVoiceCheck: Record<string, unknown> | undefined;
    let brandVoiceCheckedAt: string | undefined;
    if (movingToReview) {
      const bodyText = req.body.body !== undefined ? String(req.body.body) : existing.body ?? '';
      const htmlText = req.body.body_html !== undefined ? String(req.body.body_html) : existing.body_html ?? '';
      const text = mergeContentText(bodyText, htmlText, existing.title);
      const v = await validateTruthForReview(ctx, text, existing.title);
      if (!v.ok) {
        res.status(v.status).json(v.json);
        return;
      }
      truthValidation = v.validation;
      truthValidatedAt = new Date().toISOString();
      const channelForVoice =
        req.body.channel !== undefined && req.body.channel !== null
          ? String(req.body.channel)
          : existing.channel;
      const bvc = await brandVoiceAfterTruthPass(ctx, text, channelForVoice);
      if (bvc) {
        brandVoiceCheck = bvc.brand_voice_check;
        brandVoiceCheckedAt = bvc.brand_voice_checked_at;
      }
    }

    const {
      submit_for_review: _sr,
      truth_validation: _tv1,
      truth_validated_at: _ta1,
      brand_voice_check: _bvc1,
      brand_voice_checked_at: _bca1,
      ...patch
    } = req.body as Record<string, unknown>;
    const content = await contentDal.updateContent(ctx, req.params.id, {
      ...(patch as UpdateContentInput),
      status: nextStatus,
      ...(truthValidation
        ? {
            truth_validation: truthValidation as unknown as Record<string, unknown>,
            truth_validated_at: truthValidatedAt,
            brand_voice_check: brandVoiceCheck,
            brand_voice_checked_at: brandVoiceCheckedAt,
          }
        : {}),
    });
    if (movingToReview && content.id && ctx.organizationId) {
      triggerBrandComplianceScan(content.id, ctx.organizationId, { query: dbQuery });
    }
    res.json(content);
  } catch (err) {
    console.error('[marketing/content/:id PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update content' });
  }
});

router.post('/:id/publish', async (req: ReimbursementRequest, res: Response) => {
  try {
    const content = await contentDal.publishContent(buildCtx(req), req.params.id);
    res.json(content);
  } catch (err) {
    console.error('[marketing/content/:id/publish POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to publish content' });
  }
});

router.post('/:id/schedule', async (req: ReimbursementRequest, res: Response) => {
  try {
    if (!req.body?.date) {
      res.status(400).json({ error: 'date is required' });
      return;
    }
    const content = await contentDal.scheduleContent(buildCtx(req), req.params.id, req.body.date, req.body.time);
    res.json(content);
  } catch (err) {
    console.error('[marketing/content/:id/schedule POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to schedule content' });
  }
});

export default router;
