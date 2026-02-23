import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireAdmin } from '../../middleware/adminAuth.js';
import {
  listCollections, createCollection, updateCollection, deleteCollection,
  getCollectionByShareToken, getCollectionById, getCollectionDocuments, logActivity,
} from '../../db/knowledgeDb.js';
import type { Request } from 'express';

type AuthReq = Request & { userId: string };

const router = Router();

/* Public share link access — must be BEFORE requireAuth routes */
router.get('/share/:shareToken', async (req, res) => {
  try {
    const col = await getCollectionByShareToken(req.params.shareToken);
    if (!col) { res.status(404).json({ error: 'Collection not found' }); return; }
    res.json(col);
  } catch (e) {
    console.error('[knowledge/collections] share', e);
    res.status(500).json({ error: 'Failed to load collection' });
  }
});

router.get('/', requireAuth, async (_req, res) => {
  try {
    const collections = await listCollections();
    res.json(collections);
  } catch (e) {
    console.error('[knowledge/collections] list', e);
    res.status(500).json({ error: 'Failed to list collections' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const col = await getCollectionById(req.params.id);
    if (!col) { res.status(404).json({ error: 'Not found' }); return; }
    const docs = await getCollectionDocuments(req.params.id);
    res.json({ ...col, documents: docs });
  } catch (e) {
    console.error('[knowledge/collections] get', e);
    res.status(500).json({ error: 'Failed to load collection' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const userId = (req as AuthReq).userId;
    const { name, description, coverImage, isPublic, documentIds } = req.body;
    if (!name) { res.status(400).json({ error: 'Name is required' }); return; }
    const col = await createCollection({ name, description, coverImage, isPublic, documentIds, createdBy: userId });
    await logActivity('collection_created', userId, undefined, col?.id);
    res.status(201).json(col);
  } catch (e) {
    console.error('[knowledge/collections] create', e);
    res.status(500).json({ error: 'Failed to create collection' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const userId = (req as AuthReq).userId;
    const existing = await getCollectionById(req.params.id);
    if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
    const { name, description, coverImage, isPublic, documentIds } = req.body;
    const updated = await updateCollection(req.params.id, { name, description, coverImage, isPublic, documentIds });
    await logActivity('collection_updated', userId, undefined, req.params.id);
    res.json(updated);
  } catch (e) {
    console.error('[knowledge/collections] update', e);
    res.status(500).json({ error: 'Failed to update collection' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const userId = (req as AuthReq).userId;
    const existing = await getCollectionById(req.params.id);
    if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
    await deleteCollection(req.params.id);
    await logActivity('collection_deleted', userId, undefined, req.params.id);
    res.json({ success: true });
  } catch (e) {
    console.error('[knowledge/collections] delete', e);
    res.status(500).json({ error: 'Failed to delete collection' });
  }
});

export { router as knowledgeCollectionsRouter };
