import { Router } from 'express';
import { requireEngageUser } from './middleware/auth.js';
import { ProfileNotFoundError, getProfile } from './profiles.js';
import { errorFields, logError } from './log.js';
import './types.js';

/**
 * Read access for tenant users. Writes arrive through the ingestion API (WP-08) and CSV import (WP-09);
 * the tenant always comes from the verified token, never from the request.
 */
export const profileRouter = Router();

profileRouter.get('/:id', requireEngageUser, async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await getProfile(req.engageUser!.organizationId, req.params.id ?? ''));
  } catch (err) {
    if (err instanceof ProfileNotFoundError) return void res.status(404).json({ error: 'Profile not found' });
    logError('profile request failed', errorFields(err));
    res.status(500).json({ error: 'Request failed' });
  }
});
