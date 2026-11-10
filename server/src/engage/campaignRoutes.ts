import { Router, type Response } from 'express';
import { requireEngageAdmin, requireEngageUser } from './middleware/auth.js';
import { errorFields, logError, logInfo } from './log.js';
import { JourneyConflictError, JourneyInputError } from './journeys/journeys.js';
import { requestJourneyTick } from './journeys/journeyJob.js';
import {
  CampaignInputError, CampaignNotFoundError, CampaignNotReadyError,
  enrollCampaign, getCampaignWithOutcome, getSendReadiness, listCampaigns, previewCampaign, startCampaign,
} from './campaigns/campaigns.js';
import './types.js';

/**
 * One-off campaigns (WP-38, ADR-018): send a template to a segment now. Tenant users read; tenant admins check, start and
 * resume. Starting is one request with an idempotency key: a repeat returns the same campaign and sends nothing twice.
 */
export const campaignRouter = Router();

function fail(res: Response, err: unknown): void {
  if (err instanceof CampaignNotReadyError) return void res.status(409).json({ error: err.message, problems: err.problems });
  if (err instanceof CampaignInputError) return void res.status(400).json({ error: err.message, issues: err.issues });
  if (err instanceof JourneyInputError) return void res.status(400).json({ error: err.message, issues: err.issues });
  if (err instanceof CampaignNotFoundError) return void res.status(404).json({ error: err.message });
  if (err instanceof JourneyConflictError) return void res.status(409).json({ error: err.message });
  logError('campaign request failed', errorFields(err));
  res.status(500).json({ error: 'Request failed' });
}

const body = (b: unknown): Record<string, unknown> => (b && typeof b === 'object' && !Array.isArray(b) ? b as Record<string, unknown> : {});

/** Whether sending is ready for this organization, and if not, why (the send gate would hold or refuse otherwise). */
campaignRouter.get('/readiness', requireEngageUser, async (req, res) => {
  try { res.setHeader('Cache-Control', 'no-store'); res.json(await getSendReadiness(req.engageUser!.organizationId)); } catch (err) { fail(res, err); }
});

/** What a send would do: the audience, the template, the readiness. Nothing is written. */
campaignRouter.post('/preview', requireEngageUser, async (req, res) => {
  const b = body(req.body);
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await previewCampaign(req.engageUser!.organizationId, { templateId: String(b.templateId ?? ''), segmentId: String(b.segmentId ?? '') }));
  } catch (err) { fail(res, err); }
});

campaignRouter.get('/', requireEngageUser, async (req, res) => {
  try { res.setHeader('Cache-Control', 'no-store'); res.json({ campaigns: await listCampaigns(req.engageUser!.organizationId) }); } catch (err) { fail(res, err); }
});

campaignRouter.get('/:id', requireEngageUser, async (req, res) => {
  try { res.setHeader('Cache-Control', 'no-store'); res.json(await getCampaignWithOutcome(req.engageUser!.organizationId, req.params.id!)); } catch (err) { fail(res, err); }
});

/** Starts a campaign: 201 for a new one, 200 with the same campaign for a repeat of the same idempotency key. */
campaignRouter.post('/', requireEngageUser, requireEngageAdmin, async (req, res) => {
  const b = body(req.body);
  const org = req.engageUser!.organizationId;
  try {
    const out = await startCampaign(org, req.engageUser!.userId, {
      name: b.name, templateId: b.templateId, segmentId: b.segmentId, holdoutPercent: b.holdoutPercent, idempotencyKey: b.idempotencyKey,
    });
    if (!out.replayed) {
      logInfo('campaign started', { campaignId: out.campaign.id, matched: out.campaign.matched, enrolled: out.campaign.enrolled, holdoutPercent: out.campaign.holdoutPercent });
      requestJourneyTick();
    }
    res.status(out.replayed ? 200 : 201).json({ campaign: out.campaign, replayed: out.replayed });
  } catch (err) { fail(res, err); }
});

/** Finishes an interrupted send: continues after the cursor; a finished campaign is returned as it is. */
campaignRouter.post('/:id/resume', requireEngageUser, requireEngageAdmin, async (req, res) => {
  try {
    const campaign = await enrollCampaign(req.engageUser!.organizationId, req.params.id!);
    requestJourneyTick();
    res.json({ campaign });
  } catch (err) { fail(res, err); }
});
