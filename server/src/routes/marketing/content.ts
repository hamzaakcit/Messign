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

const router = Router();

function mergeContentText(body: string | undefined, html: string | undefined, title: string): string {
  return (body ?? '').trim() || (html ?? '').trim() || title.trim();
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
): Promise<{ brand_voice_check: Record<string, unknown>; brand_voice_checked_at: string } | undefined> {
  const orgId = ctx.organizationId;
  if (!orgId || !text.trim()) return undefined;
  try {
    const bvc = await runBrandVoiceCheck({
      organizationId: orgId,
      contentText: text,
      tenantId: orgId,
      userQuery: 'marketing_submit_review_brand_voice',
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
      const v = await validateTruthForReview(ctx, text, req.body.title);
      if (!v.ok) {
        res.status(v.status).json(v.json);
        return;
      }
      truthValidation = v.validation;
      truthValidatedAt = new Date().toISOString();
      const bvc = await brandVoiceAfterTruthPass(ctx, text);
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
      const bvc = await brandVoiceAfterTruthPass(ctx, text);
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
