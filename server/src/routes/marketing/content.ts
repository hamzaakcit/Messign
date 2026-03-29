import { Router } from 'express';
import type { Response } from 'express';
import multer from 'multer';
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
import {
  buildReferenceUploadStorageKey,
  buildLucyReferenceUploadStorageKey,
  uploadToStorage,
  editMarketingPhotoWithKontext,
} from '../../services/marketing/publishing/imageService.js';
import type { StylePreset, AspectRatio, ImageGenerationInput } from '../../dal/marketing/instagramTypes.js';
import { triggerBrandComplianceScan } from '../../services/marketing/complianceScanner.js';
import { inferMarketingImageErrorCode } from './marketingFalRouteErrors.js';
import { query as dbQuery } from '../../db/index.js';
import { validateEmailManifestInput } from '../../modules/marketing/emailManifestValidate.js';
import { persistEmailResolveManifestToContent } from '../../modules/marketing/persistEmailResolve.js';
import {
  getCachedEmailResolveAsync,
  setCachedEmailResolveAsync,
} from './emailResolveIdempotency.js';
import {
  runEmailImageResolvePipeline,
  type EmailImageResolveRegenerateOptions,
  type ResolveImagesManifest,
} from '../../services/marketing/emailImageResolvePipeline.js';
import { emailBulkResolveQueue } from '../../queue/emailBulkResolveQueue.js';

const router = Router();

const MAX_REGENERATE_SECTION_ORDERS = 64;
const MAX_REGENERATE_ITEM_KEYS = 128;

/**
 * Parses optional `body.regenerate` for POST resolve-email-images (targeted regen of filled slots).
 */
function parseEmailResolveRegenerate(body: unknown): EmailImageResolveRegenerateOptions | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const r = body as Record<string, unknown>;
  const reg = r.regenerate;
  if (!reg || typeof reg !== 'object') return undefined;
  const o = reg as Record<string, unknown>;
  const force_all = o.force_all === true;
  const ordersRaw = o.regenerate_section_orders;
  const keysRaw = o.regenerate_item_keys;
  const regenerate_section_orders = Array.isArray(ordersRaw)
    ? ordersRaw
        .filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
        .slice(0, MAX_REGENERATE_SECTION_ORDERS)
    : undefined;
  const regenerate_item_keys = Array.isArray(keysRaw)
    ? keysRaw
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .map((x) => x.trim())
        .slice(0, MAX_REGENERATE_ITEM_KEYS)
    : undefined;
  const section_prompt_overrides =
    typeof o.section_prompt_overrides === 'object' && o.section_prompt_overrides !== null && !Array.isArray(o.section_prompt_overrides)
      ? (o.section_prompt_overrides as Record<string, string>)
      : undefined;
  const item_prompt_overrides =
    typeof o.item_prompt_overrides === 'object' && o.item_prompt_overrides !== null && !Array.isArray(o.item_prompt_overrides)
      ? (o.item_prompt_overrides as Record<string, string>)
      : undefined;
  const hasTargets =
    force_all ||
    (regenerate_section_orders?.length ?? 0) > 0 ||
    (regenerate_item_keys?.length ?? 0) > 0 ||
    (section_prompt_overrides && Object.keys(section_prompt_overrides).length > 0) ||
    (item_prompt_overrides && Object.keys(item_prompt_overrides).length > 0);
  if (!hasTargets) return undefined;
  return {
    force_all,
    ...(regenerate_section_orders?.length ? { regenerate_section_orders } : {}),
    ...(regenerate_item_keys?.length ? { regenerate_item_keys } : {}),
    ...(section_prompt_overrides ? { section_prompt_overrides } : {}),
    ...(item_prompt_overrides ? { item_prompt_overrides } : {}),
  };
}

const REFERENCE_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
const referencePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: REFERENCE_IMAGE_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    cb(null, ok);
  },
});

