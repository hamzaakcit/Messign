import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import type { CallerContext } from '../../dal/types.js';
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

router.get('/gaps', async (req: ReimbursementRequest, res: Response) => {
  try {
    const gaps = await activitiesDal.getActivityGaps(buildCtx(req));
    res.json(gaps);
  } catch (err) {
    console.error('[crm/activities/gaps GET]', err);
    res.status(500).json({ error: 'Failed to get activity gaps' });
  }
});

router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const filters: activitiesDal.ActivityFilters = {
      deal_id: req.query.deal_id as string | undefined,
      contact_id: req.query.contact_id as string | undefined,
      user_id: req.query.user_id as string | undefined,
      type: req.query.type as string | undefined,
      date_from: req.query.date_from as string | undefined,
      date_to: req.query.date_to as string | undefined,
    };
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string) : 20;

    const result = await activitiesDal.listActivities(buildCtx(req), filters, page, pageSize);
    res.json(result);
  } catch (err) {
    console.error('[crm/activities GET]', err);
    res.status(500).json({ error: 'Failed to list activities' });
  }
});

router.post('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { type } = req.body;
    if (!type) { res.status(400).json({ error: 'Activity type is required' }); return; }
    const activity = await activitiesDal.createActivity(buildCtx(req), req.body);
    res.status(201).json(activity);
  } catch (err) {
    console.error('[crm/activities POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create activity' });
  }
});

router.put('/:id/complete', async (req: ReimbursementRequest, res: Response) => {
  try {
    const activity = await activitiesDal.completeActivity(buildCtx(req), req.params.id);
    res.json(activity);
  } catch (err) {
    console.error('[crm/activities/:id/complete POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to complete activity' });
  }
});

router.put('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const activity = await activitiesDal.updateActivity(req.params.id, req.body);
    res.json(activity);
  } catch (err) {
    console.error('[crm/activities/:id PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update activity' });
  }
});

router.delete('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    await activitiesDal.deleteActivity(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[crm/activities/:id DELETE]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to delete activity' });
  }
});

export default router;
