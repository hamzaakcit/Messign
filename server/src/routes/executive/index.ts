import { Router } from 'express';
import { reimbursementAuth, type ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import type { CallerContext } from '../../dal/types.js';
import {
  getExecutiveDashboard,
  getFinanceMetrics,
  getRecentActivity,
  getRevenueMetrics,
} from '../../dal/executive/dashboard.js';

const executiveRouter = Router();

function buildCtx(req: ReimbursementRequest): CallerContext {
  const user = req.reimbursementUser!;
  return {
    userId: user.id,
    role: user.role as CallerContext['role'],
    organizationId: req.organizationId,
  };
}

executiveRouter.use(reimbursementAuth);

executiveRouter.get('/dashboard', async (req: ReimbursementRequest, res) => {
  try {
    const data = await getExecutiveDashboard(buildCtx(req));
    res.json(data);
  } catch (error) {
    console.error('[executive/dashboard]', error);
    res.status(500).json({ error: 'Failed to load executive dashboard' });
  }
});

executiveRouter.get('/dashboard/revenue', async (req: ReimbursementRequest, res) => {
  try {
    const data = await getRevenueMetrics(buildCtx(req));
    res.json(data);
  } catch (error) {
    console.error('[executive/dashboard/revenue]', error);
    res.status(500).json({ error: 'Failed to load revenue metrics' });
  }
});

executiveRouter.get('/dashboard/finance', async (req: ReimbursementRequest, res) => {
  try {
    const data = await getFinanceMetrics(buildCtx(req));
    res.json(data);
  } catch (error) {
    console.error('[executive/dashboard/finance]', error);
    res.status(500).json({ error: 'Failed to load finance metrics' });
  }
});

executiveRouter.get('/dashboard/activity', async (req: ReimbursementRequest, res) => {
  try {
    const data = await getRecentActivity(buildCtx(req));
    res.json(data);
  } catch (error) {
    console.error('[executive/dashboard/activity]', error);
    res.status(500).json({ error: 'Failed to load recent activity' });
  }
});

export default executiveRouter;
