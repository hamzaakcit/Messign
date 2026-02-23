import { Router, Request, Response } from 'express';
import * as db from '../../db/knowledgeV2Db.js';

export const collectionsRouter = Router();
type AuthReq = Request & { userId: string };

collectionsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const collections = await db.listCollections((req as AuthReq).userId);
    res.json(collections);
  } catch (e) {
    console.error('[kh-collections] list:', e);
    res.status(500).json({ error: 'Failed to list collections' });
  }
});

collectionsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const collection = await db.createCollection({ ...req.body, ownerId: (req as AuthReq).userId });
    res.status(201).json(collection);
  } catch (e) {
    console.error('[kh-collections] create:', e);
    res.status(500).json({ error: 'Failed to create collection' });
  }
});

collectionsRouter.post('/:id/documents', async (req: Request, res: Response) => {
  try {
    await db.addToCollection(req.params.id, req.body.documentId);
    res.json({ ok: true });
  } catch (e) {
    console.error('[kh-collections] add doc:', e);
    res.status(500).json({ error: 'Failed to add document' });
  }
});

collectionsRouter.delete('/:id/documents/:docId', async (req: Request, res: Response) => {
  try {
    await db.removeFromCollection(req.params.id, req.params.docId);
    res.status(204).end();
  } catch (e) {
    console.error('[kh-collections] remove doc:', e);
    res.status(500).json({ error: 'Failed to remove document' });
  }
});

collectionsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    await db.deleteCollection(req.params.id);
    res.status(204).end();
  } catch (e) {
    console.error('[kh-collections] delete:', e);
    res.status(500).json({ error: 'Failed to delete collection' });
  }
});
