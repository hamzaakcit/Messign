import { Router, Request, Response } from 'express';
import {
  getCompanyPerformance,
  getCompanyTrends,
  getTeamPerformance,
  getTeamTrends,
  type TrendPeriod,
} from '../db/performanceDb.js';

const router = Router();

router.get('/company', async (_req: Request, res: Response) => {
  const data = await getCompanyPerformance();
  res.json({ success: true, data });
});

router.get('/company/trends', async (req: Request, res: Response) => {
  const period = (req.query.period as TrendPeriod) || '12m';
  const data = await getCompanyTrends(period);
  res.json({ success: true, data });
});

router.get('/teams/:teamId', async (req: Request, res: Response) => {
  const { teamId } = req.params;
  const data = await getTeamPerformance(teamId);
  if (!data) {
    res.status(404).json({ success: false, error: 'Team not found' });
    return;
  }
  res.json({ success: true, data });
});

router.get('/teams/:teamId/members', async (req: Request, res: Response) => {
  const { teamId } = req.params;
  const team = await getTeamPerformance(teamId);
  if (!team) {
    res.status(404).json({ success: false, error: 'Team not found' });
    return;
  }
  res.json({ success: true, data: { members: team.members } });
});

router.get('/teams/:teamId/trends', async (req: Request, res: Response) => {
  const { teamId } = req.params;
  const period = (req.query.period as TrendPeriod) || '12m';
  const data = await getTeamTrends(teamId, period);
  res.json({ success: true, data });
});

export const performanceRouter = router;
