import { Router, Request, Response } from 'express';
import { query } from '../../db/index.js';
import * as db from '../../db/knowledgeV2Db.js';
import * as hybrid from '../../db/knowledgeHubHybrid.js';
import { canAccessDocument, requireKnowledgeRole } from '../../middleware/knowledgePermissions.js';
import { logAudit } from '../../db/knowledgeV2Db.js';
import { generateDocumentPDF } from '../../services/knowledgePDF.js';
import { embedDocument } from '../../services/knowledgeEmbeddings.js';
import { extractTextFromAttachments } from '../../services/pdfTextExtractor.js';
import { ingestDocument, batchIngest, removeDocumentFromRAG } from '../../services/rag/ingest.js';
import { setupRAGSchema } from '../../services/rag/db.js';
import type { KHDocument } from '../../services/rag/types.js';
import { eventBus } from '../../events/index.js';

async function extractAttachmentText(metadata: unknown): Promise<string> {
  const meta = metadata as { attachments?: { url: string; fileName: string }[] } | undefined;
  const attachments = Array.isArray(meta?.attachments) ? meta!.attachments : [];
  if (!attachments.length) return '';
  return extractTextFromAttachments(attachments);
}

function toKHDocument(doc: Record<string, unknown>): KHDocument {
  return {
    id: String(doc.id ?? ''),
    title: String(doc.title ?? ''),
    slug: String(doc.slug ?? doc.id ?? ''),
    content: String(doc.content ?? ''),
    plainText: doc.plain_text != null ? String(doc.plain_text) : null,
    documentType: String(doc.document_type ?? 'document'),
    categoryId: doc.category_id != null ? String(doc.category_id) : null,
    categoryName: doc.category_name != null ? String(doc.category_name) : null,
    authorId: String(doc.author_id ?? ''),
    authorName: String(doc.author_name ?? doc.author_id ?? ''),
    status: (doc.status as KHDocument['status']) ?? 'published',
    tags: Array.isArray(doc.tags)
      ? doc.tags.map((t: unknown) => (typeof t === 'object' && t !== null && 'name' in t ? String((t as { name: string }).name) : String(t)))
      : [],
    createdAt: String(doc.created_at ?? new Date().toISOString()),
    updatedAt: String(doc.updated_at ?? new Date().toISOString()),
    version: typeof doc.version === 'number' ? doc.version : 1,
  };
}

export const documentsRouter = Router();

type AuthReq = Request & { userId: string };

documentsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { search, category, tag, type, status, author, team, featured, pinned, sort, page, limit } = req.query;
    const result = await hybrid.listDocuments({
      search: search as string,
      category: category as string,
      tag: tag as string,
      type: type as string,
      status: status as string,
      authorId: author as string,
      teamId: team as string,
      featured: featured === 'true',
      pinned: pinned === 'true',
      sort: (sort as 'recent' | 'popular' | 'alphabetical' | 'oldest') ?? 'recent',
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 20,
      userId: (req as AuthReq).userId,
    });
    res.json(result);
  } catch (e) {
    console.error('[kh-docs] list:', e);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

documentsRouter.get('/by-slug/:slug', async (req: Request, res: Response) => {
  try {
    const doc = await hybrid.getDocumentBySlug(req.params.slug, (req as AuthReq).userId);
    if (!doc) { res.status(404).json({ error: 'Not found' }); return; }
    try {
      await db.incrementViewCount(doc.id, (req as AuthReq).userId);
    } catch {
      /* view count increment best-effort */
    }
    res.json(doc);
  } catch (e) {
    console.error('[kh-docs] getBySlug:', e);
    res.status(500).json({ error: 'Failed to get document' });
  }
});

documentsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const doc = await hybrid.getDocumentById(req.params.id, (req as AuthReq).userId);
    if (!doc) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(doc);
  } catch (e) {
    console.error('[kh-docs] get:', e);
    res.status(500).json({ error: 'Failed to get document' });
  }
});

documentsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthReq).userId;
    const body = { ...req.body, authorId: userId };
    if (!body.plainText && body.metadata) {
      const pdfText = await extractAttachmentText(body.metadata);
      if (pdfText) body.plainText = pdfText;
    }
    const doc = await db.createDocument(body);
    if (doc) {
      await logAudit({ userId, action: 'create', entityType: 'document', entityId: doc.id, details: { title: doc.title } });
      if (doc.status === 'published' || doc.status === 'in_review') {
        ingestDocument(toKHDocument(doc as unknown as Record<string, unknown>)).catch((e) => console.error('[rag-ingest] create:', e));
      }
      if (doc.status === 'published') {
        eventBus.emit('knowledge.document.published', {
          documentId: doc.id, authorId: userId, title: doc.title, categoryId: doc.category_id ?? undefined,
        });
      }
    }
    res.status(201).json(doc);
  } catch (e) {
    console.error('[kh-docs] create:', e);
    res.status(500).json({ error: 'Failed to create document' });
  }
});

