import { Router, Request, Response } from 'express';
import * as db from '../../db/knowledgeV2Db.js';

export const bookmarksRouter = Router();
type AuthReq = Request & { userId: string };

bookmarksRouter.get('/', async (req: Request, res: Response) => {
  try {
    const bookmarks = await db.listBookmarks((req as AuthReq).userId);
    res.json(bookmarks);
  } catch (e) {
    console.error('[kh-bookmarks] list:', e);
    res.status(500).json({ error: 'Failed to list bookmarks' });
  }
});

bookmarksRouter.post('/:documentId', async (req: Request, res: Response) => {
  try {
    const bookmarked = await db.toggleBookmark((req as AuthReq).userId, req.params.documentId);
    res.json({ bookmarked });
  } catch (e) {
    console.error('[kh-bookmarks] toggle:', e);
    res.status(500).json({ error: 'Failed to toggle bookmark' });
  }
});
