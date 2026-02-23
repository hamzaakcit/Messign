import { Router } from 'express';
import { getTalentHeatmap } from '../../db/analyticsDb.js';
import { requireAdmin } from '../../middleware/adminAuth.js';

const router = Router();

// GET /api/admin/analytics/talent-heatmap - Department activity heatmap (admin only)
router.get('/talent-heatmap', requireAdmin, async (req, res) => {
  try {
    const data = await getTalentHeatmap();
    res.json(data);
  } catch (e) {
    console.error('[admin/analytics] talent-heatmap error:', e);
    res.status(500).json({ error: 'Failed to fetch talent heatmap' });
  }
});

export const adminAnalyticsRouter = router;
