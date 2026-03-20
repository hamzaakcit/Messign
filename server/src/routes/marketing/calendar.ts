import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import { requireRole } from '../../middleware/reimbursementAuth.js';
import { buildCtx } from './common.js';
import { scheduleContentSchema } from '../../controllers/marketingToolsSchemas.js';
import * as marketingToolsController from '../../controllers/marketingToolsController.js';

const router = Router();

/** POST /calendar/schedule — schedule approved content on the calendar */
router.post('/schedule', requireRole('manager', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const parsed = scheduleContentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
      });
      return;
    }
    const result = await marketingToolsController.scheduleContent(buildCtx(req), parsed.data);
    if (!result.ok) {
      const code = result.error.includes('not found') ? 404 : 400;
      res.status(code).json({ success: false, error: result.error });
      return;
    }
    res.status(200).json({ success: true, data: result.data });
  } catch (err) {
    console.error('[marketing/calendar/schedule POST]', err);
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'schedule_content failed',
    });
  }
});

export default router;
