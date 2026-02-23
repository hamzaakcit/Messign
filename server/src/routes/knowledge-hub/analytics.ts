import { Router, Request, Response } from 'express';
import * as db from '../../db/knowledgeV2Db.js';
import { detectStaleContent } from '../../services/knowledgeStaleDetector.js';

export const analyticsRouter = Router();

analyticsRouter.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await db.getOverallStats();
    res.json(stats);
  } catch (e) {
    console.error('[kh-analytics] stats:', e);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

analyticsRouter.get('/content-health', async (_req: Request, res: Response) => {
  try {
    const health = await db.getContentHealth();
    res.json(health);
  } catch (e) {
    console.error('[kh-analytics] health:', e);
    res.status(500).json({ error: 'Failed to get content health' });
  }
});

analyticsRouter.get('/top-searches', async (req: Request, res: Response) => {
  try {
    const days = req.query.days ? parseInt(req.query.days as string) : 30;
    const searches = await db.getTopSearches(days);
    res.json(searches);
  } catch (e) {
    console.error('[kh-analytics] top-searches:', e);
    res.status(500).json({ error: 'Failed to get top searches' });
  }
});

analyticsRouter.get('/failed-searches', async (req: Request, res: Response) => {
  try {
    const days = req.query.days ? parseInt(req.query.days as string) : 30;
    const searches = await db.getFailedSearches(days);
    res.json(searches);
  } catch (e) {
    console.error('[kh-analytics] failed-searches:', e);
    res.status(500).json({ error: 'Failed to get failed searches' });
  }
});

analyticsRouter.get('/top-contributors', async (req: Request, res: Response) => {
  try {
    const days = req.query.days ? parseInt(req.query.days as string) : 30;
    const contributors = await db.getTopContributors(days);
    res.json(contributors);
  } catch (e) {
    console.error('[kh-analytics] contributors:', e);
    res.status(500).json({ error: 'Failed to get contributors' });
  }
});

analyticsRouter.get('/view-trends', async (req: Request, res: Response) => {
  try {
    const days = req.query.days ? parseInt(req.query.days as string) : 30;
    const trends = await db.getViewTrends(days);
    res.json(trends);
  } catch (e) {
    console.error('[kh-analytics] view-trends:', e);
    res.status(500).json({ error: 'Failed to get view trends' });
  }
});

analyticsRouter.post('/detect-stale', async (req: Request, res: Response) => {
  try {
    const threshold = req.body?.thresholdDays ?? 180;
    const result = await detectStaleContent(threshold);
    res.json(result);
  } catch (e) {
    console.error('[kh-analytics] detect-stale:', e);
    res.status(500).json({ error: 'Failed to detect stale content' });
  }
});
