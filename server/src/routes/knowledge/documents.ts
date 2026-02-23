import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireAdmin } from '../../middleware/adminAuth.js';
import {
  listDocuments, getDocumentBySlug, getDocumentById,
  createDocument, updateDocument, archiveDocument,
  incrementDownloadCount, incrementViews,
  acknowledgeDocument, createFlag, toggleUserPin,
  getDocumentVersions, logActivity,
} from '../../db/knowledgeDb.js';
import type { Request } from 'express';

const router = Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
const KB_DIR = join(UPLOAD_DIR, 'knowledge');
if (!existsSync(KB_DIR)) mkdirSync(KB_DIR, { recursive: true });

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

type AuthReq = Request & { userId: string };

/* ── LIST ────────────────────────────────────────── */
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthReq).userId;
    const { search, category, tag, fileType, status, sort, page, limit } = req.query;
    const result = await listDocuments({
      search: search as string,
      categorySlug: category as string,
      tagSlug: tag as string,
      fileType: fileType as string,
      status: (status as string) || 'published',
      sort: (sort as 'recent' | 'popular' | 'alphabetical') || 'recent',
      page: parseInt(page as string) || 1,
      limit: parseInt(limit as string) || 20,
      userId,
    });
    res.json(result);
  } catch (e) {
    console.error('[knowledge/documents] list', e);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

/* ── GET BY SLUG ─────────────────────────────────── */
router.get('/:slug', requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthReq).userId;
    const doc = await getDocumentBySlug(req.params.slug, userId);
    if (!doc) { res.status(404).json({ error: 'Not found' }); return; }
    // increment view
    await incrementViews(doc.id);
    res.json(doc);
  } catch (e) {
    console.error('[knowledge/documents] get', e);
    res.status(500).json({ error: 'Failed to load document' });
  }
});

/* ── CREATE (admin only, multipart) ──────────────── */
router.post('/', requireAdmin, upload.single('file'), async (req, res) => {
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
      writeFileSync(join(KB_DIR, filename), req.file.buffer);
      fileUrl = `/uploads/knowledge/${filename}`;
      fileSizeBytes = req.file.size;
      // Determine file type from extension
      const typeMap: Record<string, string> = { '.pdf': 'pdf', '.pptx': 'pptx', '.ppt': 'pptx', '.docx': 'docx', '.doc': 'docx', '.xlsx': 'xlsx', '.xls': 'xlsx', '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image', '.webp': 'image', '.mp4': 'video', '.webm': 'video', '.mov': 'video' };
      fileType = typeMap[ext] ?? 'file';
    }

    const parsedTagIds = tagIds ? (typeof tagIds === 'string' ? JSON.parse(tagIds) : tagIds) : undefined;
    const parsedRoles = requiredForRoles ? (typeof requiredForRoles === 'string' ? JSON.parse(requiredForRoles) : requiredForRoles) : undefined;

    const doc = await createDocument({
      title,
      content: content ?? '',
      description: description ?? '',
      fileUrl,
      fileType: fileType ?? (content ? 'wiki' : undefined),
      fileSizeBytes,
      categoryId: categoryId || undefined,
      tagIds: parsedTagIds,
      status: status ?? 'published',
      isRequiredReading: isRequiredReading === 'true' || isRequiredReading === true,
      requiredForRoles: parsedRoles,
      isPinned: isPinned === 'true' || isPinned === true,
      pinOrder: pinOrder ? parseInt(pinOrder) : undefined,
      authorId: userId,
    });

    await logActivity('created', userId, doc?.id);

    // Emit socket event for new document
    const io = req.app.get('io');
    if (io && doc?.status === 'published') {
      io.emit('knowledge:new_document', { document: { id: doc.id, title: doc.title, slug: doc.slug } });

      // Notify all connected users about required reading
      if (doc.is_required_reading) {
        io.emit('knowledge:required_reading', {
          document: { id: doc.id, title: doc.title, slug: doc.slug },
        });
      }
    }

    res.status(201).json(doc);
  } catch (e) {
    console.error('[knowledge/documents] create', e);
    res.status(500).json({ error: 'Failed to create document' });
  }
});

