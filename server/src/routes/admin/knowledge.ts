import { Router } from 'express';
import { requireAdmin } from '../../middleware/adminAuth.js';
import {
  getKnowledgeStats, listFlags, resolveFlag, getPendingFlagCount,
  getComplianceData, getAcknowledgementsForDocument,
  listDocuments, getDocumentById, createDocument, updateDocument,
  archiveDocument, restoreDocument, deleteDocumentPermanently,
  listCategories, createCategory, updateCategory, deleteCategory,
  listCollections, createCollection, updateCollection, deleteCollection,
  listTags, createTag, logActivity,
} from '../../db/knowledgeDb.js';
import { emitToUser } from '../../sockets/index.js';
import type { Request } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { join, extname } from 'path';

type AuthReq = Request & { userId: string };
const router = Router();
router.use(requireAdmin);

const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
const KB_DIR = join(UPLOAD_DIR, 'knowledge');
await mkdir(KB_DIR, { recursive: true });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/* ── STATS ───────────────────────────────────────── */
router.get('/stats', async (_req, res) => {
  try {
    const stats = await getKnowledgeStats();
    res.json(stats);
  } catch (e) {
    console.error('[admin/knowledge] stats', e);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

/* ── DOCUMENTS CRUD ──────────────────────────────── */
router.get('/documents', async (req, res) => {
  try {
    const { search, category, tag, fileType, status, sort, page, limit } = req.query;
    const result = await listDocuments({
      search: search as string,
      categorySlug: category as string,
      tagSlug: tag as string,
      fileType: fileType as string,
      status: (status as string) || 'all',
      sort: (sort as 'recent' | 'popular' | 'alphabetical') || 'recent',
      page: parseInt(page as string) || 1,
      limit: parseInt(limit as string) || 50,
    });
    res.json(result);
  } catch (e) {
    console.error('[admin/knowledge] documents list', e);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

router.get('/documents/:id', async (req, res) => {
  try {
    const doc = await getDocumentById(req.params.id);
    if (!doc) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(doc);
  } catch (e) {
    console.error('[admin/knowledge] doc get', e);
    res.status(500).json({ error: 'Failed to load document' });
  }
});

router.post('/documents', upload.single('file'), async (req, res) => {
  try {
    const userId = (req as AuthReq).userId;
    const { title, content, description, categoryId, tagIds, status, isRequiredReading, requiredForRoles, isPinned, pinOrder } = req.body;
    if (!title) { res.status(400).json({ error: 'Title is required' }); return; }

    let fileUrl: string | undefined;
    let fileType: string | undefined;
    let fileSizeBytes: number | undefined;

    if (req.file) {
      const ext = extname(req.file.originalname).toLowerCase();
      const filename = `${randomUUID()}${ext}`;
      await writeFile(join(KB_DIR, filename), req.file.buffer);
      fileUrl = `/uploads/knowledge/${filename}`;
      fileSizeBytes = req.file.size;
      const typeMap: Record<string, string> = { '.pdf': 'pdf', '.pptx': 'pptx', '.ppt': 'pptx', '.docx': 'docx', '.doc': 'docx', '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image', '.mp4': 'video', '.webm': 'video' };
      fileType = typeMap[ext] ?? 'file';
    }

    const parsedTagIds = tagIds ? (typeof tagIds === 'string' ? JSON.parse(tagIds) : tagIds) : undefined;
    const parsedRoles = requiredForRoles ? (typeof requiredForRoles === 'string' ? JSON.parse(requiredForRoles) : requiredForRoles) : undefined;

    const doc = await createDocument({
      title, content: content ?? '', description: description ?? '',
      fileUrl, fileType: fileType ?? (content ? 'wiki' : undefined), fileSizeBytes,
      categoryId: categoryId || undefined, tagIds: parsedTagIds,
      status: status ?? 'published',
      isRequiredReading: isRequiredReading === 'true' || isRequiredReading === true,
      requiredForRoles: parsedRoles,
      isPinned: isPinned === 'true' || isPinned === true,
      pinOrder: pinOrder ? parseInt(pinOrder) : undefined,
      authorId: userId,
    });

    await logActivity('created', userId, doc?.id);
    res.status(201).json(doc);
  } catch (e) {
    console.error('[admin/knowledge] doc create', e);
    res.status(500).json({ error: 'Failed to create document' });
  }
});

router.put('/documents/:id', upload.single('file'), async (req, res) => {
  try {
    const userId = (req as AuthReq).userId;
    const { title, content, description, categoryId, tagIds, status, isRequiredReading, requiredForRoles, isPinned, pinOrder } = req.body;

    let fileUrl: string | undefined;
    let fileType: string | undefined;
    let fileSizeBytes: number | undefined;
    let fileChanged = false;

    if (req.file) {
      const ext = extname(req.file.originalname).toLowerCase();
      const filename = `${randomUUID()}${ext}`;
      await writeFile(join(KB_DIR, filename), req.file.buffer);
      fileUrl = `/uploads/knowledge/${filename}`;
      fileSizeBytes = req.file.size;
      const typeMap: Record<string, string> = { '.pdf': 'pdf', '.pptx': 'pptx', '.ppt': 'pptx', '.docx': 'docx', '.doc': 'docx', '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image', '.mp4': 'video', '.webm': 'video' };
      fileType = typeMap[ext] ?? 'file';
      fileChanged = true;
    }

    const parsedTagIds = tagIds ? (typeof tagIds === 'string' ? JSON.parse(tagIds) : tagIds) : undefined;
    const parsedRoles = requiredForRoles ? (typeof requiredForRoles === 'string' ? JSON.parse(requiredForRoles) : requiredForRoles) : undefined;

    const doc = await updateDocument(req.params.id, {
      title, content, description,
      fileUrl, fileType, fileSizeBytes,
      categoryId: categoryId !== undefined ? (categoryId || null) : undefined,
      tagIds: parsedTagIds, status,
      isRequiredReading: isRequiredReading !== undefined ? (isRequiredReading === 'true' || isRequiredReading === true) : undefined,
      requiredForRoles: parsedRoles,
      isPinned: isPinned !== undefined ? (isPinned === 'true' || isPinned === true) : undefined,
      pinOrder: pinOrder !== undefined ? (pinOrder ? parseInt(pinOrder) : null) : undefined,
      lastUpdatedBy: userId,
      fileChanged,
    });

    if (!doc) { res.status(404).json({ error: 'Not found' }); return; }
    await logActivity('updated', userId, req.params.id);
    res.json(doc);
  } catch (e) {
    console.error('[admin/knowledge] doc update', e);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

router.post('/documents/:id/restore', async (req, res) => {
  try {
    const doc = await restoreDocument(req.params.id);
    if (!doc) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(doc);
  } catch (e) {
    console.error('[admin/knowledge] doc restore', e);
    res.status(500).json({ error: 'Failed to restore' });
  }
});

router.delete('/documents/:id', async (req, res) => {
  try {
    const userId = (req as AuthReq).userId;
    const permanent = req.query.permanent === 'true';
    if (permanent) {
      await deleteDocumentPermanently(req.params.id);
    } else {
      await archiveDocument(req.params.id);
    }
    await logActivity('deleted', userId, req.params.id);
    res.json({ success: true });
  } catch (e) {
    console.error('[admin/knowledge] doc delete', e);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

/* ── CATEGORIES ──────────────────────────────────── */
router.get('/categories', async (_req, res) => {
  try { res.json(await listCategories()); }
  catch (e) { console.error('[admin/knowledge] categories', e); res.status(500).json({ error: 'Failed' }); }
});

router.post('/categories', async (req, res) => {
  try {
    const { name, icon, color, sortOrder } = req.body;
    if (!name) { res.status(400).json({ error: 'Name is required' }); return; }
    res.status(201).json(await createCategory({ name, icon, color, sortOrder }));
  } catch (e: any) {
    if (e.code === '23505') { res.status(409).json({ error: 'Exists' }); return; }
    console.error('[admin/knowledge] cat create', e);
    res.status(500).json({ error: 'Failed' });
  }
});

router.put('/categories/:id', async (req, res) => {
  try { res.json(await updateCategory(req.params.id, req.body)); }
  catch (e) { console.error('[admin/knowledge] cat update', e); res.status(500).json({ error: 'Failed' }); }
});

router.delete('/categories/:id', async (req, res) => {
  try { await deleteCategory(req.params.id); res.json({ success: true }); }
  catch (e) { console.error('[admin/knowledge] cat delete', e); res.status(500).json({ error: 'Failed' }); }
});

/* ── TAGS ────────────────────────────────────────── */
router.get('/tags', async (_req, res) => {
  try { res.json(await listTags()); }
  catch (e) { res.status(500).json({ error: 'Failed' }); }
});

router.post('/tags', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: 'Name is required' }); return; }
    res.status(201).json(await createTag(name));
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

/* ── COLLECTIONS ─────────────────────────────────── */
router.get('/collections', async (_req, res) => {
  try { res.json(await listCollections()); }
  catch (e) { res.status(500).json({ error: 'Failed' }); }
});

router.post('/collections', async (req, res) => {
  try {
    const userId = (req as AuthReq).userId;
    const { name, description, coverImage, isPublic, documentIds } = req.body;
    if (!name) { res.status(400).json({ error: 'Name is required' }); return; }
    res.status(201).json(await createCollection({ name, description, coverImage, isPublic, documentIds, createdBy: userId }));
  } catch (e) { console.error('[admin/knowledge] col create', e); res.status(500).json({ error: 'Failed' }); }
});

router.put('/collections/:id', async (req, res) => {
  try { res.json(await updateCollection(req.params.id, req.body)); }
  catch (e) { res.status(500).json({ error: 'Failed' }); }
});

router.delete('/collections/:id', async (req, res) => {
  try { await deleteCollection(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: 'Failed' }); }
});

/* ── FLAGS ───────────────────────────────────────── */
router.get('/flags', async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const flags = await listFlags(status);
    res.json(flags);
  } catch (e) {
    console.error('[admin/knowledge] flags', e);
    res.status(500).json({ error: 'Failed to load flags' });
  }
});

router.get('/flags/count', async (_req, res) => {
  try {
    const count = await getPendingFlagCount();
    res.json({ count });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

router.put('/flags/:id', async (req, res) => {
  try {
    const userId = (req as AuthReq).userId;
    const { status, note } = req.body;
    if (!status) { res.status(400).json({ error: 'Status is required' }); return; }
    const flag = await resolveFlag(req.params.id, userId, note ?? '', status);

    // Notify the flag creator that their flag has been resolved
    if (flag?.flagged_by) {
      emitToUser(flag.flagged_by, 'notification:new', {
        userId: flag.flagged_by,
        type: 'knowledge_flag_resolved',
        title: 'Flag resolved',
        message: `Your flag on "${flag.document_title ?? 'a document'}" was ${status}.${note ? ` Note: ${note}` : ''}`,
        actionUrl: '/knowledge',
        actionLabel: 'View',
      });
    }

    // Broadcast flag resolution to admins
    const io = req.app.get('io');
    if (io) {
      io.emit('knowledge:flag_resolved', {
        flagId: flag?.id,
        documentId: flag?.document_id,
        status,
      });
    }

    res.json(flag);
  } catch (e) {
    console.error('[admin/knowledge] flag resolve', e);
    res.status(500).json({ error: 'Failed to resolve flag' });
  }
});

/* ── COMPLIANCE ──────────────────────────────────── */
router.get('/compliance', async (_req, res) => {
  try {
    const data = await getComplianceData();
    res.json(data);
  } catch (e) {
    console.error('[admin/knowledge] compliance', e);
    res.status(500).json({ error: 'Failed to load compliance data' });
  }
});

router.get('/compliance/:documentId/acknowledgements', async (req, res) => {
  try {
    const acks = await getAcknowledgementsForDocument(req.params.documentId);
    res.json(acks);
  } catch (e) {
    console.error('[admin/knowledge] compliance acks', e);
    res.status(500).json({ error: 'Failed' });
  }
});

export { router as adminKnowledgeRouter };
