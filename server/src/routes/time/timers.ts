import { Router } from 'express';
import type { Response } from 'express';
import * as time from '../../dal/time/index.js';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import { buildCtx } from './common.js';

const router = Router();

router.get('/active', async (req: ReimbursementRequest, res: Response) => {
  try {
    const timer = await time.timers.getActiveTimer(buildCtx(req));
    res.json(timer);
  } catch (err) {
    console.error('[time/timers/active GET]', err);
    res.status(500).json({ error: 'Failed to get active timer' });
  }
});

router.post('/start', async (req: ReimbursementRequest, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const timer = await time.timers.startTimer(buildCtx(req), {
      projectId: (body.projectId as string | undefined) ?? (body.project_id as string | undefined),
      taskId: (body.taskId as string | undefined) ?? (body.task_id as string | undefined),
      categoryId: (body.categoryId as string | undefined) ?? (body.category_id as string | undefined),
      description: body.description as string | undefined,
      isBillable: body.isBillable != null ? Boolean(body.isBillable) : (body.is_billable != null ? Boolean(body.is_billable) : undefined),
    });
    res.status(201).json(timer);
  } catch (err) {
    console.error('[time/timers/start POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to start timer' });
  }
});

router.post('/:id/stop', async (req: ReimbursementRequest, res: Response) => {
  try {
    const result = await time.timers.stopTimer(buildCtx(req), req.params.id);
    res.json(result);
  } catch (err) {
    console.error('[time/timers/:id/stop POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to stop timer' });
  }
});

router.post('/:id/discard', async (req: ReimbursementRequest, res: Response) => {
  try {
    await time.timers.discardTimer(buildCtx(req), req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[time/timers/:id/discard POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to discard timer' });
  }
});

export default router;
