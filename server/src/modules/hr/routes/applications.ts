import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../../middleware/reimbursementAuth.js';
import * as applicationsDal from '../dal/recruitment/applications.js';
import { buildCtx, parseOptionalNumber, parsePositiveInt, parseSort } from './common.js';

const router = Router();

router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const result = await applicationsDal.listApplications(
      buildCtx(req),
      {
        jobId: req.query.jobId as string | undefined,
        stage: req.query.stage as string | undefined,
        scoreMin: parseOptionalNumber(req.query.scoreMin),
        scoreMax: parseOptionalNumber(req.query.scoreMax),
        search: req.query.search as string | undefined,
      },
      parseSort(req.query.sortBy, req.query.sortDir, {
        appliedAt: 'applied_at',
        stage: 'stage',
        score: 'score',
        createdAt: 'created_at',
      }),
      parsePositiveInt(req.query.page, 1),
      parsePositiveInt(req.query.pageSize, 30),
    );
    res.json(result);
  } catch (error) {
    console.error('[hr/applications GET]', error);
    res.status(500).json({ error: 'Failed to list applications' });
  }
});

router.get('/by-stage', async (req: ReimbursementRequest, res: Response) => {
  try {
    const result = await applicationsDal.getApplicationsByStage(buildCtx(req), req.query.jobId as string | undefined);
    res.json(result);
  } catch (error) {
    console.error('[hr/applications/by-stage GET]', error);
    res.status(500).json({ error: 'Failed to load applications by stage' });
  }
});

router.post('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    if (!req.body?.job_id || !req.body?.candidate_id) {
      res.status(400).json({ error: 'job_id and candidate_id are required' });
      return;
    }
    const application = await applicationsDal.createApplication(buildCtx(req), req.body);
    res.status(201).json(application);
  } catch (error) {
    console.error('[hr/applications POST]', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create application' });
  }
});

router.get('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const application = await applicationsDal.getApplicationById(buildCtx(req), req.params.id);
    if (!application) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }
    res.json(application);
  } catch (error) {
    console.error('[hr/applications/:id GET]', error);
    res.status(500).json({ error: 'Failed to load application' });
  }
});

router.post('/:id/move-stage', async (req: ReimbursementRequest, res: Response) => {
  try {
    if (!req.body?.stage) {
      res.status(400).json({ error: 'stage is required' });
      return;
    }
    const application = await applicationsDal.moveToStage(buildCtx(req), req.params.id, req.body.stage, req.body?.notes);
    res.json(application);
  } catch (error) {
    console.error('[hr/applications/:id/move-stage POST]', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to move application stage' });
  }
});

router.post('/:id/reject', async (req: ReimbursementRequest, res: Response) => {
  try {
    if (!req.body?.reason) {
      res.status(400).json({ error: 'reason is required' });
      return;
    }
    const application = await applicationsDal.rejectApplication(buildCtx(req), req.params.id, req.body.reason);
    res.json(application);
  } catch (error) {
    console.error('[hr/applications/:id/reject POST]', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to reject application' });
  }
});

export default router;
