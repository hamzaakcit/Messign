import { Router } from 'express';
import { requireAdmin } from '../../middleware/adminAuth.js';
import { getKnowledgeStats } from '../../db/knowledgeDb.js';

const router = Router();

router.get('/', requireAdmin, async (_req, res) => {
  try {
    const stats = await getKnowledgeStats();
    res.json(stats);
  } catch (e) {
    console.error('[knowledge/stats] get', e);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

export { router as knowledgeStatsRouter };
