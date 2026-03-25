import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import * as metricsDal from '../../dal/marketing/metrics.js';
import * as leadsDal from '../../dal/marketing/leads.js';
import * as contentDal from '../../dal/marketing/content.js';
import * as campaignDal from '../../dal/marketing/campaigns.js';
import * as emailsDal from '../../dal/marketing/emailCampaigns.js';
import { buildCtx, parsePositiveInt } from './common.js';
import { redisConnection } from '../../queue/connection.js';
import { buildCommandCenterPayload } from '../../services/marketing/commandCenterAggregator.js';

const router = Router();

/** Read-heavy dashboard; TTL balances freshness vs load (same idea as executive dashboard). */
const METRICS_CACHE_TTL_SEC = 90;

function metricsCacheKey(orgId: string, period: string | undefined): string {
  return `marketing_dashboard_metrics_${orgId}_${period ?? 'default'}`;
}

const BOOTSTRAP_CACHE_TTL_SEC = 30;
function bootstrapCacheKey(orgId: string, period: string | undefined): string {
  return `marketing_dashboard_bootstrap_${orgId}_${period ?? 'default'}`;
}

const COMMAND_CENTER_CACHE_TTL_SEC = 45;
function commandCenterCacheKey(orgId: string, days: number, brandId: string | null): string {
  return `marketing_command_center_${orgId}_d${days}_b${brandId ?? 'all'}`;
}

/** One round-trip for Marketing dashboard home (replaces 5 parallel client requests). */
router.get('/bootstrap', async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId;
    if (!orgId) {
      res.status(403).json({ error: 'No organization context' });
      return;
    }
    const period = typeof req.query.period === 'string' ? req.query.period : undefined;
    const fresh =
      req.query.fresh === '1' ||
      req.query.fresh === 'true' ||
      (Array.isArray(req.query.fresh) && req.query.fresh.includes('1'));
    const bsCacheKey = bootstrapCacheKey(orgId, period);

    if (!fresh) {
      try {
        const cached = await redisConnection.get(bsCacheKey);
        if (cached) {
          res.json(JSON.parse(cached));
          return;
        }
      } catch { /* cache miss — proceed with fresh fetch */ }
    }

    const ctx = buildCtx(req);

    const metricsPromise = (async () => {
      const cacheKey = metricsCacheKey(orgId, period);
      try {
        const cached = await redisConnection.get(cacheKey);
        if (cached) {
          return JSON.parse(cached) as Awaited<ReturnType<typeof metricsDal.getDashboardMetrics>>;
        }
      } catch (e) {
        if (e instanceof Error) console.warn('[Redis] marketing dashboard bootstrap metrics get:', e.message);
      }
      const metrics = await metricsDal.getDashboardMetrics(ctx, period);
      try {
        await redisConnection.setex(cacheKey, METRICS_CACHE_TTL_SEC, JSON.stringify(metrics));
      } catch (e) {
        if (e instanceof Error) console.warn('[Redis] marketing dashboard bootstrap metrics set:', e.message);
      }
      return metrics;
    })();

    /** Kanban needs newest work first; default listContent sorts by scheduled_date (NULLS LAST) which hides new unscheduled items beyond page 1. */
    const [metrics, hotLeads, content, campaigns, emailCampaigns] = await Promise.all([
      metricsPromise,
      leadsDal.getHotLeads(ctx),
      contentDal.listContent(ctx, {}, { field: 'created', direction: 'desc' }, 1, 150),
      campaignDal.listCampaigns(ctx, {}, { field: 'created', direction: 'desc' }, 1, 100),
      emailsDal.listEmailCampaigns(ctx, undefined, 1, 100),
    ]);

    const payload = { metrics, hotLeads, content, campaigns, emailCampaigns };
    if (!fresh) {
      try {
        await redisConnection.setex(bsCacheKey, BOOTSTRAP_CACHE_TTL_SEC, JSON.stringify(payload));
      } catch { /* best-effort cache write */ }
    }

    res.json(payload);
  } catch (err) {
    console.error('[marketing/dashboard/bootstrap GET]', err);
    res.status(500).json({ error: 'Failed to load dashboard bundle' });
  }
});

router.get('/metrics', async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId;
    if (!orgId) {
      res.status(403).json({ error: 'No organization context' });
      return;
    }
    const period = typeof req.query.period === 'string' ? req.query.period : undefined;
    const cacheKey = metricsCacheKey(orgId, period);
    try {
      const cached = await redisConnection.get(cacheKey);
      if (cached) {
        return res.json(JSON.parse(cached));
      }
    } catch (e) {
      if (e instanceof Error) console.warn('[Redis] marketing dashboard metrics get:', e.message);
    }
    const metrics = await metricsDal.getDashboardMetrics(buildCtx(req), period);
    try {
      await redisConnection.setex(cacheKey, METRICS_CACHE_TTL_SEC, JSON.stringify(metrics));
    } catch (e) {
      if (e instanceof Error) console.warn('[Redis] marketing dashboard metrics set:', e.message);
    }
    res.json(metrics);
  } catch (err) {
    console.error('[marketing/dashboard/metrics GET]', err);
    res.status(500).json({ error: 'Failed to load dashboard metrics' });
  }
});

router.get('/channels', async (req: ReimbursementRequest, res: Response) => {
  try {
    const channels = await metricsDal.getChannelPerformance(buildCtx(req), req.query.period as string | undefined);
    res.json(channels);
  } catch (err) {
    console.error('[marketing/dashboard/channels GET]', err);
    res.status(500).json({ error: 'Failed to load channel performance' });
  }
});

/** Command Center bundle: funnel, CAC/ROI proxies, experiments, social pulse, strategy plays. */
router.get('/command-center', async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId;
    if (!orgId) {
      res.status(403).json({ error: 'No organization context' });
      return;
    }
    const days = parsePositiveInt(req.query.days, 7);
    const brandRaw = req.query.brand_id;
    const brandId =
      typeof brandRaw === 'string' && brandRaw.length > 0 ? brandRaw : null;
    const fresh =
      req.query.fresh === '1' ||
      req.query.fresh === 'true' ||
      (Array.isArray(req.query.fresh) && req.query.fresh.includes('1'));

    const cacheKey = commandCenterCacheKey(orgId, days, brandId);

    if (!fresh) {
      try {
        const cached = await redisConnection.get(cacheKey);
        if (cached) {
          res.json(JSON.parse(cached));
          return;
        }
      } catch {
        /* proceed */
      }
    }

    const payload = await buildCommandCenterPayload(buildCtx(req), { days, brandId });
    if (!fresh) {
      try {
        await redisConnection.setex(cacheKey, COMMAND_CENTER_CACHE_TTL_SEC, JSON.stringify(payload));
      } catch {
        /* best-effort */
      }
    }
    res.json(payload);
  } catch (err) {
    console.error('[marketing/dashboard/command-center GET]', err);
    res.status(500).json({ error: 'Failed to load command center' });
  }
});

router.get('/comparison', async (req: ReimbursementRequest, res: Response) => {
  try {
    const idsParam = req.query.ids;
    const ids = Array.isArray(idsParam)
      ? idsParam.flatMap((value) => String(value).split(','))
      : typeof idsParam === 'string'
        ? idsParam.split(',')
        : [];
    const comparison = await metricsDal.getCampaignComparison(
      buildCtx(req),
      ids.map((id) => id.trim()).filter(Boolean),
    );
    res.json(comparison);
  } catch (err) {
    console.error('[marketing/dashboard/comparison GET]', err);
    res.status(500).json({ error: 'Failed to load campaign comparison' });
  }
});

export default router;
