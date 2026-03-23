import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import { buildCtx, parsePositiveInt } from './common.js';
import {
  createBatchJob,
  getBatchJobStatus,
  listBatchJobs,
  cancelBatchJob,
  getDerivatives,
  retryBatchChannel,
  isValidChannel,
} from '../../services/marketing/batchService.js';

const router = Router();

/** POST /batch — create a new batch job */
router.post('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    const orgId = ctx.organizationId;
    if (!orgId) {
      res.status(400).json({ error: 'Organization required' });
      return;
    }

    const heroContentId = req.body?.hero_content_id;
    if (typeof heroContentId !== 'string' || !heroContentId.trim()) {
      res.status(400).json({ error: 'hero_content_id is required' });
      return;
    }

    const rawChannels = req.body?.channels;
    if (!Array.isArray(rawChannels) || rawChannels.length === 0) {
      res.status(400).json({ error: 'channels must be a non-empty array' });
      return;
    }

    const validChannels = rawChannels.filter(
      (c): c is string => typeof c === 'string' && isValidChannel(c),
    );
    if (validChannels.length === 0) {
      res.status(400).json({
        error:
          'No valid channels provided. Valid channels: email, twitter, instagram, linkedin, sms',
      });
      return;
    }

    const job = await createBatchJob({
      organizationId: orgId,
      heroContentId: heroContentId.trim(),
      channels: validChannels,
      userId: ctx.userId,
    });

    res.status(201).json(job);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create batch job';
    const status = msg.includes('already has an active batch') ? 409 : 400;
    console.error('[marketing/batch POST]', err);
    res.status(status).json({ error: msg });
  }
});

/** GET /batch — list batch jobs */
router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    const orgId = ctx.organizationId;
    if (!orgId) {
      res.status(400).json({ error: 'Organization required' });
      return;
    }

    const statusFilter =
      typeof req.query.status === 'string' ? req.query.status : undefined;
    const limit = parsePositiveInt(req.query.limit, 20);
    const offset = parsePositiveInt(req.query.offset, 0);

    const result = await listBatchJobs(orgId, {
      status: statusFilter,
      limit,
      offset,
    });

    res.json(result);
  } catch (err) {
    console.error('[marketing/batch GET]', err);
    res.status(500).json({ error: 'Failed to list batch jobs' });
  }
});

/** GET /batch/derivatives/:contentId — list derivative content from a hero asset */
router.get(
  '/derivatives/:contentId',
  async (req: ReimbursementRequest, res: Response) => {
    try {
      const ctx = buildCtx(req);
      const orgId = ctx.organizationId;
      if (!orgId) {
        res.status(400).json({ error: 'Organization required' });
        return;
      }

      const derivatives = await getDerivatives(req.params.contentId, orgId);

      res.json({ derivatives, total: derivatives.length });
    } catch (err) {
      console.error('[marketing/batch/derivatives GET]', err);
      res.status(500).json({ error: 'Failed to get derivatives' });
    }
  },
);

/** GET /batch/:jobId — get batch job status */
router.get('/:jobId', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    const orgId = ctx.organizationId;
    if (!orgId) {
      res.status(400).json({ error: 'Organization required' });
      return;
    }

    const job = await getBatchJobStatus(req.params.jobId, orgId);
    if (!job) {
      res.status(404).json({ error: 'Batch job not found' });
      return;
    }

    res.json(job);
  } catch (err) {
    console.error('[marketing/batch/:jobId GET]', err);
    res.status(500).json({ error: 'Failed to get batch job' });
  }
});

/** POST /batch/:jobId/cancel — cancel a batch job */
router.post('/:jobId/cancel', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    const orgId = ctx.organizationId;
    if (!orgId) {
      res.status(400).json({ error: 'Organization required' });
      return;
    }

    const job = await cancelBatchJob(req.params.jobId, orgId);
    if (!job) {
      res.status(404).json({ error: 'Batch job not found' });
      return;
    }

    res.json(job);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to cancel batch job';
    const status = msg.includes('Cannot cancel') ? 400 : 500;
    console.error('[marketing/batch/:jobId/cancel POST]', err);
    res.status(status).json({ error: msg });
  }
});

/** POST /batch/:jobId/retry-channel — retry a failed channel */
router.post(
  '/:jobId/retry-channel',
  async (req: ReimbursementRequest, res: Response) => {
    try {
      const ctx = buildCtx(req);
      const orgId = ctx.organizationId;
      if (!orgId) {
        res.status(400).json({ error: 'Organization required' });
        return;
      }

      const channel = req.body?.channel;
      if (typeof channel !== 'string' || !channel.trim()) {
        res.status(400).json({ error: 'channel is required' });
        return;
      }

      const job = await retryBatchChannel(
        req.params.jobId,
        orgId,
        channel.trim(),
        ctx.userId,
      );

      res.json(job);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to retry channel';
      const status =
        msg.includes('not found') ? 404 :
        msg.includes('only failed') || msg.includes('not found in batch') ? 400 : 500;
      console.error('[marketing/batch/:jobId/retry-channel POST]', err);
      res.status(status).json({ error: msg });
    }
  },
);

export default router;
