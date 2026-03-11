import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import * as metricsDal from '../../dal/recruitment/metrics.js';
import { buildCtx } from './common.js';

const router = Router();

router.get('/metrics', async (req: ReimbursementRequest, res: Response) => {
  try {
    const metrics = await metricsDal.getDashboardMetrics(buildCtx(req));
    res.json(metrics);
  } catch (error) {
    console.error('[recruitment/dashboard/metrics GET]', error);
    res.status(500).json({ error: 'Failed to load recruitment dashboard metrics' });
  }
});

router.get('/funnel', async (req: ReimbursementRequest, res: Response) => {
  try {
    const funnel = await metricsDal.getFunnelConversion(buildCtx(req), req.query.jobId as string | undefined);
    res.json(funnel);
  } catch (error) {
    console.error('[recruitment/dashboard/funnel GET]', error);
    res.status(500).json({ error: 'Failed to load recruitment funnel' });
  }
});

router.get('/time-to-hire', async (req: ReimbursementRequest, res: Response) => {
  try {
    const timeToHire = await metricsDal.getTimeToHire(buildCtx(req));
    res.json({ avgDays: timeToHire });
  } catch (error) {
    console.error('[recruitment/dashboard/time-to-hire GET]', error);
    res.status(500).json({ error: 'Failed to load time to hire' });
  }
});

export default router;
