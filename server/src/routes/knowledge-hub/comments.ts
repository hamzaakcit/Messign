import { Router, Request, Response } from 'express';
import * as db from '../../db/knowledgeV2Db.js';

export const commentsRouter = Router();
type AuthReq = Request & { userId: string };

commentsRouter.get('/:documentId', async (req: Request, res: Response) => {
  try {
    const comments = await db.listComments(req.params.documentId);
    res.json(comments);
  } catch (e) {
    console.error('[kh-comments] list:', e);
    res.status(500).json({ error: 'Failed to list comments' });
  }
});

commentsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthReq).userId;
    const comment = await db.createComment({ ...req.body, authorId: userId });

    const io = req.app.get('io');
    if (io) io.emit('kh:comment-added', { documentId: req.body.documentId, comment });

    if (req.body.documentId) {
      const doc = await db.getDocumentById(req.body.documentId);
      if (doc && doc.author_id !== userId) {
        await db.createNotification({
          userId: doc.author_id,
          type: 'comment_added',
          title: 'New Comment',
          message: `A comment was added to "${doc.title}"`,
          link: `/knowledge-hub/documents/${doc.slug}`,
          relatedDocumentId: doc.id,
        });
      }
    }

    res.status(201).json(comment);
  } catch (e) {
    console.error('[kh-comments] create:', e);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

commentsRouter.post('/:id/resolve', async (req: Request, res: Response) => {
  try {
    await db.resolveComment(req.params.id);
    const io = req.app.get('io');
    if (io) io.emit('kh:comment-resolved', { commentId: req.params.id });
    res.json({ ok: true });
  } catch (e) {
    console.error('[kh-comments] resolve:', e);
    res.status(500).json({ error: 'Failed to resolve comment' });
  }
});

commentsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    await db.deleteComment(req.params.id);
    res.status(204).end();
  } catch (e) {
    console.error('[kh-comments] delete:', e);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});
