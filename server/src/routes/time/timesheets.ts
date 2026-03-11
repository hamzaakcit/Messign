import { Router } from 'express';
import type { Response } from 'express';
import * as time from '../../dal/time/index.js';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import { buildCtx, parsePositiveInt } from './common.js';

const router = Router();

router.get('/current', async (req: ReimbursementRequest, res: Response) => {
  try {
    const weekStartDate = (req.query.weekStartDate as string | undefined) ?? new Date().toISOString().slice(0, 10);
    const userId = (req.query.userId as string | undefined) ?? buildCtx(req).userId;
    const sheet = await time.timesheets.getOrCreateTimesheet(buildCtx(req), userId, weekStartDate);
    res.json(sheet);
  } catch (err) {
    console.error('[time/timesheets/current GET]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to get current timesheet' });
  }
});

router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const result = await time.timesheets.listTimesheets(
      buildCtx(req),
      {
        userId: (req.query.userId as string | undefined) ?? (req.query.user_id as string | undefined),
        status: req.query.status as 'draft' | 'submitted' | 'approved' | 'rejected' | undefined,
        weekStartDate: req.query.weekStartDate as string | undefined,
        dateRange: (req.query.from || req.query.to)
          ? { from: req.query.from as string | undefined, to: req.query.to as string | undefined }
          : undefined,
      },
      parsePositiveInt(req.query.page, 1),
      parsePositiveInt(req.query.pageSize, 20),
    );
    res.json(result);
  } catch (err) {
    console.error('[time/timesheets GET]', err);
    res.status(500).json({ error: 'Failed to list timesheets' });
  }
});

router.get('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const sheet = await time.timesheets.getTimesheetById(buildCtx(req), req.params.id);
    if (!sheet) {
      res.status(404).json({ error: 'Timesheet not found' });
      return;
    }
    res.json(sheet);
  } catch (err) {
    console.error('[time/timesheets/:id GET]', err);
    res.status(500).json({ error: 'Failed to get timesheet' });
  }
});

router.post('/:id/submit', async (req: ReimbursementRequest, res: Response) => {
  try {
    const sheet = await time.timesheets.submitTimesheet(buildCtx(req), req.params.id);
    res.json(sheet);
  } catch (err) {
    console.error('[time/timesheets/:id/submit POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to submit timesheet' });
  }
});

router.post('/:id/approve', async (req: ReimbursementRequest, res: Response) => {
  try {
    const sheet = await time.timesheets.approveTimesheet(buildCtx(req), req.params.id);
    res.json(sheet);
  } catch (err) {
    console.error('[time/timesheets/:id/approve POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to approve timesheet' });
  }
});

router.post('/:id/reject', async (req: ReimbursementRequest, res: Response) => {
  try {
    const reason = req.body?.reason as string | undefined;
    if (!reason) {
      res.status(400).json({ error: 'reason is required' });
      return;
    }
    const sheet = await time.timesheets.rejectTimesheet(buildCtx(req), req.params.id, reason);
    res.json(sheet);
  } catch (err) {
    console.error('[time/timesheets/:id/reject POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to reject timesheet' });
  }
});

export default router;
