import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import * as documentsDal from '../../dal/marketing/documents.js';
import { buildCtx, parsePositiveInt } from './common.js';

const router = Router();

router.post('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    if (!req.body?.name || !req.body?.body_html) {
      res.status(400).json({ error: 'name and body_html are required' });
      return;
    }
    const doc = await documentsDal.createMarketingDocument(buildCtx(req), req.body);
    res.status(201).json(doc);
  } catch (err) {
    console.error('[marketing/documents POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create document' });
  }
});

router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const result = await documentsDal.listMarketingDocuments(
      buildCtx(req),
      {
        status: req.query.status as string | undefined,
      },
      parsePositiveInt(req.query.page, 1),
      parsePositiveInt(req.query.pageSize, 20),
    );
    res.json(result);
  } catch (err) {
    console.error('[marketing/documents GET]', err);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

router.get('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const doc = await documentsDal.getMarketingDocumentById(buildCtx(req), req.params.id);
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    res.json(doc);
  } catch (err) {
    console.error('[marketing/documents/:id GET]', err);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

router.put('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const doc = await documentsDal.updateMarketingDocument(buildCtx(req), req.params.id, req.body);
    res.json(doc);
  } catch (err) {
    console.error('[marketing/documents/:id PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update document' });
  }
});

export default router;