documentsRouter.post('/embed-all', requireKnowledgeRole('admin', 'cpo'), async (req: Request, res: Response) => {
  try {
    const docs = await query<{ id: string; title: string; slug: string; content: string; plain_text: string | null; document_type: string; author_id: string; category_id: string | null; status: string; created_at: string; updated_at: string }>(
      `SELECT id, title, slug, content, plain_text, document_type, author_id, category_id, status, created_at, updated_at
       FROM knowledge_documents
       WHERE status IN ('published', 'in_review')
         AND plain_text IS NOT NULL AND TRIM(plain_text) != ''`
    );
    const count = docs.rows.length;

    const khDocs: KHDocument[] = docs.rows.map((row) => toKHDocument(row));
    batchIngest(khDocs).catch((e) => console.error('[rag-ingest] embed-all:', e));

    for (let i = 0; i < docs.rows.length; i++) {
      const doc = docs.rows[i]!;
      setTimeout(() => {
        embedDocument(doc.id, doc.plain_text).catch((e) => console.error('[embed-all-legacy]', doc.id, e));
      }, i * 150);
    }
    res.json({ ok: true, count, message: `Re-embedding started for ${count} documents (RAG + legacy)` });
  } catch (e) {
    console.error('[kh-docs] embed-all:', e);
    res.status(500).json({ error: 'Failed to start bulk embedding' });
  }
});

documentsRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthReq).userId;
    const hasAccess = await canAccessDocument(userId, req.params.id);
    if (!hasAccess) { res.status(403).json({ error: 'Access denied' }); return; }
    const body = { ...req.body };
    if (body.metadata) {
      const pdfText = await extractAttachmentText(body.metadata);
      if (pdfText) {
        body.plainText = body.plainText ? `${body.plainText}\n\n${pdfText}` : pdfText;
      }
    }
    const doc = await db.updateDocument(req.params.id, body);
    if (doc) {
      await logAudit({ userId, action: 'update', entityType: 'document', entityId: doc.id, details: { title: doc.title } });
      if (doc.status === 'published' || doc.status === 'in_review') {
        ingestDocument(toKHDocument(doc as unknown as Record<string, unknown>)).catch((e) => console.error('[rag-ingest] update:', e));
      }
      if (doc.status === 'published') {
        eventBus.emit('knowledge.document.published', {
          documentId: doc.id, authorId: userId, title: doc.title, categoryId: doc.category_id ?? undefined,
        });
      }
    }
    res.json(doc);
  } catch (e) {
    console.error('[kh-docs] update:', e);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

documentsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthReq).userId;
    removeDocumentFromRAG(req.params.id).catch((e) => console.error('[rag-ingest] delete:', e));
    await db.deleteDocument(req.params.id);
    await logAudit({ userId, action: 'delete', entityType: 'document', entityId: req.params.id });
    res.status(204).end();
  } catch (e) {
    console.error('[kh-docs] delete:', e);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

documentsRouter.get('/:id/backlinks', async (req: Request, res: Response) => {
  try {
    const backlinks = await db.getBacklinks(req.params.id);
    res.json(backlinks);
  } catch (e) {
    console.error('[kh-docs] backlinks:', e);
    res.status(500).json({ error: 'Failed to get backlinks' });
  }
});

documentsRouter.post('/:id/export-pdf', async (req: Request, res: Response) => {
  try {
    const pdf = await generateDocumentPDF(req.params.id);
    if (!pdf) { res.status(404).json({ error: 'Document not found or PDF generation failed' }); return; }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="document.pdf"`);
    res.send(pdf);
  } catch (e) {
    console.error('[kh-docs] export-pdf:', e);
    res.status(500).json({ error: 'Failed to export PDF' });
  }
});

documentsRouter.post('/:id/embed', async (req: Request, res: Response) => {
  try {
    const doc = await db.getDocumentById(req.params.id);
    if (!doc) { res.status(404).json({ error: 'Not found' }); return; }
    ingestDocument(toKHDocument(doc as unknown as Record<string, unknown>)).catch((e) => console.error('[rag-ingest] embed:', e));
    embedDocument(doc.id, doc.plain_text).catch(e => console.error('[embed-legacy]', e));
    res.json({ ok: true, message: 'Embedding started (RAG + legacy)' });
  } catch (e) {
    console.error('[kh-docs] embed:', e);
    res.status(500).json({ error: 'Failed to start embedding' });
  }
});

documentsRouter.post('/setup-rag', requireKnowledgeRole('admin', 'cpo'), async (req: Request, res: Response) => {
  try {
    await setupRAGSchema();

    const docs = await query<{ id: string; title: string; slug: string; content: string; plain_text: string | null; document_type: string; author_id: string; category_id: string | null; status: string; created_at: string; updated_at: string }>(
      `SELECT id, title, slug, content, plain_text, document_type, author_id, category_id, status, created_at, updated_at
       FROM knowledge_documents
       WHERE status IN ('published', 'in_review')
         AND plain_text IS NOT NULL AND TRIM(plain_text) != ''`
    );

    const khDocs: KHDocument[] = docs.rows.map((row) => toKHDocument(row));
    batchIngest(khDocs).catch((e) => console.error('[setup-rag] batch ingest:', e));

    res.json({ ok: true, count: khDocs.length, message: `RAG schema created and ingestion started for ${khDocs.length} documents` });
  } catch (e) {
    console.error('[kh-docs] setup-rag:', e);
    res.status(500).json({ error: 'Failed to set up RAG pipeline' });
  }
});

documentsRouter.get('/:id/related', async (req: Request, res: Response) => {
  try {
    const result = await hybrid.listDocuments({ limit: 5, status: 'published' });
    res.json(result.docs.filter(d => d.id !== req.params.id).slice(0, 4));
  } catch (e) {
    console.error('[kh-docs] related:', e);
    res.status(500).json({ error: 'Failed to get related' });
  }
});
