import express, { Router } from 'express';
import { requireEngageAdmin, requireEngageUser } from '../middleware/auth.js';
import { errorFields, logError } from '../log.js';
import { enqueueImport } from './importJob.js';
import { IMPORT_KINDS, ImportInputError, ImportNotFoundError, MAX_CSV_BYTES, createImport, getImport, listImports, type ImportKind } from './run.js';
import '../types.js';

/**
 * Tenant admins upload a CSV and read back the outcome. The file is processed by a queue job; the response to the
 * upload is 202 with an id to poll. The body is only read after the caller is authenticated and an admin.
 */
export const importRouter = Router();
const csvBody = express.text({ type: ['text/csv', 'text/plain', 'application/csv'], limit: MAX_CSV_BYTES });

importRouter.post('/', requireEngageUser, requireEngageAdmin, csvBody, async (req, res) => {
  const kind = String(req.query.kind ?? '') as ImportKind;
  const dryRun = req.query.dry_run === '1' || req.query.dry_run === 'true';
  if (!IMPORT_KINDS.includes(kind)) return void res.status(400).json({ error: 'kind must be profiles or orders' });
  if (typeof req.body !== 'string' || req.body.length === 0) return void res.status(400).json({ error: 'Send the CSV as the request body with Content-Type: text/csv' });
  try {
    const u = req.engageUser!;
    const id = await createImport(u.organizationId, u.userId, kind, dryRun, req.body);
    if (!(await enqueueImport(u.organizationId, id))) return void res.status(503).json({ error: 'The job queue is not available; try again shortly', id });
    res.status(202).json({ id, status: 'queued', kind, dryRun });
  } catch (err) {
    if (err instanceof ImportInputError) return void res.status(400).json({ error: err.message });
    logError('import upload failed', errorFields(err));
    res.status(500).json({ error: 'Request failed' });
  }
});

importRouter.get('/', requireEngageUser, requireEngageAdmin, async (req, res) => {
  try {
    res.json({ imports: await listImports(req.engageUser!.organizationId) });
  } catch (err) {
    logError('import list failed', errorFields(err));
    res.status(500).json({ error: 'Request failed' });
  }
});

importRouter.get('/:id', requireEngageUser, requireEngageAdmin, async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await getImport(req.engageUser!.organizationId, req.params.id ?? ''));
  } catch (err) {
    if (err instanceof ImportNotFoundError) return void res.status(404).json({ error: 'Import not found' });
    logError('import read failed', errorFields(err));
    res.status(500).json({ error: 'Request failed' });
  }
});
