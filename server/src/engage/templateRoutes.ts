import { Router, type Response } from 'express';
import { requireEngageAdmin, requireEngageUser } from './middleware/auth.js';
import { errorFields, logError } from './log.js';
import {
  TemplateConflictError, TemplateInputError, TemplateNotFoundError,
  addTemplateVersion, createTemplate, getTemplate, listTemplates, previewTemplate,
} from './templates/templates.js';
import './types.js';

/**
 * Email templates (WP-14). Tenant users read and preview; tenant admins create templates and new versions. A version
 * is immutable, so a change is always a new version. Preview renders with a real profile of the tenant or sample
 * attributes; it stores and sends nothing.
 */
export const templateRouter = Router();

function fail(res: Response, err: unknown): void {
  if (err instanceof TemplateInputError) return void res.status(400).json({ error: err.message });
  if (err instanceof TemplateNotFoundError) return void res.status(404).json({ error: err.message });
  if (err instanceof TemplateConflictError) return void res.status(409).json({ error: err.message });
  logError('template request failed', errorFields(err));
  res.status(500).json({ error: 'Request failed' });
}

const body = (b: unknown): Record<string, unknown> => (b && typeof b === 'object' && !Array.isArray(b) ? b as Record<string, unknown> : {});
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

templateRouter.get('/', requireEngageUser, async (req, res) => {
  try { res.json({ templates: await listTemplates(req.engageUser!.organizationId) }); } catch (err) { fail(res, err); }
});

templateRouter.get('/:id', requireEngageUser, async (req, res) => {
  try { res.json(await getTemplate(req.engageUser!.organizationId, req.params.id!)); } catch (err) { fail(res, err); }
});

templateRouter.post('/', requireEngageUser, requireEngageAdmin, async (req, res) => {
  const b = body(req.body);
  try {
    const result = await createTemplate(req.engageUser!.organizationId, req.engageUser!.userId, {
      key: str(b.key) ?? '', name: str(b.name) ?? '', subject: str(b.subject) ?? '', html: str(b.html) ?? null, text: str(b.text) ?? null,
    });
    res.status(201).json(result);
  } catch (err) { fail(res, err); }
});

templateRouter.post('/:id/versions', requireEngageUser, requireEngageAdmin, async (req, res) => {
  const b = body(req.body);
  try {
    const version = await addTemplateVersion(req.engageUser!.organizationId, req.engageUser!.userId, req.params.id!, {
      subject: str(b.subject) ?? '', html: str(b.html) ?? null, text: str(b.text) ?? null,
    });
    res.status(201).json({ version });
  } catch (err) { fail(res, err); }
});

templateRouter.post('/:id/preview', requireEngageUser, async (req, res) => {
  const b = body(req.body);
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await previewTemplate(req.engageUser!.organizationId, req.params.id!, {
      version: b.version === undefined ? undefined : Number(b.version),
      profileId: str(b.profileId),
      attributes: b.attributes as Record<string, unknown> | undefined,
      payload: b.payload as Record<string, unknown> | undefined,
    }));
  } catch (err) { fail(res, err); }
});
