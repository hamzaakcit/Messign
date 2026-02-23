import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireAdmin } from '../../middleware/adminAuth.js';
import { listCategories, createCategory, updateCategory, deleteCategory, getCategoryById } from '../../db/knowledgeDb.js';

const router = Router();

router.get('/', requireAuth, async (_req, res) => {
  try {
    const categories = await listCategories();
    res.json(categories);
  } catch (e) {
    console.error('[knowledge/categories] list', e);
    res.status(500).json({ error: 'Failed to list categories' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, icon, color, sortOrder } = req.body;
    if (!name) { res.status(400).json({ error: 'Name is required' }); return; }
    const cat = await createCategory({ name, icon, color, sortOrder });
    res.status(201).json(cat);
  } catch (e: any) {
    console.error('[knowledge/categories] create', e);
    if (e.code === '23505') { res.status(409).json({ error: 'Category already exists' }); return; }
    res.status(500).json({ error: 'Failed to create category' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { name, slug, icon, color, sortOrder } = req.body;
    const existing = await getCategoryById(req.params.id);
    if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
    const updated = await updateCategory(req.params.id, { name, slug, icon, color, sortOrder });
    res.json(updated);
  } catch (e) {
    console.error('[knowledge/categories] update', e);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const existing = await getCategoryById(req.params.id);
    if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
    await deleteCategory(req.params.id);
    res.json({ success: true });
  } catch (e) {
    console.error('[knowledge/categories] delete', e);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

export { router as knowledgeCategoriesRouter };
