import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import type { CallerContext } from '../../dal/types.js';
import * as dealsDal from '../../dal/crm/deals.js';
import * as activitiesDal from '../../dal/crm/activities.js';

const router = Router();

function buildCtx(req: ReimbursementRequest): CallerContext {
  const user = req.reimbursementUser!;
  return {
    userId: user.id,
    role: user.role as CallerContext['role'],
    organizationId: req.organizationId,
  };
}

router.get('/by-stage/:pipelineId', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { pipelineId } = req.params;
    const grouped = await dealsDal.getDealsByStage(buildCtx(req), pipelineId);
    res.json(grouped);
  } catch (err) {
    console.error('[crm/deals/by-stage GET]', err);
    res.status(500).json({ error: 'Failed to get deals by stage' });
  }
});

router.get('/metrics', async (req: ReimbursementRequest, res: Response) => {
  try {
    const period = req.query.period as string | undefined;
    const metrics = await dealsDal.getSalesMetrics(buildCtx(req), period);
    res.json(metrics);
  } catch (err) {
    console.error('[crm/deals/metrics GET]', err);
    res.status(500).json({ error: 'Failed to get sales metrics' });
  }
});

router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const filters: dealsDal.DealFilters = {
      pipeline_id: req.query.pipeline_id as string | undefined,
      stage_id: req.query.stage_id as string | undefined,
      owner_id: req.query.owner_id as string | undefined,
      company_id: req.query.company_id as string | undefined,
      search: req.query.search as string | undefined,
      min_amount: req.query.min_amount ? parseFloat(req.query.min_amount as string) : undefined,
      max_amount: req.query.max_amount ? parseFloat(req.query.max_amount as string) : undefined,
      expected_close_from: req.query.expected_close_from as string | undefined,
      expected_close_to: req.query.expected_close_to as string | undefined,
      is_open: req.query.is_open === 'true' ? true : undefined,
    };
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string) : 50;
    const sort = req.query.sort_by
      ? { field: req.query.sort_by as string, direction: (req.query.sort_dir as 'asc' | 'desc') || 'desc' }
      : undefined;

    const result = await dealsDal.listDeals(buildCtx(req), filters, sort, page, pageSize);
    res.json(result);
  } catch (err) {
    console.error('[crm/deals GET]', err);
    res.status(500).json({ error: 'Failed to list deals' });
  }
});

router.get('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const deal = await dealsDal.getDealById(buildCtx(req), req.params.id);
    if (!deal) { res.status(404).json({ error: 'Deal not found' }); return; }
    res.json(deal);
  } catch (err) {
    console.error('[crm/deals/:id GET]', err);
    res.status(500).json({ error: 'Failed to get deal' });
  }
});

router.post('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { title, pipeline_id, stage_id } = req.body;
    if (!title || !pipeline_id || !stage_id) {
      res.status(400).json({ error: 'title, pipeline_id, and stage_id are required' });
      return;
    }
    const deal = await dealsDal.createDeal(buildCtx(req), req.body);
    res.status(201).json(deal);
  } catch (err) {
    console.error('[crm/deals POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create deal' });
  }
});

router.put('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const deal = await dealsDal.updateDeal(buildCtx(req), req.params.id, req.body);
    res.json(deal);
  } catch (err) {
    console.error('[crm/deals/:id PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update deal' });
  }
});

router.put('/:id/stage', async (req: ReimbursementRequest, res: Response) => {
  try {
    const stageId = req.body.stageId || req.body.stage_id;
    if (!stageId) { res.status(400).json({ error: 'stageId is required' }); return; }
    const deal = await dealsDal.moveDealToStage(buildCtx(req), req.params.id, stageId);
    res.json(deal);
  } catch (err) {
    console.error('[crm/deals/:id/stage PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to move deal' });
  }
});

router.post('/:id/lose', async (req: ReimbursementRequest, res: Response) => {
  try {
    const deal = await dealsDal.loseDeal(buildCtx(req), req.params.id, req.body.reason);
    res.json(deal);
  } catch (err) {
    console.error('[crm/deals/:id/lose POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to mark deal as lost' });
  }
});

router.get('/:id/history', async (req: ReimbursementRequest, res: Response) => {
  try {
    const history = await dealsDal.getDealHistory(req.params.id);
    res.json(history);
  } catch (err) {
    console.error('[crm/deals/:id/history GET]', err);
    res.status(500).json({ error: 'Failed to get deal history' });
  }
});

router.delete('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    await dealsDal.deleteDeal(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[crm/deals/:id DELETE]', err);
    res.status(500).json({ error: 'Failed to delete deal' });
  }
});

// ── Deal Activities sub-routes ──

router.get('/:dealId/activities', async (req: ReimbursementRequest, res: Response) => {
  try {
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string) : 20;
    const result = await activitiesDal.listActivities(
      buildCtx(req),
      { deal_id: req.params.dealId, type: req.query.type as string | undefined },
      page,
      pageSize,
    );
    res.json(result);
  } catch (err) {
    console.error('[crm/deals/:id/activities GET]', err);
    res.status(500).json({ error: 'Failed to list activities' });
  }
});

router.post('/:dealId/activities', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { type } = req.body;
    if (!type) { res.status(400).json({ error: 'Activity type is required' }); return; }
    const activity = await activitiesDal.createActivity(buildCtx(req), { ...req.body, deal_id: req.params.dealId });
    res.status(201).json(activity);
  } catch (err) {
    console.error('[crm/deals/:id/activities POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create activity' });
  }
});

export default router;
