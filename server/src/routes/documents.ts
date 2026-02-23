import { Router } from 'express';
import {
  getAllDocuments,
  getDocumentById,
  getPinnedDocuments,
  searchDocuments,
  addDocument,
  updateDocument,
  toggleDocumentPin,
  incrementDocumentViews,
} from '../db/kbDocumentsDb.js';
import { addEmployeeXP } from '../db/employeesDb.js';

export const documentsRouter = Router();

// Get all documents
documentsRouter.get('/', async (_req, res) => {
  try {
    const documents = await getAllDocuments();
    res.json(documents);
  } catch (e) {
    console.error('[documents] list error:', e);
    res.status(500).json({ error: 'Failed to load documents' });
  }
});

// Get pinned documents
documentsRouter.get('/pinned', async (_req, res) => {
  try {
    const documents = await getPinnedDocuments();
    res.json(documents);
  } catch (e) {
    console.error('[documents] pinned error:', e);
    res.status(500).json({ error: 'Failed to load documents' });
  }
});

// Search documents
documentsRouter.get('/search', async (req, res) => {
  const q = (req.query.q as string) ?? '';
  try {
    const results = await searchDocuments(q);
    res.json(results);
  } catch (e) {
    console.error('[documents] search error:', e);
    res.status(500).json({ error: 'Failed to search documents' });
  }
});

// Get document by ID (increments views)
documentsRouter.get('/:id', async (req, res) => {
  try {
    const doc = await incrementDocumentViews(req.params.id);
    if (doc) {
      res.json(doc);
    } else {
      res.status(404).json({ error: 'Document not found' });
    }
  } catch (e) {
    console.error('[documents] get error:', e);
    res.status(500).json({ error: 'Failed to load document' });
  }
});

// Create new document
documentsRouter.post('/', async (req, res) => {
  const { title, content, description, tags, author, type } = req.body;
  const authorId = author ?? 'user-1';
  if (!title) {
    res.status(400).json({ error: 'title is required' });
    return;
  }
  try {
    const newDoc = await addDocument({
      title,
      content: content ?? '',
      description: description ?? '',
      tags: tags ?? [],
      author: authorId,
      type: type ?? 'wiki',
      isPinned: false,
      views: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await addEmployeeXP(authorId, 25);
    res.status(201).json(newDoc);
  } catch (e) {
    console.error('[documents] create error:', e);
    res.status(500).json({ error: 'Failed to create document' });
  }
});

// Update document
documentsRouter.put('/:id', async (req, res) => {
  try {
    const doc = await updateDocument(req.params.id, { ...req.body, updatedAt: new Date().toISOString() });
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    res.json(doc);
  } catch (e) {
    console.error('[documents] update error:', e);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// Toggle pin status
documentsRouter.patch('/:id/pin', async (req, res) => {
  try {
    const doc = await toggleDocumentPin(req.params.id);
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    res.json(doc);
  } catch (e) {
    console.error('[documents] pin error:', e);
    res.status(500).json({ error: 'Failed to toggle pin' });
  }
});
