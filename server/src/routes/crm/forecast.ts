import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import type { CallerContext } from '../../dal/types.js';
import * as forecastDal from '../../dal/crm/forecast.js';

const router = Router();

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
