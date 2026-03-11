import { Router } from 'express';
import type { Response } from 'express';
import * as time from '../../dal/time/index.js';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import { buildCtx } from './common.js';

const router = Router();

router.get('/me', async (req: ReimbursementRequest, res: Response) => {
  try {
    const period = (req.query.period as 'week' | 'month' | 'quarter' | undefined) ?? 'month';
    const data = await time.utilization.getUserUtilization(buildCtx(req), buildCtx(req).userId, period);
    res.json(data);
  } catch (err) {
    console.error('[time/utilization/me GET]', err);
    res.status(500).json({ error: 'Failed to get utilization' });
  }
});

router.get('/team', async (req: ReimbursementRequest, res: Response) => {
  try {
    const departmentId = req.query.departmentId as string | undefined;
    const data = await time.utilization.getTeamUtilization(buildCtx(req), departmentId);
    res.json(data);
  } catch (err) {
    console.error('[time/utilization/team GET]', err);
    res.status(500).json({ error: 'Failed to get team utilization' });
  }
});

router.get('/billing', async (req: ReimbursementRequest, res: Response) => {
  try {
    const data = await time.utilization.getBillingSummary(
      buildCtx(req),
      req.query.clientId as string | undefined,
      req.query.projectId as string | undefined,
      (req.query.period as 'week' | 'month' | 'quarter' | undefined) ?? 'month',
    );
    res.json(data);
  } catch (err) {
    console.error('[time/utilization/billing GET]', err);
    res.status(500).json({ error: 'Failed to get billing summary' });
  }
});

export default router;