/* ── UPDATE (admin only) ─────────────────────────── */
router.put('/:id', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    const userId = (req as AuthReq).userId;
    const { id } = req.params;
    const { title, content, description, categoryId, tagIds, status, isRequiredReading, requiredForRoles, isPinned, pinOrder } = req.body;

    let fileUrl: string | undefined;
    let fileType: string | undefined;
    let fileSizeBytes: number | undefined;
    let fileChanged = false;

    if (req.file) {
      const ext = extname(req.file.originalname).toLowerCase();
      const filename = `${randomUUID()}${ext}`;
      writeFileSync(join(KB_DIR, filename), req.file.buffer);
      fileUrl = `/uploads/knowledge/${filename}`;
      fileSizeBytes = req.file.size;
      const typeMap: Record<string, string> = { '.pdf': 'pdf', '.pptx': 'pptx', '.ppt': 'pptx', '.docx': 'docx', '.doc': 'docx', '.xlsx': 'xlsx', '.xls': 'xlsx', '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image', '.webp': 'image', '.mp4': 'video', '.webm': 'video', '.mov': 'video' };
      fileType = typeMap[ext] ?? 'file';
      fileChanged = true;
    }

    const parsedTagIds = tagIds ? (typeof tagIds === 'string' ? JSON.parse(tagIds) : tagIds) : undefined;
    const parsedRoles = requiredForRoles ? (typeof requiredForRoles === 'string' ? JSON.parse(requiredForRoles) : requiredForRoles) : undefined;

    const doc = await updateDocument(id, {
      title, content, description,
      fileUrl, fileType, fileSizeBytes,
      categoryId: categoryId !== undefined ? (categoryId || null) : undefined,
      tagIds: parsedTagIds,
      status,
      isRequiredReading: isRequiredReading !== undefined ? (isRequiredReading === 'true' || isRequiredReading === true) : undefined,
      requiredForRoles: parsedRoles,
      isPinned: isPinned !== undefined ? (isPinned === 'true' || isPinned === true) : undefined,
      pinOrder: pinOrder !== undefined ? (pinOrder ? parseInt(pinOrder) : null) : undefined,
      lastUpdatedBy: userId,
      fileChanged,
    });

    if (!doc) { res.status(404).json({ error: 'Not found' }); return; }
    await logActivity('updated', userId, id);

    const io = req.app.get('io');
    if (io) {
      io.emit('knowledge:document_updated', { document: { id: doc.id, title: doc.title, slug: doc.slug } });
    }

    res.json(doc);
  } catch (e) {
    console.error('[knowledge/documents] update', e);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

/* ── DELETE (archive) ────────────────────────────── */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const userId = (req as AuthReq).userId;
    const doc = await archiveDocument(req.params.id);
    if (!doc) { res.status(404).json({ error: 'Not found' }); return; }
    await logActivity('archived', userId, req.params.id);
    res.json(doc);
  } catch (e) {
    console.error('[knowledge/documents] archive', e);
    res.status(500).json({ error: 'Failed to archive document' });
  }
});

/* ── DOWNLOAD ────────────────────────────────────── */
router.post('/:id/download', requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthReq).userId;
    const doc = await incrementDownloadCount(req.params.id);
    if (!doc) { res.status(404).json({ error: 'Not found' }); return; }
    await logActivity('downloaded', userId, req.params.id);
    res.json({ fileUrl: doc.file_url, downloadCount: doc.download_count });
  } catch (e) {
    console.error('[knowledge/documents] download', e);
    res.status(500).json({ error: 'Failed to process download' });
  }
});

/* ── ACKNOWLEDGE ─────────────────────────────────── */
router.post('/:id/acknowledge', requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthReq).userId;
    await acknowledgeDocument(req.params.id, userId);
    await logActivity('acknowledged', userId, req.params.id);
    res.json({ success: true });
  } catch (e) {
    console.error('[knowledge/documents] acknowledge', e);
    res.status(500).json({ error: 'Failed to acknowledge' });
  }
});

/* ── FLAG ────────────────────────────────────────── */
router.post('/:id/flag', requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthReq).userId;
    const { reason } = req.body;
    if (!reason) { res.status(400).json({ error: 'Reason is required' }); return; }
    const flag = await createFlag(req.params.id, userId, reason);
    await logActivity('flagged', userId, req.params.id, undefined, { reason });

    const io = req.app.get('io');
    if (io) {
      const doc = await getDocumentById(req.params.id);
      if (doc) {
        io.emit('knowledge:flag_created', { documentId: req.params.id, title: doc.title, reason });
      }
    }

    res.json(flag);
  } catch (e) {
    console.error('[knowledge/documents] flag', e);
    res.status(500).json({ error: 'Failed to flag document' });
  }
});

/* ── PIN (toggle) ────────────────────────────────── */
router.post('/:id/pin', requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthReq).userId;
    const pinned = await toggleUserPin(userId, req.params.id);
    await logActivity(pinned ? 'pinned' : 'unpinned', userId, req.params.id);
    res.json({ pinned });
  } catch (e) {
    console.error('[knowledge/documents] pin', e);
    res.status(500).json({ error: 'Failed to toggle pin' });
  }
});

/* ── VERSION HISTORY ─────────────────────────────── */
router.get('/:id/versions', requireAuth, async (req, res) => {
  try {
    const versions = await getDocumentVersions(req.params.id);
    res.json(versions);
  } catch (e) {
    console.error('[knowledge/documents] versions', e);
    res.status(500).json({ error: 'Failed to load versions' });
  }
});

export { router as knowledgeDocumentsRouter };
