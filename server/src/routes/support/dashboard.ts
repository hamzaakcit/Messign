import { Router } from 'express';
import type { Response } from 'express';
import * as support from '../../dal/support/index.js';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import { buildCtx, parsePositiveInt } from './common.js';

const router = Router();

router.get('/metrics', async (req: ReimbursementRequest, res: Response) => {
  try {
    const metrics = await support.metrics.getSupportDashboardMetrics(
      buildCtx(req),
      req.query.period as string | undefined,
    );
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
