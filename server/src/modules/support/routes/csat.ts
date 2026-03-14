import { Router } from 'express';
import type { Response } from 'express';
import * as support from '../dal/index.js';
import type { ReimbursementRequest } from '../../../middleware/reimbursementAuth.js';
import { buildCtx, parsePositiveInt } from './common.js';

const router = Router();

router.post('/tickets/:ticketId/rating', async (req: ReimbursementRequest, res: Response) => {
  try {
    const rating = Number(req.body.rating);
    if (!Number.isFinite(rating)) {
      res.status(400).json({ error: 'rating is required' });
      return;
    }
    const submitted = await support.csat.submitRating(
      buildCtx(req),
      req.params.ticketId,
      rating,
      req.body.comment as string | undefined,
    );
    res.status(201).json(submitted);
  } catch (err) {
    console.error('[support/csat/tickets/:ticketId/rating POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to submit CSAT rating' });
  }
});

router.get('/summary', async (req: ReimbursementRequest, res: Response) => {
  try {
    const summary = await support.csat.getCsatSummary(buildCtx(req), parsePositiveInt(req.query.days, 30));
    res.json(summary);
  } catch (err) {
    console.error('[support/csat/summary GET]', err);
    res.status(500).json({ error: 'Failed to load CSAT summary' });
  }
});

export default router;
