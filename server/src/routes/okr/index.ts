import { Router } from 'express';
import type { Response } from 'express';
import { reimbursementAuth } from '../../middleware/reimbursementAuth.js';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import type { CallerContext } from '../../dal/types.js';
import * as okrsDal from '../../dal/okrs.js';

const router = Router();

router.use(reimbursementAuth);

function buildCtx(req: ReimbursementRequest): CallerContext {
  const user = req.reimbursementUser!;
  return {
    userId: user.id,
    role: user.role as CallerContext['role'],
    organizationId: req.organizationId,
  };
}

// ── Periods ──

router.get('/periods', async (req: ReimbursementRequest, res: Response) => {
  try {
    const periods = await okrsDal.listPeriods(buildCtx(req));
    res.json(periods);
  } catch (err) {
    console.error('[okr/periods GET]', err);
    res.status(500).json({ error: 'Failed to list periods' });
  }
});

// ── Goals ──

router.get('/goals', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { periodId, level, parentGoalId } = req.query;
    const goals = await okrsDal.listGoals(
      buildCtx(req),
      periodId as string | undefined,
      level as string | undefined,
      parentGoalId as string | undefined,
    );
    res.json(goals);
  } catch (err) {
    console.error('[okr/goals GET]', err);
    res.status(500).json({ error: 'Failed to list goals' });
  }
});

router.get('/goals/tree/:periodId', async (req: ReimbursementRequest, res: Response) => {
  try {
    const tree = await okrsDal.getGoalTree(buildCtx(req), req.params.periodId);
    res.json(tree);
  } catch (err) {
    console.error('[okr/goals/tree GET]', err);
    res.status(500).json({ error: 'Failed to get goal tree' });
  }
});

router.get('/goals/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const goal = await okrsDal.getGoalById(buildCtx(req), req.params.id);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    res.json(goal);
  } catch (err) {
    console.error('[okr/goals/:id GET]', err);
    res.status(500).json({ error: 'Failed to get goal' });
  }
});

router.post('/goals', async (req: ReimbursementRequest, res: Response) => {
  try {
    const goal = await okrsDal.createGoal(buildCtx(req), req.body);
    res.status(201).json(goal);
  } catch (err) {
    console.error('[okr/goals POST]', err);
    res.status(500).json({ error: 'Failed to create goal' });
  }
});

router.put('/goals/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const goal = await okrsDal.updateGoal(buildCtx(req), req.params.id, req.body);
    res.json(goal);
  } catch (err) {
    console.error('[okr/goals/:id PUT]', err);
    res.status(500).json({ error: 'Failed to update goal' });
  }
});

// ── Key Results ──

router.post('/goals/:id/key-results', async (req: ReimbursementRequest, res: Response) => {
  try {
    const kr = await okrsDal.createKeyResult(buildCtx(req), req.params.id, req.body);
    res.status(201).json(kr);
  } catch (err) {
    console.error('[okr/key-results POST]', err);
    res.status(500).json({ error: 'Failed to create key result' });
  }
});

// ── Check-ins ──

router.put('/key-results/:id/check-in', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { value, note, confidence } = req.body;
    const ci = await okrsDal.checkIn(buildCtx(req), req.params.id, value, note, confidence);
    res.json(ci);
  } catch (err) {
    console.error('[okr/check-in PUT]', err);
    res.status(500).json({ error: 'Failed to submit check-in' });
  }
});

// ── Metrics ──

router.get('/metrics', async (req: ReimbursementRequest, res: Response) => {
  try {
    const metrics = await okrsDal.getOKRMetrics(buildCtx(req), req.query.periodId as string | undefined);
    res.json(metrics);
  } catch (err) {
    console.error('[okr/metrics GET]', err);
    res.status(500).json({ error: 'Failed to get OKR metrics' });
  }
});

export { router as okrRouter };