function mimeToImageExt(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

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

/**
 * Upload a reference photo for Lucy Instagram modal (no content row yet). Same storage as
 * `/:id/reference-image`; returned URL is embedded in the user message as [REFERENCE_IMAGE_URL]…[/REFERENCE_IMAGE_URL].
 */
router.post(
  '/lucy-reference-upload',
  referencePhotoUpload.single('image'),
  async (req: ReimbursementRequest, res: Response) => {
    try {
      const ctx = buildCtx(req);
      const orgId = ctx.organizationId;
      if (!orgId) {
        res.status(400).json({ error: 'Organization required' });
        return;
      }
      const file = req.file;
      if (!file?.buffer?.length) {
        res.status(400).json({ error: 'Image file required (field name: image)' });
        return;
      }
      const ext = mimeToImageExt(file.mimetype);
      const key = buildLucyReferenceUploadStorageKey(orgId, ext);
      const publicUrl = await uploadToStorage(file.buffer, key, file.mimetype);
      res.json({
        success: true,
        reference_image_url: publicUrl,
      });
    } catch (err) {
      console.error('[marketing/content/lucy-reference-upload POST]', err);
      res.status(400).json({ error: err instanceof Error ? err.message : 'Upload failed' });
    }
  },
);

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
    const errMsg = result.error ?? undefined;
    res.json({
      success: result.success,
      image_url: result.image_url,
      error: result.error ?? null,
      ...(errMsg ? { error_code: inferMarketingImageErrorCode(errMsg) } : {}),
      metadata: result.metadata,
    });
  } catch (err) {
    console.error('[marketing/content/:id/regenerate-image POST]', err);
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({
      error: msg,
      error_code: inferMarketingImageErrorCode(msg),
    });
  }
});

/**
 * Upload a real-world reference photo (JPEG/PNG/WebP) for FLUX Kontext additive edits.
 * Field name: `image`. Stored in marketing storage; `reference_image_url` is set on the content row.
 */
router.post(
  '/:id/reference-image',
  referencePhotoUpload.single('image'),
  async (req: ReimbursementRequest, res: Response) => {
    try {
      const ctx = buildCtx(req);
      const orgId = ctx.organizationId;
      if (!orgId) {
        res.status(400).json({ error: 'Organization required' });
        return;
      }
      const file = req.file;
      if (!file?.buffer?.length) {
        res.status(400).json({ error: 'Image file required (field name: image)' });
        return;
      }
      const existing = await contentDal.getContentById(ctx, req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Content not found' });
        return;
      }
      const ext = mimeToImageExt(file.mimetype);
      const key = buildReferenceUploadStorageKey(orgId, req.params.id, ext);
      const publicUrl = await uploadToStorage(file.buffer, key, file.mimetype);
      const updated = await contentDal.updateContent(ctx, req.params.id, {
        reference_image_url: publicUrl,
      });
      res.json({
        success: true,
        reference_image_url: publicUrl,
        content_id: updated.id,
      });
    } catch (err) {
      console.error('[marketing/content/:id/reference-image POST]', err);
      res.status(400).json({ error: err instanceof Error ? err.message : 'Upload failed' });
    }
  },
);

/**
 * Run Kontext on the uploaded reference (`reference_image_url`) with a natural-language edit instruction.
 */
router.post('/:id/ai-photo-edit', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    const orgId = ctx.organizationId;
    if (!orgId) {
      res.status(400).json({ error: 'Organization required' });
      return;
    }
    const editPrompt = req.body?.edit_prompt;
    if (typeof editPrompt !== 'string' || editPrompt.trim().length < 10) {
      res.status(400).json({ success: false, error: 'edit_prompt is required (min 10 characters)' });
      return;
    }
    const stylePreset =
      typeof req.body?.style_preset === 'string' && req.body.style_preset.trim().length > 0
        ? req.body.style_preset.trim()
        : 'photoreal';
    const row = await contentDal.getContentById(ctx, req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Content not found' });
      return;
    }
    const refUrl = row.reference_image_url?.trim();
    if (!refUrl) {
      res.status(400).json({
        success: false,
        error: 'No reference photo on this content. Upload one via POST .../reference-image first.',
      });
      return;
    }
    /** Kontext needs a short edit instruction — not `enhanceImagePrompt` (that is for text-to-image). */
    const result = await editMarketingPhotoWithKontext({
      org_id: orgId,
      content_id: req.params.id,
      reference_image_url: refUrl,
      edit_instruction: editPrompt.trim(),
      style_preset: stylePreset,
    });
    if (result.success && result.image_url) {
      await contentDal.updateContent(ctx, req.params.id, {
        image_prompt: editPrompt.trim(),
        image_url: result.image_url,
        visual_description: editPrompt.trim(),
        image_generation_metadata: result.metadata,
      });
    }
    const errMsg = result.error ?? undefined;
    res.json({
      success: result.success,
      image_url: result.image_url,
      error: result.error ?? null,
      metadata: result.metadata,
      ...(errMsg ? { error_code: inferMarketingImageErrorCode(errMsg) } : {}),
    });
  } catch (err) {
    console.error('[marketing/content/:id/ai-photo-edit POST]', err);
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({
      error: msg,
      error_code: inferMarketingImageErrorCode(msg),
    });
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

    const defaultPresets: StylePreset[] = ['photoreal', 'modern_noir', 'vibrant_lifestyle', 'minimal_flat', 'editorial'];
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

router.post('/validate-email-manifest', async (req: ReimbursementRequest, res: Response) => {
  try {
    const manifest = req.body?.manifest;
    const r = validateEmailManifestInput(manifest);
    res.json(r);
  } catch (err) {
    console.error('[marketing/content/validate-email-manifest POST]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Validation failed' });
  }
});

