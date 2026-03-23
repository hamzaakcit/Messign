import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import * as popupsDal from '../../dal/marketing/popups.js';
import { buildCtx, parsePositiveInt } from './common.js';

const router = Router();

router.post('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    if (!req.body?.name || !req.body?.body_html) {
      res.status(400).json({ error: 'name and body_html are required' });
      return;
    }
    const popup = await popupsDal.createMarketingPopup(buildCtx(req), req.body);
    res.status(201).json(popup);
  } catch (err) {
    console.error('[marketing/popups POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create popup' });
  }
});

router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const result = await popupsDal.listMarketingPopups(
      buildCtx(req),
      {
        status: req.query.status as string | undefined,
      },
      parsePositiveInt(req.query.page, 1),
      parsePositiveInt(req.query.pageSize, 20),
    );
    res.json(result);
  } catch (err) {
    console.error('[marketing/popups GET]', err);
    res.status(500).json({ error: 'Failed to list popups' });
  }
});

router.get('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const popup = await popupsDal.getMarketingPopupById(buildCtx(req), req.params.id);
    if (!popup) {
      res.status(404).json({ error: 'Popup not found' });
      return;
    }
    res.json(popup);
  } catch (err) {
    console.error('[marketing/popups/:id GET]', err);
    res.status(500).json({ error: 'Failed to fetch popup' });
  }
});

router.put('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const popup = await popupsDal.updateMarketingPopup(buildCtx(req), req.params.id, req.body);
    res.json(popup);
  } catch (err) {
    console.error('[marketing/popups/:id PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update popup' });
  }
});

export default router;
