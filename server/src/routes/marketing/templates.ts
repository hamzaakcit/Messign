import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import { buildCtx, parsePositiveInt } from './common.js';
import * as emailTemplatesDal from '../../dal/marketing/emailTemplates.js';

const router = Router();

/** POST /templates — save a new email template */
router.post('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    const { name, category, description, theme, section_types, manifest_json } = req.body ?? {};

    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    if (typeof theme !== 'string' || !theme.trim()) {
      res.status(400).json({ error: 'theme is required' });
      return;
    }
    if (!manifest_json || typeof manifest_json !== 'object') {
      res.status(400).json({ error: 'manifest_json is required' });
      return;
    }

    const template = await emailTemplatesDal.createEmailTemplate(ctx, {
      name: name.trim(),
      category: typeof category === 'string' ? category.trim() : 'custom',
      description: typeof description === 'string' ? description : undefined,
      theme: theme.trim(),
      section_types: Array.isArray(section_types) ? section_types.filter((s): s is string => typeof s === 'string') : [],
      manifest_json,
    });

    res.status(201).json(template);
  } catch (err) {
    console.error('[marketing/templates POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to save template' });
  }
});

/** GET /templates — list email templates */
router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const page = parsePositiveInt(req.query.page, 1);
    const pageSize = parsePositiveInt(req.query.pageSize, 20);

    const result = await emailTemplatesDal.listEmailTemplates(ctx, { category }, page, pageSize);
    res.json(result);
  } catch (err) {
    console.error('[marketing/templates GET]', err);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

/** POST /templates/:templateId/use — load template manifest and bump usage count */
router.post('/:templateId/use', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    const result = await emailTemplatesDal.useEmailTemplate(ctx, req.params.templateId);
    if (!result) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json(result);
  } catch (err) {
    console.error('[marketing/templates/:id/use POST]', err);
    res.status(500).json({ error: 'Failed to use template' });
  }
});

/** DELETE /templates/:templateId — delete a template */
router.delete('/:templateId', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    const deleted = await emailTemplatesDal.deleteEmailTemplate(ctx, req.params.templateId);
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Template not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[marketing/templates/:id DELETE]', err);
    res.status(500).json({ success: false, error: 'Failed to delete template' });
  }
});

export default router;
