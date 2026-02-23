import { Router, Request, Response } from 'express';
import * as db from '../../db/knowledgeV2Db.js';
import * as hybrid from '../../db/knowledgeHubHybrid.js';

export const categoriesRouter = Router();

categoriesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const tree = req.query.tree === 'true';
    const categories = await hybrid.listCategories(tree);
    res.json(categories);
  } catch (e) {
    console.error('[kh-categories] list:', e);
    res.status(500).json({ error: 'Failed to list categories' });
  }
});

categoriesRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const cat = await hybrid.getCategoryById(req.params.id);
    if (!cat) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(cat);
  } catch (e) {
    console.error('[kh-categories] get:', e);
    res.status(500).json({ error: 'Failed to get category' });
  }
});

categoriesRouter.get('/:id/documents', async (req: Request, res: Response) => {
  try {
    const cat = await hybrid.getCategoryById(req.params.id);
    if (!cat) { res.status(404).json({ error: 'Not found' }); return; }
    const { page, limit, sort } = req.query;
    const result = await hybrid.listDocuments({
      category: cat.slug,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 20,
      sort: (sort as 'recent' | 'popular' | 'alphabetical' | 'oldest') ?? 'recent',
    });
    res.json(result);
  } catch (e) {
    console.error('[kh-categories] documents:', e);
    res.status(500).json({ error: 'Failed to list category documents' });
  }
});

categoriesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const cat = await db.createCategory(req.body);
    res.status(201).json(cat);
  } catch (e) {
    console.error('[kh-categories] create:', e);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

categoriesRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const cat = await db.updateCategory(req.params.id, req.body);
    res.json(cat);
  } catch (e) {
    console.error('[kh-categories] update:', e);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

categoriesRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    await db.deleteCategory(req.params.id);
    res.status(204).end();
  } catch (e) {
    console.error('[kh-categories] delete:', e);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});
