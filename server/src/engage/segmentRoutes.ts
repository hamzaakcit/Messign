import { Router, type Response } from 'express';
import { requireEngageAdmin, requireEngageUser } from './middleware/auth.js';
import { errorFields, logError } from './log.js';
import {
  SegmentConflictError, SegmentInputError, SegmentNotFoundError,
  addSegmentVersion, countSegmentVersion, createSegment, getSegment, listSegments, previewSegment,
} from './segments/segments.js';
import './types.js';

/**
 * Segments (WP-36). Tenant users read, preview and count; tenant admins create segments and publish versions. A segment
 * never sends anything: a journey pins a version of it, and that journey is approved (ADR-011) before anyone is enrolled.
 */
export const segmentRouter = Router();

function fail(res: Response, err: unknown): void {
  if (err instanceof SegmentInputError) return void res.status(400).json({ error: err.message, issues: err.issues });
  if (err instanceof SegmentNotFoundError) return void res.status(404).json({ error: err.message });
  if (err instanceof SegmentConflictError) return void res.status(409).json({ error: err.message });
  logError('segment request failed', errorFields(err));
  res.status(500).json({ error: 'Request failed' });
}

const body = (b: unknown): Record<string, unknown> => (b && typeof b === 'object' && !Array.isArray(b) ? b as Record<string, unknown> : {});
const versionParam = (v: string | undefined) => (v && /^[0-9]{1,6}$/.test(v) ? Number(v) : Number.NaN);

segmentRouter.get('/', requireEngageUser, async (req, res) => {
  try { res.json({ segments: await listSegments(req.engageUser!.organizationId) }); } catch (err) { fail(res, err); }
});

/** How many customers a definition matches right now, and a few of them. Stores nothing. */
segmentRouter.post('/preview', requireEngageUser, async (req, res) => {
  try { res.setHeader('Cache-Control', 'no-store'); res.json(await previewSegment(req.engageUser!.organizationId, body(req.body).definition)); } catch (err) { fail(res, err); }
});

segmentRouter.get('/:id', requireEngageUser, async (req, res) => {
  try { res.json(await getSegment(req.engageUser!.organizationId, req.params.id!)); } catch (err) { fail(res, err); }
});

segmentRouter.get('/:id/versions/:version/count', requireEngageUser, async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await countSegmentVersion(req.engageUser!.organizationId, req.params.id!, versionParam(req.params.version)));
  } catch (err) { fail(res, err); }
});

segmentRouter.post('/', requireEngageUser, requireEngageAdmin, async (req, res) => {
  const b = body(req.body);
  try {
    res.status(201).json(await createSegment(req.engageUser!.organizationId, req.engageUser!.userId, {
      key: typeof b.key === 'string' ? b.key : '', name: typeof b.name === 'string' ? b.name : '', definition: b.definition,
    }));
  } catch (err) { fail(res, err); }
});

segmentRouter.post('/:id/versions', requireEngageUser, requireEngageAdmin, async (req, res) => {
  try {
    res.status(201).json({ version: await addSegmentVersion(req.engageUser!.organizationId, req.engageUser!.userId, req.params.id!, body(req.body).definition) });
  } catch (err) { fail(res, err); }
});
