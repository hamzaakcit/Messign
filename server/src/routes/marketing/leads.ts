import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import * as leadsDal from '../../dal/marketing/leads.js';
import * as metricsDal from '../../dal/marketing/metrics.js';
import { buildCtx, parseOptionalNumber, parsePositiveInt, parseSort } from './common.js';

const router = Router();

router.post('/capture', async (req: ReimbursementRequest, res: Response) => {
  try {
    if (!req.body?.email || !req.body?.source) {
      res.status(400).json({ error: 'Lead email and source are required' });
      return;
    }
    const lead = await leadsDal.captureLead(buildCtx(req), req.body);
    res.status(201).json(lead);
  } catch (err) {
    console.error('[marketing/leads/capture POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to capture lead' });
  }
});

router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const result = await leadsDal.listLeads(
      buildCtx(req),
      {
        status: req.query.status as string | undefined,
        scoreMin: parseOptionalNumber(req.query.scoreMin),
        scoreMax: parseOptionalNumber(req.query.scoreMax),
        source: req.query.source as string | undefined,
        campaignId: req.query.campaignId as string | undefined,
        search: req.query.search as string | undefined,
      },
      parseSort(req.query.sortBy, req.query.sortDir, {
        email: 'email',
        score: 'score',
        status: 'status',
        source: 'source',
        lastActivity: 'last_activity_at',
      }),
      parsePositiveInt(req.query.page, 1),
      parsePositiveInt(req.query.pageSize, 20),
    );
    res.json(result);
  } catch (err) {
    console.error('[marketing/leads GET]', err);
    res.status(500).json({ error: 'Failed to list leads' });
  }
});

router.get('/hot', async (req: ReimbursementRequest, res: Response) => {
  try {
    const leads = await leadsDal.getHotLeads(buildCtx(req));
    res.json(leads);
  } catch (err) {
    console.error('[marketing/leads/hot GET]', err);
    res.status(500).json({ error: 'Failed to list hot leads' });
  }
});

router.get('/funnel', async (req: ReimbursementRequest, res: Response) => {
  try {
    const funnel = await metricsDal.getLeadFunnel(buildCtx(req), req.query.period as string | undefined);
    res.json(funnel);
  } catch (err) {
    console.error('[marketing/leads/funnel GET]', err);
    res.status(500).json({ error: 'Failed to load lead funnel' });
  }
});

router.get('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const lead = await leadsDal.getLeadById(buildCtx(req), req.params.id);
    if (!lead) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }
    res.json(lead);
  } catch (err) {
    console.error('[marketing/leads/:id GET]', err);
    res.status(500).json({ error: 'Failed to fetch lead' });
  }
});

router.put('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const lead = await leadsDal.updateLead(buildCtx(req), req.params.id, req.body);
    res.json(lead);
  } catch (err) {
    console.error('[marketing/leads/:id PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update lead' });
  }
});

router.post('/:id/score', async (req: ReimbursementRequest, res: Response) => {
  try {
    if (!req.body?.signal) {
      res.status(400).json({ error: 'signal is required' });
      return;
    }
    const lead = await leadsDal.scoreLead(buildCtx(req), req.params.id, req.body.signal);
    res.json(lead);
  } catch (err) {
    console.error('[marketing/leads/:id/score POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to score lead' });
  }
});

router.post('/:id/qualify', async (req: ReimbursementRequest, res: Response) => {
  try {
    const lead = await leadsDal.qualifyLead(buildCtx(req), req.params.id);
    res.json(lead);
  } catch (err) {
    console.error('[marketing/leads/:id/qualify POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to qualify lead' });
  }
});

router.post('/:id/convert', async (req: ReimbursementRequest, res: Response) => {
  try {
    const result = await leadsDal.convertLeadToCRM(buildCtx(req), req.params.id);
    res.json(result);
  } catch (err) {
    console.error('[marketing/leads/:id/convert POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to convert lead to CRM' });
  }
});

export default router;
