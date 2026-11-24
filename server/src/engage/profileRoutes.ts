import { Router } from 'express';
import { requireEngageAdmin, requireEngageUser } from './middleware/auth.js';
import { CustomerExistsError, createCustomer, createCustomerSchema } from './customerEntry.js';
import { describeIssues } from './ingest.js';
import { IdentifierConflictError, ProfileInputError } from './profiles.js';
import { ProfileNotFoundError, getProfile } from './profiles.js';
import { ProfileListInputError, getProfileTrail, listProfiles } from './profileTrail.js';
import { errorFields, logError } from './log.js';
import './types.js';

/**
 * Read access for tenant users. Writes arrive through the ingestion API (WP-08) and CSV import (WP-09);
 * the tenant always comes from the verified token, never from the request.
 */
export const profileRouter = Router();

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

/** Add one customer by hand (admins only). The same writes as the ingestion API; the email consent needs a note (customerEntry.ts). */
profileRouter.post('/', requireEngageUser, requireEngageAdmin, async (req, res) => {
  const parsed = createCustomerSchema.safeParse(req.body ?? {});
  if (!parsed.success) return void res.status(400).json({ error: 'Check the customer details', issues: describeIssues(parsed.error) });
  try {
    res.setHeader('Cache-Control', 'no-store');
    const profile = await createCustomer(req.engageUser!.organizationId, req.engageUser!.userId, parsed.data);
    res.status(201).json(profile);
  } catch (err) {
    if (err instanceof ProfileInputError) return void res.status(400).json({ error: err.message });
    if (err instanceof CustomerExistsError || err instanceof IdentifierConflictError) return void res.status(409).json({ error: err.message });
    logError('manual customer add failed', errorFields(err));
    res.status(500).json({ error: 'Request failed' });
  }
});

/** Customer list (WP-19): newest first, ?q= email or external-id prefix, ?cursor=, ?limit= (1-100). */
profileRouter.get('/', requireEngageUser, async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const limit = str(req.query.limit) ? Number(req.query.limit) : undefined;
    res.json(await listProfiles(req.engageUser!.organizationId, { q: str(req.query.q), cursor: str(req.query.cursor), limit: Number.isFinite(limit) ? limit : undefined }));
  } catch (err) {
    if (err instanceof ProfileListInputError) return void res.status(400).json({ error: err.message });
    logError('profile list failed', errorFields(err));
    res.status(500).json({ error: 'Request failed' });
  }
});

/** Audit trail (WP-19): messages with delivery events and gate decisions (with the consent in force), journeys, consents, suppressions, events. */
profileRouter.get('/:id/trail', requireEngageUser, async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await getProfileTrail(req.engageUser!.organizationId, req.params.id ?? ''));
  } catch (err) {
    if (err instanceof ProfileNotFoundError) return void res.status(404).json({ error: 'Profile not found' });
    logError('profile trail failed', errorFields(err));
    res.status(500).json({ error: 'Request failed' });
  }
});

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
