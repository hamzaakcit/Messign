import { Router, type Response } from 'express';
import { requireEngageAdmin, requireEngageUser } from './middleware/auth.js';
import { errorFields, logError, logInfo } from './log.js';
import {
  JourneyConflictError, JourneyInputError, JourneyNotFoundError,
  activateJourneyVersion, addJourneyVersion, approveJourneyVersion, checkJourneyDefinition, createJourney, deactivateJourney,
  getJourney, listJourneys,
} from './journeys/journeys.js';
import './types.js';

/**
 * Journeys (WP-15). Tenant users read and validate; tenant admins create, publish versions, approve, activate and stop.
 * Every lifecycle step records who and when (the database refuses activation without approval in any case).
 */
export const journeyRouter = Router();

function fail(res: Response, err: unknown): void {
  if (err instanceof JourneyInputError) return void res.status(400).json({ error: err.message, issues: err.issues });
  if (err instanceof JourneyNotFoundError) return void res.status(404).json({ error: err.message });
  if (err instanceof JourneyConflictError) return void res.status(409).json({ error: err.message });
  logError('journey request failed', errorFields(err));
  res.status(500).json({ error: 'Request failed' });
}

const body = (b: unknown): Record<string, unknown> => (b && typeof b === 'object' && !Array.isArray(b) ? b as Record<string, unknown> : {});
const versionParam = (v: string | undefined) => (v && /^[0-9]{1,6}$/.test(v) ? Number(v) : Number.NaN);

journeyRouter.get('/', requireEngageUser, async (req, res) => {
  try { res.json({ journeys: await listJourneys(req.engageUser!.organizationId) }); } catch (err) { fail(res, err); }
});

journeyRouter.post('/validate', requireEngageUser, async (req, res) => {
  try { res.json(await checkJourneyDefinition(req.engageUser!.organizationId, body(req.body).definition)); } catch (err) { fail(res, err); }
});

journeyRouter.get('/:id', requireEngageUser, async (req, res) => {
  try { res.json(await getJourney(req.engageUser!.organizationId, req.params.id!)); } catch (err) { fail(res, err); }
});

journeyRouter.post('/', requireEngageUser, requireEngageAdmin, async (req, res) => {
  const b = body(req.body);
  try {
    const out = await createJourney(req.engageUser!.organizationId, req.engageUser!.userId, {
      key: typeof b.key === 'string' ? b.key : '', name: typeof b.name === 'string' ? b.name : '', definition: b.definition,
    });
    res.status(201).json(out);
  } catch (err) { fail(res, err); }
});

journeyRouter.post('/:id/versions', requireEngageUser, requireEngageAdmin, async (req, res) => {
  try {
    res.status(201).json({ version: await addJourneyVersion(req.engageUser!.organizationId, req.engageUser!.userId, req.params.id!, body(req.body).definition) });
  } catch (err) { fail(res, err); }
});

journeyRouter.post('/:id/versions/:version/approve', requireEngageUser, requireEngageAdmin, async (req, res) => {
  try {
    const v = await approveJourneyVersion(req.engageUser!.organizationId, req.engageUser!.userId, req.params.id!, versionParam(req.params.version));
    logInfo('journey version approved', { journeyId: req.params.id, version: v.version });
    res.json({ version: v });
  } catch (err) { fail(res, err); }
});

journeyRouter.post('/:id/versions/:version/activate', requireEngageUser, requireEngageAdmin, async (req, res) => {
  try {
    const v = await activateJourneyVersion(req.engageUser!.organizationId, req.engageUser!.userId, req.params.id!, versionParam(req.params.version));
    logInfo('journey version activated', { journeyId: req.params.id, version: v.version });
    res.json({ version: v });
  } catch (err) { fail(res, err); }
});

journeyRouter.post('/:id/deactivate', requireEngageUser, requireEngageAdmin, async (req, res) => {
  try {
    const out = await deactivateJourney(req.engageUser!.organizationId, req.engageUser!.userId, req.params.id!);
    logInfo('journey deactivated', { journeyId: req.params.id, retiredVersion: out.retiredVersion });
    res.json(out);
  } catch (err) { fail(res, err); }
});
