import { Router, type Response } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { requireApiKey, requireScope } from './middleware/auth.js';
import { ingestRateLimit } from './rateLimit.js';
import { describeIssues, trackEvents, trackSchema, triggerSchema, upsertFromApi, upsertSchema } from './ingest.js';
import { JourneyTriggerError, triggerApiJourney } from './journeys/engine.js';
import { requestJourneyTick } from './journeys/journeyJob.js';
import { IdentifierConflictError, ProfileInputError } from './profiles.js';
import { openApiDocument } from './openapi.js';
import { errorFields, logError, logInfo } from './log.js';
import './types.js';

/**
 * Ingestion API v1. Every route authenticates with an API key first, then the per-key rate limit, then the scope.
 * Paths contain a colon (`profiles:upsert`), so they are written as regular expressions, not Express params.
 */
export const v1Router = Router();

const ingest = [requireApiKey, ingestRateLimit, requireScope('ingest')];

function parse<S extends ZodTypeAny>(schema: S, body: unknown, res: Response): z.infer<S> | null {
  const r = schema.safeParse(body ?? {});
  if (r.success) return r.data;
  res.status(400).json({ error: 'Invalid request', issues: describeIssues(r.error) });
  return null;
}

v1Router.post(/^\/profiles:upsert$/, ...ingest, async (req, res) => {
  const body = parse(upsertSchema, req.body, res);
  if (!body) return;
  try {
    const orgId = req.engageApiKey!.organizationId;
    const profile = await upsertFromApi(orgId, body);
    logInfo('profile upserted', { organizationId: orgId, consents: body.consents?.length ?? 0 });
    res.setHeader('Cache-Control', 'no-store');
    res.json(profile);
  } catch (err) {
    if (err instanceof ProfileInputError) return void res.status(400).json({ error: err.message });
    if (err instanceof IdentifierConflictError) return void res.status(409).json({ error: err.message });
    logError('profile upsert failed', errorFields(err));
    res.status(500).json({ error: 'Request failed' });
  }
});

v1Router.post(/^\/events:track$/, ...ingest, async (req, res) => {
  const body = parse(trackSchema, req.body, res);
  if (!body) return;
  try {
    const orgId = req.engageApiKey!.organizationId;
    const results = await trackEvents(orgId, body.events);
    const count = (s: string) => results.filter((r) => r.status === s).length;
    const summary = { accepted: count('accepted'), duplicates: count('duplicate'), rejected: count('rejected') };
    logInfo('events tracked', { organizationId: orgId, ...summary });
    if (summary.accepted) requestJourneyTick();
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ...summary, results });
  } catch (err) {
    logError('event tracking failed', errorFields(err));
    res.status(500).json({ error: 'Request failed; it is safe to retry the whole batch' });
  }
});

v1Router.post('/journeys/:key/trigger', requireApiKey, ingestRateLimit, requireScope('journeys:trigger'), async (req, res) => {
  const body = parse(triggerSchema, req.body, res);
  if (!body) return;
  try {
    const orgId = req.engageApiKey!.organizationId;
    const out = await triggerApiJourney(orgId, req.params.key!, {
      externalId: body.external_id, idempotencyKey: body.idempotency_key, payload: body.payload, createIfMissing: body.create_if_missing,
    });
    res.setHeader('Cache-Control', 'no-store');
    if (out.status === 'not_enrolled') return void res.status(200).json({ status: out.status, reason: out.reason });
    if (out.status === 'enrolled') {
      logInfo('journey triggered', { organizationId: orgId, journeyKey: req.params.key, enrollmentId: out.enrollmentId });
      requestJourneyTick();
    }
    res.status(out.status === 'enrolled' ? 202 : 200).json({ status: out.status, enrollment_id: out.enrollmentId, ...(out.status === 'duplicate' ? { duplicate: true } : {}) });
  } catch (err) {
    if (err instanceof JourneyTriggerError) {
      return void res.status(err.code === 'not_found' || err.code === 'profile_not_found' ? 404 : 409).json({ error: err.message });
    }
    if (err instanceof ProfileInputError) return void res.status(400).json({ error: err.message });
    logError('journey trigger failed', errorFields(err));
    res.status(500).json({ error: 'Request failed' });
  }
});

v1Router.get('/openapi.json', requireApiKey, (_req, res) => { res.json(openApiDocument); });

