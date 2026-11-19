import { Router, type Response } from 'express';
import { requireEngageAdmin, requireEngageUser } from './middleware/auth.js';
import { errorFields, logError } from './log.js';
import {
  CopyDraftBudgetError, CopyDraftConflictError, CopyDraftInputError, CopyDraftNotFoundError, CopyDraftPolicyError,
  CopyDraftRejectedError, CopyDraftUnavailableError, approveCopyDraft, createCopyDraft, getCopyDraft, listCopyDrafts,
  rejectCopyDraft, type CopyDraftStatus,
} from './copy/copyDraft.js';
import './types.js';

/**
 * AI copy drafts (WP-24). Tenant users read the approval queue. Tenant admins request a draft for a message step, and
 * approve or reject it. A draft sends nothing; approval only adds a template version. Error bodies carry codes and
 * counts, never the copy or the brief.
 */
export const copyDraftRouter = Router();

function fail(res: Response, err: unknown): void {
  if (err instanceof CopyDraftInputError) return void res.status(400).json({ error: err.message });
  if (err instanceof CopyDraftNotFoundError) return void res.status(404).json({ error: err.message });
  if (err instanceof CopyDraftConflictError) return void res.status(409).json({ error: err.message });
  if (err instanceof CopyDraftRejectedError) return void res.status(422).json({ error: err.message, reasons: err.reasons });
  if (err instanceof CopyDraftPolicyError) return void res.status(422).json({ error: err.message });
  if (err instanceof CopyDraftBudgetError) return void res.status(402).json({ error: err.message });
  if (err instanceof CopyDraftUnavailableError) return void res.status(502).json({ error: err.message });
  logError('copy draft request failed', errorFields(err));
  res.status(500).json({ error: 'Request failed' });
}

const body = (b: unknown): Record<string, unknown> => (b && typeof b === 'object' && !Array.isArray(b) ? b as Record<string, unknown> : {});
const STATUSES: readonly CopyDraftStatus[] = ['pending', 'approved', 'rejected'];

copyDraftRouter.get('/', requireEngageUser, async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  if (status !== undefined && !(STATUSES as readonly string[]).includes(status)) return void res.status(400).json({ error: 'status must be pending, approved or rejected' });
  try { res.json({ drafts: await listCopyDrafts(req.engageUser!.organizationId, status as CopyDraftStatus | undefined) }); } catch (err) { fail(res, err); }
});

copyDraftRouter.get('/:id', requireEngageUser, async (req, res) => {
  try { res.json({ draft: await getCopyDraft(req.engageUser!.organizationId, req.params.id!) }); } catch (err) { fail(res, err); }
});

/** Asks for a draft for one message step of a journey. Returns the pending draft, or a refusal with reason codes. */
copyDraftRouter.post('/', requireEngageUser, requireEngageAdmin, async (req, res) => {
  const b = body(req.body);
  try {
    const out = await createCopyDraft(req.engageUser!.organizationId, req.engageUser!.userId, {
      journeyId: b.journeyId, stepId: b.stepId, brief: b.brief, language: b.language,
    });
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json(out);
  } catch (err) { fail(res, err); }
});

copyDraftRouter.post('/:id/approve', requireEngageUser, requireEngageAdmin, async (req, res) => {
  try { res.json(await approveCopyDraft(req.engageUser!.organizationId, req.engageUser!.userId, req.params.id!)); } catch (err) { fail(res, err); }
});

copyDraftRouter.post('/:id/reject', requireEngageUser, requireEngageAdmin, async (req, res) => {
  try { res.json({ draft: await rejectCopyDraft(req.engageUser!.organizationId, req.engageUser!.userId, req.params.id!) }); } catch (err) { fail(res, err); }
});
