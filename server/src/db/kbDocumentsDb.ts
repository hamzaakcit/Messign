import { query } from './index.js';
import type { Document } from '../types/index.js';

interface DocRow {
  id: string;
  title: string;
  content: string;
  description: string;
  tags: string[];
  author_id: string;
  type: string;
  is_pinned: boolean;
  views: number;
  created_at: string;
  updated_at: string;
}

function mapRowToDocument(row: DocRow): Document {
  return {
    id: row.id,
    title: row.title,
    content: row.content ?? '',
    description: row.description ?? '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    author: row.author_id,
    type: row.type as Document['type'],
    isPinned: row.is_pinned ?? false,
    views: row.views ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getDocumentById(id: string): Promise<Document | null> {
  const result = await query<DocRow>(
    `SELECT id, title, content, description, COALESCE(tags, '[]')::jsonb AS tags, author_id, type,
            COALESCE(is_pinned, FALSE) AS is_pinned, COALESCE(views, 0)::int AS views,
            created_at::text AS created_at, updated_at::text AS updated_at
     FROM kb_documents WHERE id = $1`,
    [id]
  );
  const row = result.rows[0];
  return row ? mapRowToDocument(row) : null;
}

export async function getPinnedDocuments(): Promise<Document[]> {
  const result = await query<DocRow>(
    `SELECT id, title, content, description, COALESCE(tags, '[]')::jsonb AS tags, author_id, type,
            COALESCE(is_pinned, FALSE) AS is_pinned, COALESCE(views, 0)::int AS views,
            created_at::text AS created_at, updated_at::text AS updated_at
     FROM kb_documents WHERE is_pinned = TRUE ORDER BY updated_at DESC`
  );
  return result.rows.map(mapRowToDocument);
}

export async function getAllDocuments(): Promise<Document[]> {
  const result = await query<DocRow>(
    `SELECT id, title, content, description, COALESCE(tags, '[]')::jsonb AS tags, author_id, type,
            COALESCE(is_pinned, FALSE) AS is_pinned, COALESCE(views, 0)::int AS views,
            created_at::text AS created_at, updated_at::text AS updated_at
     FROM kb_documents ORDER BY updated_at DESC`
  );
  return result.rows.map(mapRowToDocument);
}

export async function searchDocuments(q: string): Promise<Document[]> {
  if (!q || !q.trim()) return getAllDocuments();
  const pattern = `%${q.trim().toLowerCase().replace(/%/g, '\\%')}%`;
  const result = await query<DocRow>(
    `SELECT id, title, content, description, COALESCE(tags, '[]')::jsonb AS tags, author_id, type,
            COALESCE(is_pinned, FALSE) AS is_pinned, COALESCE(views, 0)::int AS views,
            created_at::text AS created_at, updated_at::text AS updated_at
     FROM kb_documents
     WHERE LOWER(title) LIKE $1 OR LOWER(description) LIKE $1 OR EXISTS (
       SELECT 1 FROM jsonb_array_elements_text(COALESCE(tags, '[]')) t WHERE LOWER(t) LIKE $1
     )
     ORDER BY updated_at DESC`,
    [pattern]
  );
  return result.rows.map(mapRowToDocument);
}

export async function addDocument(doc: Omit<Document, 'id'> & { id?: string }): Promise<Document> {
  const id = doc.id ?? `doc-${Date.now()}`;
  await query(
    `INSERT INTO kb_documents (id, title, content, description, tags, author_id, type, is_pinned, views)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      doc.title,
      doc.content ?? '',
      doc.description ?? '',
      JSON.stringify(doc.tags ?? []),
      doc.author,
      doc.type ?? 'wiki',
      doc.isPinned ?? false,
      doc.views ?? 0,
    ]
  );
  const out = await getDocumentById(id);
  if (!out) throw new Error('Document insert failed');
  return out;
}

export async function updateDocument(id: string, updates: Partial<Omit<Document, 'id'>>): Promise<Document | null> {
  const current = await getDocumentById(id);
  if (!current) return null;
  const title = updates.title ?? current.title;
  const content = updates.content ?? current.content;
  const description = updates.description ?? current.description;
  const tags = updates.tags ?? current.tags;
  const type = updates.type ?? current.type;
  const isPinned = updates.isPinned ?? current.isPinned;
  await query(
    `UPDATE kb_documents SET title = $1, content = $2, description = $3, tags = $4, type = $5, is_pinned = $6, updated_at = NOW()
     WHERE id = $7`,
    [title, content, description, JSON.stringify(tags), type, isPinned, id]
  );
  return getDocumentById(id);
}

export async function toggleDocumentPin(id: string): Promise<Document | null> {
  await query(`UPDATE kb_documents SET is_pinned = NOT COALESCE(is_pinned, FALSE), updated_at = NOW() WHERE id = $1`, [id]);
  return getDocumentById(id);
}

export async function incrementDocumentViews(id: string): Promise<Document | null> {
  await query(`UPDATE kb_documents SET views = COALESCE(views, 0) + 1 WHERE id = $1`, [id]);
  return getDocumentById(id);
}
