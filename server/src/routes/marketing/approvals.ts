import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import { requireRole } from '../../middleware/reimbursementAuth.js';
import { buildCtx } from './common.js';
import { assignApprovalSchema, submitReviewSchema } from '../../controllers/marketingToolsSchemas.js';
import * as marketingToolsController from '../../controllers/marketingToolsController.js';

const router = Router();

router.get('/', requireRole('manager', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const raw = String(req.query.status ?? 'pending');
    if (raw !== 'pending' && raw !== 'approved' && raw !== 'rejected') {
      res.status(400).json({ success: false, error: 'Invalid status' });
      return;
    }
    const result = await marketingToolsController.listApprovals(buildCtx(req), raw);
    if (!result.ok) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }
    res.json({ success: true, data: result.data });
  } catch (err) {
    console.error('[marketing/approvals GET]', err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'list_approvals failed',
    });
  }
});

router.post('/', requireRole('manager', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const parsed = assignApprovalSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
      });
      return;
    }
    const result = await marketingToolsController.assignApproval(buildCtx(req), parsed.data);
    if (!result.ok) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }
    res.status(201).json({ success: true, data: result.data });
  } catch (err) {
    console.error('[marketing/approvals POST]', err);
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'assign_approval failed',
    });
  }
});

router.post('/:id/review', requireRole('manager', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const parsed = submitReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
      });
      return;
    }
    const result = await marketingToolsController.submitReview(buildCtx(req), req.params.id, parsed.data);
    if (!result.ok) {
      res.status(result.error.includes('not found') ? 404 : 400).json({ success: false, error: result.error });
      return;
    }
    res.json({ success: true, data: result.data });
  } catch (err) {
    console.error('[marketing/approvals/:id/review POST]', err);
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'submit_review failed',
    });
  }
});

export default router;