/** Enqueue BullMQ batch job for email image resolve (worker logs batch; extend to call resolve per row in Phase 2b). */
router.post('/enqueue-email-resolve-batch', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    const orgId = ctx.organizationId;
    if (!orgId) {
      res.status(400).json({ error: 'Organization required' });
      return;
    }
    const contentIds = req.body?.content_ids;
    const manifests = req.body?.manifests;
    if (!Array.isArray(contentIds) || !Array.isArray(manifests)) {
      res.status(400).json({ error: 'content_ids and manifests arrays are required' });
      return;
    }
    const job = await emailBulkResolveQueue.add('bulk', {
      orgId,
      contentIds: contentIds.map((x: unknown) => String(x)),
      manifests: manifests as Record<string, unknown>[],
      idempotencyKey:
        typeof req.body?.idempotency_key === 'string' ? req.body.idempotency_key.trim() : undefined,
      requestedAt: new Date().toISOString(),
    });
    res.json({ jobId: job.id, ok: true });
  } catch (err) {
    console.error('[marketing/content/enqueue-email-resolve-batch POST]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Enqueue failed' });
  }
});

// POST /:id/resolve-email-images — same image stack as Instagram: Fal (if FAL_KEY) → Vertex Gemini (if configured) → Gemini AI Studio → OpenAI; merges URLs by section order and item keys `order:idx`.
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

    const idemRaw = req.headers['idempotency-key'];
    const idemKey = typeof idemRaw === 'string' ? idemRaw.trim() : '';
    if (idemKey) {
      const cacheKey = `email-resolve:${orgId}:${contentId}:${idemKey}`;
      const hit = await getCachedEmailResolveAsync(cacheKey);
      if (hit) {
        res.json({ ...hit, idempotencyReplayed: true });
        return;
      }
    }

    const regenerate = parseEmailResolveRegenerate(req.body);

    const { responseBody, resolveRunId } = await runEmailImageResolvePipeline({
      orgId,
      contentId,
      manifest,
      idempotencyKey: idemKey || undefined,
      regenerate,
    });

    const persist = req.body?.persist === true;
    const webhookUrl =
      typeof req.body?.webhook_url === 'string' ? String(req.body.webhook_url).trim() : '';
    if (persist) {
      try {
        await persistEmailResolveManifestToContent(
          ctx,
          contentId,
          manifest as unknown as Record<string, unknown>,
          responseBody,
          resolveRunId,
        );
      } catch (persistErr) {
        console.warn('[marketing/content] persist email resolve metadata failed', persistErr);
      }
    }

    if (webhookUrl && /^https?:\/\//i.test(webhookUrl)) {
      void fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentId,
          organizationId: orgId,
          ...responseBody,
        }),
      }).catch((e: unknown) => console.warn('[marketing/content] resolve webhook failed', e));
    }

    if (idemKey) await setCachedEmailResolveAsync(`email-resolve:${orgId}:${contentId}:${idemKey}`, responseBody);
    res.json(responseBody);
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
    res.setHeader('Cache-Control', 'no-store');
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
