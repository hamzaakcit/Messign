import { Router } from 'express';
import type { Response } from 'express';
import * as support from '../dal/index.js';
import type { ReimbursementRequest } from '../../../middleware/reimbursementAuth.js';
import { buildCtx, parsePositiveInt } from './common.js';
import { redisConnection } from '../../../queue/connection.js';

const router = Router();
const METRICS_CACHE_TTL = 30;

router.get('/metrics', async (req: ReimbursementRequest, res: Response) => {
  try {
    const period = (req.query.period as string | undefined) ?? 'default';
    const orgId = req.organizationId ?? 'no-org';
    const cacheKey = `support_metrics_${orgId}_${period}`;
    try {
      const cached = await redisConnection.get(cacheKey);
      if (cached) {
        return res.json(JSON.parse(cached));
      }
    } catch (e) {
      if (e instanceof Error) console.warn('[Redis] support metrics cache get:', e.message);
    }
    const metrics = await support.metrics.getSupportDashboardMetrics(
      buildCtx(req),
      period === 'default' ? undefined : period,
    );
    try {
      await redisConnection.setex(cacheKey, METRICS_CACHE_TTL, JSON.stringify(metrics));
    } catch (e) {
      if (e instanceof Error) console.warn('[Redis] support metrics cache set:', e.message);
    }
    res.json(metrics);
  } catch (err) {
    console.error('[support/dashboard/metrics GET]', err);
    res.status(500).json({ error: 'Failed to load support dashboard metrics' });
  }
});

router.get('/agent-workload', async (req: ReimbursementRequest, res: Response) => {
  try {
    const workload = await support.metrics.getAgentWorkload(buildCtx(req));
    res.json(workload);
  } catch (err) {
    console.error('[support/dashboard/agent-workload GET]', err);
    res.status(500).json({ error: 'Failed to load agent workload' });
  }
});

router.get('/trends', async (req: ReimbursementRequest, res: Response) => {
  try {
    const trends = await support.metrics.getTicketTrends(buildCtx(req), parsePositiveInt(req.query.days, 30));
    res.json(trends);
  } catch (err) {
    console.error('[support/dashboard/trends GET]', err);
    res.status(500).json({ error: 'Failed to load ticket trends' });
  }
});

export default router;
