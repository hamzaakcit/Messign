import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.js';
import { knowledgeDocumentsRouter } from './documents.js';
import { knowledgeCategoriesRouter } from './categories.js';
import { knowledgeTagsRouter } from './tags.js';
import { knowledgeCollectionsRouter } from './collections.js';
import { knowledgeStatsRouter } from './stats.js';
import { searchDocuments, getRecentActivities, getUserPinnedDocuments, getUnacknowledgedRequired } from '../../db/knowledgeDb.js';
import type { Request } from 'express';

type AuthReq = Request & { userId: string };

const router = Router();

router.use('/documents', knowledgeDocumentsRouter);
router.use('/categories', knowledgeCategoriesRouter);
router.use('/tags', knowledgeTagsRouter);
router.use('/collections', knowledgeCollectionsRouter);
router.use('/stats', knowledgeStatsRouter);

/* ── SEARCH ──────────────────────────────────────── */
router.get('/search', requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthReq).userId;
    const { q, category, tag, fileType, status, sort, page, limit } = req.query;
    if (!q) { res.json({ docs: [], total: 0, page: 1, limit: 20 }); return; }
    const result = await searchDocuments(q as string, {
      categorySlug: category as string,
      tagSlug: tag as string,
      fileType: fileType as string,
      status: (status as string) || 'published',
      sort: (sort as 'recent' | 'popular' | 'alphabetical') || 'recent',
      page: parseInt(page as string) || 1,
      limit: parseInt(limit as string) || 20,
      userId,
    });
    res.json(result);
  } catch (e) {
    console.error('[knowledge/search]', e);
    res.status(500).json({ error: 'Search failed' });
  }
});

/* ── RECENT ACTIVITY ─────────────────────────────── */
router.get('/activities', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const activities = await getRecentActivities(limit);
    res.json(activities);
  } catch (e) {
    console.error('[knowledge/activities]', e);
    res.status(500).json({ error: 'Failed to load activities' });
  }
});

/* ── MY PINNED DOCS ──────────────────────────────── */
router.get('/my-pins', requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthReq).userId;
    const pins = await getUserPinnedDocuments(userId);
    res.json(pins);
  } catch (e) {
    console.error('[knowledge/my-pins]', e);
    res.status(500).json({ error: 'Failed to load pins' });
  }
});

/* ── REQUIRED READING ────────────────────────────── */
router.get('/required-reading', requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthReq).userId;
    const role = (req.query.role as string) || 'employee';
    const docs = await getUnacknowledgedRequired(userId, role);
    res.json(docs);
  } catch (e) {
    console.error('[knowledge/required-reading]', e);
    res.status(500).json({ error: 'Failed to load required reading' });
  }
});

export { router as knowledgeRouter };
