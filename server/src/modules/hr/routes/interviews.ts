import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../../middleware/reimbursementAuth.js';
import * as interviewsDal from '../dal/recruitment/interviews.js';
import { buildCtx } from './common.js';

const router = Router();

router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const result = await interviewsDal.listInterviews(buildCtx(req), {
      applicationId: req.query.applicationId as string | undefined,
      interviewerId: req.query.interviewerId as string | undefined,
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
    });
    res.json(result);
  } catch (error) {
    console.error('[hr/interviews GET]', error);
    res.status(500).json({ error: 'Failed to list interviews' });
  }
});

router.post('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    if (!req.body?.application_id || !req.body?.interviewer_id || !req.body?.scheduled_at) {
      res.status(400).json({ error: 'application_id, interviewer_id, and scheduled_at are required' });
      return;
    }
    const interview = await interviewsDal.scheduleInterview(buildCtx(req), req.body);
    res.status(201).json(interview);
  } catch (error) {
    console.error('[hr/interviews POST]', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to schedule interview' });
  }
});

router.post('/:id/complete', async (req: ReimbursementRequest, res: Response) => {
  try {
    const interview = await interviewsDal.completeInterview(buildCtx(req), req.params.id, req.body);
    res.json(interview);
  } catch (error) {
    console.error('[hr/interviews/:id/complete POST]', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to complete interview' });
  }
});

router.post('/:id/cancel', async (req: ReimbursementRequest, res: Response) => {
  try {
    const interview = await interviewsDal.cancelInterview(buildCtx(req), req.params.id, req.body?.notes);
    res.json(interview);
  } catch (error) {
    console.error('[hr/interviews/:id/cancel POST]', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to cancel interview' });
  }
});

export default router;
