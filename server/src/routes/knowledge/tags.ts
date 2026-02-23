import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireAdmin } from '../../middleware/adminAuth.js';
import { listTags, createTag } from '../../db/knowledgeDb.js';

const router = Router();

router.get('/', requireAuth, async (_req, res) => {
  try {
    const tags = await listTags();
    res.json(tags);
  } catch (e) {
    console.error('[knowledge/tags] list', e);
    res.status(500).json({ error: 'Failed to list tags' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: 'Name is required' }); return; }
    const tag = await createTag(name);
    res.status(201).json(tag);
  } catch (e) {
    console.error('[knowledge/tags] create', e);
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

export { router as knowledgeTagsRouter };
