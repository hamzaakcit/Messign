import { Router, Request, Response } from 'express';
import * as db from '../../db/knowledgeV2Db.js';

export const tagsRouter = Router();
type AuthReq = Request & { userId: string };

tagsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const tags = await db.listTags();
    res.json(tags);
  } catch (e) {
    console.error('[kh-tags] list:', e);
    res.status(500).json({ error: 'Failed to list tags' });
  }
});

tagsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const tag = await db.createTag({ ...req.body, createdBy: (req as AuthReq).userId });
    res.status(201).json(tag);
  } catch (e) {
    console.error('[kh-tags] create:', e);
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

tagsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    await db.deleteTag(req.params.id);
    res.status(204).end();
  } catch (e) {
    console.error('[kh-tags] delete:', e);
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});
