import { Router } from 'express';
import type { Response } from 'express';
import * as support from '../../dal/support/index.js';
import { requireRole, type ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import { buildCtx } from './common.js';

const router = Router();

router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const categories = await support.admin.listCategories(buildCtx(req), includeInactive);
    res.json(categories);
  } catch (err) {
    console.error('[support/categories GET]', err);
    res.status(500).json({ error: 'Failed to list support categories' });
  }
});

router.post('/', requireRole('admin', 'finance', 'manager'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    if (!body.name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const category = await support.admin.createCategory(buildCtx(req), {
      name: String(body.name),
      parent_id: (body.parent_id as string | null | undefined) ?? (body.parentId as string | null | undefined),
      description: body.description as string | null | undefined,
      auto_assign_to: (body.auto_assign_to as string | null | undefined) ?? (body.autoAssignTo as string | null | undefined),
      default_priority: ((body.default_priority as string | undefined) ?? body.defaultPriority) as support.admin.CreateSupportCategoryInput['default_priority'],
      is_active: body.is_active == null && body.isActive == null
        ? undefined
        : Boolean((body.is_active as boolean | undefined) ?? body.isActive),
    });
    res.status(201).json(category);
  } catch (err) {
    console.error('[support/categories POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create support category' });
  }
});

router.put('/:id', requireRole('admin', 'finance', 'manager'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const category = await support.admin.updateCategory(buildCtx(req), req.params.id, {
      name: body.name as string | undefined,
      parent_id: (body.parent_id as string | null | undefined) ?? (body.parentId as string | null | undefined),
      description: body.description as string | null | undefined,
      auto_assign_to: (body.auto_assign_to as string | null | undefined) ?? (body.autoAssignTo as string | null | undefined),
      default_priority: ((body.default_priority as string | undefined) ?? body.defaultPriority) as support.admin.UpdateSupportCategoryInput['default_priority'],
      is_active: body.is_active == null && body.isActive == null
        ? undefined
        : Boolean((body.is_active as boolean | undefined) ?? body.isActive),
    });
    res.json(category);
  } catch (err) {
    console.error('[support/categories/:id PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update support category' });
  }
});

router.delete('/:id', requireRole('admin', 'finance', 'manager'), async (req: ReimbursementRequest, res: Response) => {
  try {
    await support.admin.deleteCategory(buildCtx(req), req.params.id);
    res.status(204).send();
  } catch (err) {
    console.error('[support/categories/:id DELETE]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to delete support category' });
  }
});

export default router;
