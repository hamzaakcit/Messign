import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import * as signatoriesDal from '../../dal/contracts/signatories.js';
import { buildCtx } from './common.js';

const router = Router();

router.post('/:contractId', async (req: ReimbursementRequest, res: Response) => {
  try {
    if (!req.body?.name || !req.body?.email) {
      res.status(400).json({ error: 'name and email are required' });
      return;
    }
    const signatory = await signatoriesDal.addSignatory(buildCtx(req), req.params.contractId, req.body);
    res.status(201).json(signatory);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to add signatory' });
  }
});

router.post('/:signatoryId/sign', async (req: ReimbursementRequest, res: Response) => {
  try {
    if (!req.body?.signatureData) {
      res.status(400).json({ error: 'signatureData is required' });
      return;
    }
    const signatory = await signatoriesDal.recordSignature(
      buildCtx(req),
      req.params.signatoryId,
      req.body.signatureData,
      req.body.ipAddress,
    );
    res.json(signatory);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to record signature' });
  }
});

router.post('/:signatoryId/remind', async (req: ReimbursementRequest, res: Response) => {
  try {
    await signatoriesDal.sendReminder(buildCtx(req), req.params.signatoryId);
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to send reminder' });
  }
});

export default router;
