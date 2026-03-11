import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import * as metricsDal from '../../dal/marketing/metrics.js';
import { buildCtx } from './common.js';

const router = Router();

router.get('/metrics', async (req: ReimbursementRequest, res: Response) => {
  try {
    const metrics = await metricsDal.getDashboardMetrics(buildCtx(req), req.query.period as string | undefined);
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
