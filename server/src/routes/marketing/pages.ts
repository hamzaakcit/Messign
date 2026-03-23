import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import * as landingDal from '../../dal/marketing/landingPages.js';
import { buildCtx, parsePositiveInt } from './common.js';

const router = Router();

router.post('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    if (!req.body?.name || !req.body?.body_html) {
      res.status(400).json({ error: 'name and body_html are required' });
      return;
    }
    const page = await landingDal.createLandingPage(buildCtx(req), req.body);
    res.status(201).json(page);
  } catch (err) {
    console.error('[marketing/pages POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create landing page' });
  }
});

router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const result = await landingDal.listLandingPages(
      buildCtx(req),
      {
        status: req.query.status as string | undefined,
      },
      parsePositiveInt(req.query.page, 1),
      parsePositiveInt(req.query.pageSize, 20),
    );
    res.json(result);
  } catch (err) {
    console.error('[marketing/pages GET]', err);
    res.status(500).json({ error: 'Failed to list landing pages' });
  }
});

router.get('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const page = await landingDal.getLandingPageById(buildCtx(req), req.params.id);
    if (!page) {
      res.status(404).json({ error: 'Landing page not found' });
      return;
    }
    res.json(page);
  } catch (err) {
    console.error('[marketing/pages/:id GET]', err);
    res.status(500).json({ error: 'Failed to fetch landing page' });
  }
});

router.put('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const page = await landingDal.updateLandingPage(buildCtx(req), req.params.id, req.body);
    res.json(page);
  } catch (err) {
    console.error('[marketing/pages/:id PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update landing page' });
  }
});

export default router;
