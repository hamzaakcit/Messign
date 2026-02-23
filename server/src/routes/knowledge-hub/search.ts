import { Router, Request, Response } from 'express';
import { query } from '../../db/index.js';
import * as db from '../../db/knowledgeV2Db.js';
import * as hybrid from '../../db/knowledgeHubHybrid.js';

export const searchRouter = Router();
type AuthReq = Request & { userId: string };

searchRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { q, type, category, tag, status, sort, page, limit: lim } = req.query;
    const startTime = Date.now();
    const result = await hybrid.listDocuments({
      search: q as string,
      type: type as string,
      category: category as string,
      tag: tag as string,
      status: (status as string) || 'published',
      sort: (sort as 'recent' | 'popular' | 'alphabetical' | 'oldest') ?? 'recent',
      page: page ? parseInt(page as string) : 1,
      limit: lim ? parseInt(lim as string) : 20,
      userId: (req as AuthReq).userId,
    });
    const elapsed = Date.now() - startTime;
    if (q) {
      await db.logSearch({ userId: (req as AuthReq).userId, query: q as string, resultCount: result.total, searchType: 'keyword', responseTimeMs: elapsed });
    }
    res.json(result);
  } catch (e) {
    console.error('[kh-search]:', e);
    res.status(500).json({ error: 'Search failed' });
  }
});

searchRouter.get('/suggestions', async (req: Request, res: Response) => {
  try {
    const q = req.query.q as string;
    if (!q || q.length < 2) { res.json([]); return; }
    const result = await query<{ id: string; title: string; slug: string }>(
      `SELECT id, title, slug FROM knowledge_documents
       WHERE status = 'published' AND title % $1
       ORDER BY similarity(title, $1) DESC LIMIT 5`,
      [q]
    );
    res.json(result.rows);
  } catch (e) {
    console.error('[kh-search] suggestions:', e);
    res.json([]);
  }
});
