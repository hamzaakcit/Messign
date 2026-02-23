import { Router, Request, Response } from 'express';
import * as db from '../../db/knowledgeV2Db.js';

export const versionsRouter = Router();
type AuthReq = Request & { userId: string };

versionsRouter.get('/:documentId', async (req: Request, res: Response) => {
  try {
    const versions = await db.listVersions(req.params.documentId);
    res.json(versions);
  } catch (e) {
    console.error('[kh-versions] list:', e);
    res.status(500).json({ error: 'Failed to list versions' });
  }
});

versionsRouter.get('/:documentId/:versionNumber', async (req: Request, res: Response) => {
  try {
    const version = await db.getVersion(req.params.documentId, parseInt(req.params.versionNumber));
    if (!version) { res.status(404).json({ error: 'Version not found' }); return; }
    res.json(version);
  } catch (e) {
    console.error('[kh-versions] get:', e);
    res.status(500).json({ error: 'Failed to get version' });
  }
});

versionsRouter.post('/:documentId/:versionNumber/restore', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthReq).userId;
    const version = await db.getVersion(req.params.documentId, parseInt(req.params.versionNumber));
    if (!version) { res.status(404).json({ error: 'Version not found' }); return; }

    const doc = await db.updateDocument(req.params.documentId, {
      content: version.content,
      plainText: version.plain_text ?? undefined,
    });

    await db.createVersion(req.params.documentId, version.content, version.plain_text, userId, `Restored from v${version.version_number}`);
    await db.logAudit({ userId, action: 'version_restore', entityType: 'document', entityId: req.params.documentId, details: { restoredFrom: version.version_number } });

    res.json(doc);
  } catch (e) {
    console.error('[kh-versions] restore:', e);
    res.status(500).json({ error: 'Failed to restore version' });
  }
});
