import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import * as campaignDal from '../../dal/marketing/campaigns.js';
import { buildCtx, parseDateRange, parsePositiveInt, parseSort } from './common.js';

const router = Router();

router.post('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    if (!req.body?.name || !req.body?.channel) {
      res.status(400).json({ error: 'Campaign name and channel are required' });
      return;
    }
    const campaign = await campaignDal.createCampaign(buildCtx(req), req.body);
    res.status(201).json(campaign);
  } catch (err) {
    console.error('[marketing/campaigns POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create campaign' });
  }
});

router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const result = await campaignDal.listCampaigns(
      buildCtx(req),
      {
        status: req.query.status as string | undefined,
        channel: req.query.channel as string | undefined,
        ownerId: req.query.ownerId as string | undefined,
        dateRange: parseDateRange(req.query.dateFrom, req.query.dateTo),
        search: req.query.search as string | undefined,
      },
      parseSort(req.query.sortBy, req.query.sortDir, {
        name: 'name',
        channel: 'channel',
        status: 'status',
        budget: 'budget',
        spend: 'spend',
        leads: 'leads',
        roi: 'roi',
        startDate: 'start_date',
      }),
      parsePositiveInt(req.query.page, 1),
      parsePositiveInt(req.query.pageSize, 20),
    );
    res.json(result);
  } catch (err) {
    console.error('[marketing/campaigns GET]', err);
    res.status(500).json({ error: 'Failed to list campaigns' });
  }
});

router.get('/metrics', async (req: ReimbursementRequest, res: Response) => {
  try {
    const metrics = await campaignDal.getCampaignMetrics(buildCtx(req), req.query.period as string | undefined);
    res.json(metrics);
  } catch (err) {
    console.error('[marketing/campaigns/metrics GET]', err);
    res.status(500).json({ error: 'Failed to get campaign metrics' });
  }
});

router.get('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const campaign = await campaignDal.getCampaignById(buildCtx(req), req.params.id);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    res.json(campaign);
  } catch (err) {
    console.error('[marketing/campaigns/:id GET]', err);
    res.status(500).json({ error: 'Failed to fetch campaign' });
  }
});

router.put('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const campaign = await campaignDal.updateCampaign(buildCtx(req), req.params.id, req.body);
    res.json(campaign);
  } catch (err) {
    console.error('[marketing/campaigns/:id PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update campaign' });
  }
});

router.post('/:id/launch', async (req: ReimbursementRequest, res: Response) => {
  try {
    const campaign = await campaignDal.launchCampaign(buildCtx(req), req.params.id);
    res.json(campaign);
  } catch (err) {
    console.error('[marketing/campaigns/:id/launch POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to launch campaign' });
  }
});

router.post('/:id/pause', async (req: ReimbursementRequest, res: Response) => {
  try {
    const campaign = await campaignDal.pauseCampaign(buildCtx(req), req.params.id, req.body?.reason);
    res.json(campaign);
  } catch (err) {
    console.error('[marketing/campaigns/:id/pause POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to pause campaign' });
  }
});

router.post('/:id/complete', async (req: ReimbursementRequest, res: Response) => {
  try {
    const campaign = await campaignDal.completeCampaign(buildCtx(req), req.params.id);
    res.json(campaign);
  } catch (err) {
    console.error('[marketing/campaigns/:id/complete POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to complete campaign' });
  }
});

router.post('/:id/spend', async (req: ReimbursementRequest, res: Response) => {
  try {
    if (req.body?.amount == null || !req.body?.date) {
      res.status(400).json({ error: 'Spend amount and date are required' });
      return;
    }
    const spend = await campaignDal.recordSpend(buildCtx(req), req.params.id, req.body);
    res.status(201).json(spend);
  } catch (err) {
    console.error('[marketing/campaigns/:id/spend POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to record spend' });
  }
});

router.get('/:id/spend', async (req: ReimbursementRequest, res: Response) => {
  try {
    const spend = await campaignDal.listSpendEntries(buildCtx(req), req.params.id);
    res.json(spend);
  } catch (err) {
    console.error('[marketing/campaigns/:id/spend GET]', err);
    res.status(500).json({ error: 'Failed to list spend entries' });
  }
});

export default router;
