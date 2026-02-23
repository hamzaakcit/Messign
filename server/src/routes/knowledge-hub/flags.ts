import { Router, Request, Response } from 'express';
import * as db from '../../db/knowledgeV2Db.js';

export const flagsRouter = Router();
type AuthReq = Request & { userId: string };

flagsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const resolved = req.query.resolved === 'true';
    const flags = await db.listContentFlags(resolved);
    res.json(flags);
  } catch (e) {
    console.error('[kh-flags] list:', e);
    res.status(500).json({ error: 'Failed to list flags' });
  }
});

flagsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const flag = await db.createContentFlag({ ...req.body, flaggedBy: (req as AuthReq).userId });
    res.status(201).json(flag);
  } catch (e) {
    console.error('[kh-flags] create:', e);
    res.status(500).json({ error: 'Failed to create flag' });
  }
});

flagsRouter.post('/:id/resolve', async (req: Request, res: Response) => {
  try {
    await db.resolveContentFlag(req.params.id, (req as AuthReq).userId);
    res.json({ ok: true });
  } catch (e) {
    console.error('[kh-flags] resolve:', e);
    res.status(500).json({ error: 'Failed to resolve flag' });
  }
});
