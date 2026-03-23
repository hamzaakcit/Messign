import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import { buildCtx } from './common.js';
import { query } from '../../db/index.js';
import {
  recordPerformance,
  getPerformanceContext,
  getContentPerformanceHistory,
} from '../../services/marketing/performanceCollector.js';
import { resolveCalibrationPrompt } from '../../services/marketing/calibrationResolver.js';
import { getCalibrationCacheStats } from '../../services/marketing/calibrationCache.js';
import { parseWebhookEvent } from '../../services/marketing/webhookParser.js';

const router = Router();

// ── Validation helpers ──

const RATE_FIELDS = [
  'open_rate',
  'click_through_rate',
  'conversion_rate',
  'unsubscribe_rate',
  'bounce_rate',
  'engagement_rate',
] as const;

function isValidRate(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1;
}

function hasAtLeastOneMetric(
  metrics: Record<string, unknown>,
): boolean {
  return Object.values(metrics).some(
    (v) => v !== undefined && v !== null && v !== '',
  );
}

// ── POST /record — record campaign metrics ──

router.post(
  '/record',
  async (req: ReimbursementRequest, res: Response) => {
    try {
      const ctx = buildCtx(req);
      const orgId = ctx.organizationId;
      if (!orgId) {
        res.status(400).json({ error: 'Organization required' });
        return;
      }

      const { content_id, channel, metrics, content_characteristics, brand_profile_id, campaign_period } =
        req.body || {};

      if (typeof content_id !== 'string' || !content_id.trim()) {
        res.status(400).json({ error: 'content_id is required' });
        return;
      }
      if (typeof channel !== 'string' || !channel.trim()) {
        res.status(400).json({ error: 'channel is required' });
        return;
      }

      if (!metrics || typeof metrics !== 'object') {
        res.status(400).json({ error: 'metrics object is required' });
        return;
      }

      if (!hasAtLeastOneMetric(metrics)) {
        res
          .status(400)
          .json({ error: 'At least one metric field must be provided' });
        return;
      }

      for (const field of RATE_FIELDS) {
        if (metrics[field] !== undefined && !isValidRate(metrics[field])) {
          res.status(400).json({
            error: `${field} must be between 0 and 1`,
          });
          return;
        }
      }

      if (
        metrics.send_count !== undefined &&
        (typeof metrics.send_count !== 'number' || metrics.send_count < 0)
      ) {
        res
          .status(400)
          .json({ error: 'send_count must be a non-negative number' });
        return;
      }

      const result = await recordPerformance(
        {
          organizationId: orgId,
          contentId: content_id,
          channel,
          metrics: {
            openRate: metrics.open_rate,
            clickThroughRate: metrics.click_through_rate,
            conversionRate: metrics.conversion_rate,
            unsubscribeRate: metrics.unsubscribe_rate,
            bounceRate: metrics.bounce_rate,
            sendCount: metrics.send_count,
            subjectLine: metrics.subject_line,
            engagementRate: metrics.engagement_rate,
            reach: metrics.reach,
            impressions: metrics.impressions,
          },
          contentCharacteristics: content_characteristics
            ? {
                toneTags: content_characteristics.tone_tags,
                visualStyle: content_characteristics.visual_style,
                themeUsed: content_characteristics.theme_used,
                sectionCount: content_characteristics.section_count,
                heroImageUsed: content_characteristics.hero_image_used,
                ctaVariant: content_characteristics.cta_variant,
                subjectLength: content_characteristics.subject_length,
              }
            : undefined,
          brandProfileId: brand_profile_id,
          campaignPeriod: campaign_period,
        },
        { query },
      );

      res.json({
        id: result.id,
        is_new: result.isNew,
        message: result.isNew
          ? 'Performance metrics recorded'
          : 'Performance metrics updated',
      });
    } catch (err) {
      console.error('[performanceRoutes] POST /record error:', err);
      res.status(500).json({ error: 'Failed to record performance metrics' });
    }
  },
);

// ── GET /context — performance context for dashboard ──

