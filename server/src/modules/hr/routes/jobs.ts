import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../../middleware/reimbursementAuth.js';
import * as jobsDal from '../dal/recruitment/jobs.js';
import { buildCtx, parsePositiveInt, parseSort } from './common.js';

const router = Router();

router.post('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    if (!req.body?.title) {
      res.status(400).json({ error: 'Job title is required' });
      return;
    }
    const job = await jobsDal.createJob(buildCtx(req), req.body);
    res.status(201).json(job);
  } catch (error) {
    console.error('[hr/jobs POST]', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create job' });
  }
});

router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const jobs = await jobsDal.listJobs(
      buildCtx(req),
      {
        status: req.query.status as string | undefined,
        department: req.query.department as string | undefined,
        recruiterId: req.query.recruiterId as string | undefined,
        hiringManagerId: req.query.hiringManagerId as string | undefined,
        search: req.query.search as string | undefined,
      },
      parseSort(req.query.sortBy, req.query.sortDir, {
        title: 'title',
        department: 'department',
        status: 'status',
        publishedAt: 'published_at',
        createdAt: 'created_at',
      }),
      parsePositiveInt(req.query.page, 1),
      parsePositiveInt(req.query.pageSize, 20),
    );
    res.json(jobs);
  } catch (error) {
    console.error('[hr/jobs GET]', error);
    res.status(500).json({ error: 'Failed to list jobs' });
  }
});

router.get('/metrics', async (req: ReimbursementRequest, res: Response) => {
  try {
    const metrics = await jobsDal.getJobMetrics(buildCtx(req), req.query.jobId as string | undefined);
    res.json(metrics);
  } catch (error) {
    console.error('[hr/jobs/metrics GET]', error);
    res.status(500).json({ error: 'Failed to load job metrics' });
  }
});

router.get('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const job = await jobsDal.getJobById(buildCtx(req), req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    res.json(job);
  } catch (error) {
    console.error('[hr/jobs/:id GET]', error);
    res.status(500).json({ error: 'Failed to load job' });
  }
});

router.put('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const job = await jobsDal.updateJob(buildCtx(req), req.params.id, req.body);
    res.json(job);
  } catch (error) {
    console.error('[hr/jobs/:id PUT]', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to update job' });
  }
});

router.post('/:id/publish', async (req: ReimbursementRequest, res: Response) => {
  try {
    const job = await jobsDal.publishJob(buildCtx(req), req.params.id);
    res.json(job);
  } catch (error) {
    console.error('[hr/jobs/:id/publish POST]', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to publish job' });
  }
});

router.post('/:id/close', async (req: ReimbursementRequest, res: Response) => {
  try {
    const job = await jobsDal.closeJob(buildCtx(req), req.params.id, req.body?.reason);
    res.json(job);
  } catch (error) {
    console.error('[hr/jobs/:id/close POST]', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to close job' });
  }
});

export default router;
