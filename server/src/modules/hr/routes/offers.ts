import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../../middleware/reimbursementAuth.js';
import * as offersDal from '../dal/recruitment/offers.js';
import { buildCtx } from './common.js';

const router = Router();

router.post('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    if (!req.body?.application_id || req.body?.salary == null) {
      res.status(400).json({ error: 'application_id and salary are required' });
      return;
    }
    const offer = await offersDal.createOffer(buildCtx(req), req.body);
    res.status(201).json(offer);
  } catch (error) {
    console.error('[hr/offers POST]', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create offer' });
  }
});

router.post('/:id/send', async (req: ReimbursementRequest, res: Response) => {
  try {
    const offer = await offersDal.sendOffer(buildCtx(req), req.params.id);
    res.json(offer);
  } catch (error) {
    console.error('[hr/offers/:id/send POST]', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to send offer' });
  }
});

router.post('/:id/accept', async (req: ReimbursementRequest, res: Response) => {
  try {
    const offer = await offersDal.acceptOffer(buildCtx(req), req.params.id);
    res.json(offer);
  } catch (error) {
    console.error('[hr/offers/:id/accept POST]', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to accept offer' });
  }
});

router.post('/:id/reject', async (req: ReimbursementRequest, res: Response) => {
  try {
    const offer = await offersDal.rejectOffer(buildCtx(req), req.params.id, req.body?.reason);
    res.json(offer);
  } catch (error) {
    console.error('[hr/offers/:id/reject POST]', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to reject offer' });
  }
});

export default router;