router.get(
  '/context',
  async (req: ReimbursementRequest, res: Response) => {
    try {
      const ctx = buildCtx(req);
      const orgId = ctx.organizationId;
      if (!orgId) {
        res.status(400).json({ error: 'Organization required' });
        return;
      }

      const channel =
        typeof req.query.channel === 'string'
          ? req.query.channel
          : 'email';
      const brandProfileId =
        typeof req.query.brand_profile_id === 'string'
          ? req.query.brand_profile_id
          : undefined;

      const context = await getPerformanceContext(
        orgId,
        { channel, brandProfileId },
        { query },
      );

      res.json(context);
    } catch (err) {
      console.error('[performanceRoutes] GET /context error:', err);
      res.status(500).json({ error: 'Failed to get performance context' });
    }
  },
);

// ── GET /context/prompt — cached calibration prompt text ──

router.get(
  '/context/prompt',
  async (req: ReimbursementRequest, res: Response) => {
    try {
      const ctx = buildCtx(req);
      const orgId = ctx.organizationId;
      if (!orgId) {
        res.status(400).json({ error: 'Organization required' });
        return;
      }

      const channel =
        typeof req.query.channel === 'string'
          ? req.query.channel
          : 'email';
      const brandProfileId =
        typeof req.query.brand_profile_id === 'string'
          ? req.query.brand_profile_id
          : undefined;

      const calibration = await resolveCalibrationPrompt(
        orgId,
        channel,
        brandProfileId,
      );

      res.json({
        text: calibration.text,
        generated_at: calibration.generatedAt,
        based_on_records: calibration.basedOnRecords,
      });
    } catch (err) {
      console.error('[performanceRoutes] GET /context/prompt error:', err);
      res
        .status(500)
        .json({ error: 'Failed to get calibration prompt' });
    }
  },
);

// ── GET /history/:contentId — metrics timeline for a content piece ──

router.get(
  '/history/:contentId',
  async (req: ReimbursementRequest, res: Response) => {
    try {
      const { contentId } = req.params;
      if (!contentId) {
        res.status(400).json({ error: 'contentId is required' });
        return;
      }

      const records = await getContentPerformanceHistory(contentId, {
        query,
      });

      res.json({ records });
    } catch (err) {
      console.error('[performanceRoutes] GET /history error:', err);
      res
        .status(500)
        .json({ error: 'Failed to get performance history' });
    }
  },
);

// ── POST /webhook — ESP event ingestion ──
// This endpoint uses the module-level auth middleware but the webhook
// parser is lenient: if the payload can't be mapped to a content_id,
// we still return 200 to acknowledge receipt (ESP best practice).

router.post(
  '/webhook',
  async (req: ReimbursementRequest, res: Response) => {
    try {
      const ctx = buildCtx(req);
      const orgId = ctx.organizationId;
      if (!orgId) {
        res.status(200).json({ received: true, warning: 'No organization context' });
        return;
      }

      const headers: Record<string, string> = {};
      if (req.headers['user-agent']) {
        headers['user-agent'] = req.headers['user-agent'] as string;
      }

      const event = parseWebhookEvent(req.body, headers);

      if (!event.contentId) {
        res.json({
          received: true,
          provider: event.provider,
          warning: 'Could not map to a content_id',
        });
        return;
      }

      if (!hasAtLeastOneMetric(event.metrics)) {
        res.json({
          received: true,
          provider: event.provider,
          warning: 'No actionable metrics in event',
        });
        return;
      }

      await recordPerformance(
        {
          organizationId: orgId,
          contentId: event.contentId,
          channel: event.channel,
          metrics: {
            openRate: event.metrics.openRate,
            clickThroughRate: event.metrics.clickThroughRate,
            unsubscribeRate: event.metrics.unsubscribeRate,
            bounceRate: event.metrics.bounceRate,
            sendCount: event.metrics.sendCount,
          },
        },
        { query },
      );

      res.json({
        received: true,
        provider: event.provider,
        content_id: event.contentId,
      });
    } catch (err) {
      console.error('[performanceRoutes] POST /webhook error:', err);
      res.status(500).json({ received: false, error: 'Processing failed' });
    }
  },
);

// ── GET /cache-stats — calibration cache monitoring ──

router.get(
  '/cache-stats',
  async (_req: ReimbursementRequest, res: Response) => {
    try {
      const stats = getCalibrationCacheStats();
      res.json(stats);
    } catch (err) {
      console.error('[performanceRoutes] GET /cache-stats error:', err);
      res.status(500).json({ error: 'Failed to get cache stats' });
    }
  },
);

export default router;
