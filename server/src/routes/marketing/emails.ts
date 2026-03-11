import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import * as emailsDal from '../../dal/marketing/emailCampaigns.js';
import { buildCtx, parsePositiveInt } from './common.js';

const router = Router();

router.post('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    if (!req.body?.name || !req.body?.subject || !req.body?.body_html) {
      res.status(400).json({ error: 'name, subject, and body_html are required' });
      return;
    }
    const emailCampaign = await emailsDal.createEmailCampaign(buildCtx(req), req.body);
    res.status(201).json(emailCampaign);
  } catch (err) {
    console.error('[marketing/emails POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create email campaign' });
  }
});

router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const result = await emailsDal.listEmailCampaigns(
      buildCtx(req),
      {
        status: req.query.status as string | undefined,
        campaignId: req.query.campaignId as string | undefined,
      },
      parsePositiveInt(req.query.page, 1),
      parsePositiveInt(req.query.pageSize, 20),
    );
    res.json(result);
  } catch (err) {
    console.error('[marketing/emails GET]', err);
    res.status(500).json({ error: 'Failed to list email campaigns' });
  }
});

router.get('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const emailCampaign = await emailsDal.getEmailCampaignById(buildCtx(req), req.params.id);
    if (!emailCampaign) {
      res.status(404).json({ error: 'Email campaign not found' });
      return;
    }
    res.json(emailCampaign);
  } catch (err) {
    console.error('[marketing/emails/:id GET]', err);
    res.status(500).json({ error: 'Failed to fetch email campaign' });
  }
});

router.put('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const emailCampaign = await emailsDal.updateEmailCampaign(buildCtx(req), req.params.id, req.body);
    res.json(emailCampaign);
  } catch (err) {
    console.error('[marketing/emails/:id PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update email campaign' });
  }
});

router.post('/:id/send', async (req: ReimbursementRequest, res: Response) => {
  try {
    const emailCampaign = await emailsDal.sendEmailCampaign(buildCtx(req), req.params.id);
    res.json(emailCampaign);
  } catch (err) {
    console.error('[marketing/emails/:id/send POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to send email campaign' });
  }
});

export default router;
