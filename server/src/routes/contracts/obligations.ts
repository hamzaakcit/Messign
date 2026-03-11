import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import * as obligationsDal from '../../dal/contracts/obligations.js';
import { buildCtx } from './common.js';

const router = Router();

router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const items = await obligationsDal.listObligations(
      buildCtx(req),
      req.query.contractId as string | undefined,
      req.query.status as string | undefined,
      req.query.dueSoon === 'true',
    );
    res.json(items);
  } catch {
    res.status(500).json({ error: 'Failed to list obligations' });
  }
});

router.get('/overdue', async (req: ReimbursementRequest, res: Response) => {
  try {
    const items = await obligationsDal.getOverdueObligations(buildCtx(req));
    res.json(items);
  } catch {
    res.status(500).json({ error: 'Failed to list overdue obligations' });
  }
});

router.post('/:contractId', async (req: ReimbursementRequest, res: Response) => {
  try {
    if (!req.body?.description) {
      res.status(400).json({ error: 'description is required' });
      return;
    }
    const obligation = await obligationsDal.createObligation(buildCtx(req), req.params.contractId, req.body);
    res.status(201).json(obligation);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create obligation' });
  }
});

router.post('/complete/:obligationId', async (req: ReimbursementRequest, res: Response) => {
  try {
    const obligation = await obligationsDal.completeObligation(buildCtx(req), req.params.obligationId);
    res.json(obligation);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to complete obligation' });
  }
});

export default router;
