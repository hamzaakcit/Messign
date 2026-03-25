import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../../middleware/reimbursementAuth.js';
import type { CallerContext } from '../../../dal/types.js';
import * as forecastDal from '../dal/forecast.js';

const router = Router();

router.get('/quota', async (req: ReimbursementRequest, res: Response) => {
  try {
    const quota = await forecastDal.getOrgForecastQuota(buildCtx(req));
    res.json(quota);
  } catch (err) {
    console.error('[crm/forecast/quota GET]', err);
    res.status(500).json({ error: 'Failed to get forecast quota' });
  }
});

router.put('/quota', async (req: ReimbursementRequest, res: Response) => {
  try {
    const raw = req.body?.sales_quota_eur;
    const v = typeof raw === 'string' ? parseFloat(raw) : raw;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      res.status(400).json({ error: 'sales_quota_eur must be a non-negative number' });
      return;
    }
    const quota = await forecastDal.setOrgForecastQuota(buildCtx(req), v);
    res.json(quota);
  } catch (err) {
    console.error('[crm/forecast/quota PUT]', err);
    res.status(500).json({ error: 'Failed to update forecast quota' });
  }
});

function buildCtx(req: ReimbursementRequest): CallerContext {
  const user = req.reimbursementUser!;
  return {
    userId: user.id,
    role: user.role as CallerContext['role'],
    organizationId: req.organizationId,
  };
}

router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const pipelineId = req.query.pipeline_id as string;
    if (!pipelineId) { res.status(400).json({ error: 'pipeline_id is required' }); return; }
    const forecast = await forecastDal.getPipelineForecast(buildCtx(req), pipelineId);
    res.json(forecast);
  } catch (err) {
    console.error('[crm/forecast GET]', err);
    res.status(500).json({ error: 'Failed to get forecast' });
  }
});

router.get('/by-owner', async (req: ReimbursementRequest, res: Response) => {
  try {
    const pipelineId = req.query.pipeline_id as string | undefined;
    const forecast = await forecastDal.getForecastByOwner(buildCtx(req), pipelineId);
    res.json(forecast);
  } catch (err) {
    console.error('[crm/forecast/by-owner GET]', err);
    res.status(500).json({ error: 'Failed to get forecast by owner' });
  }
});

export default router;
