import { Router, Request, Response } from 'express';
import { getDashboardTrends, type DashboardMetric, type TrendPeriod } from '../db/performanceDb.js';

const router = Router();

router.get('/trends', async (req: Request, res: Response) => {
  const metric = (req.query.metric as DashboardMetric) || 'revenue';
  const entityId = (req.query.entityId as string) || 'company';
  const range = (req.query.range as TrendPeriod) || '12m';

  const validMetrics: DashboardMetric[] = ['revenue', 'sms', 'mail'];
  const validRanges: TrendPeriod[] = ['7d', '90d', '12m', '3y'];

  if (!validMetrics.includes(metric)) {
    res.status(400).json({ error: 'Invalid metric' });
    return;
  }
  if (!validRanges.includes(range)) {
    res.status(400).json({ error: 'Invalid range' });
    return;
  }

  try {
    const data = await getDashboardTrends(metric, entityId, range);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[dashboard] trends error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch trends' });
  }
});

export const dashboardRouter = router;
