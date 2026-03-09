import { query } from './index.js';
import type { Document } from '../types/index.js';

interface DocRow {
  id: string;
  title: string;
  plain_text: string | null;
  excerpt: string | null;
  author_id: string;
  document_type: string;
  is_pinned: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/, '').slice(0, 200);
}

function mapDocTypeToLegacy(docType: string): Document['type'] {
  const m: Record<string, Document['type']> = {
    guide: 'wiki', faq: 'wiki', specification: 'wiki', roadmap: 'wiki',
    meeting_note: 'doc', micro_learn: 'wiki', announcement: 'wiki', template: 'wiki', sop: 'wiki', policy: 'wiki',
  };
  return (m[docType] ?? 'wiki') as Document['type'];
}

function mapLegacyTypeToDocType(legacy: string): string {
  const m: Record<string, string> = { wiki: 'guide', pdf: 'guide', doc: 'guide', link: 'guide' };
  return m[legacy] ?? 'guide';
}

async function getTagsForDocument(docId: string): Promise<string[]> {
  const res = await query<{ name: string }>(
    `SELECT t.name FROM knowledge_document_tags dt
     JOIN knowledge_tags t ON t.id = dt.tag_id
     WHERE dt.document_id = $1`,
    [docId]
  );
  return res.rows.map((r) => r.name);
}

function mapRowToDocument(row: DocRow, tags: string[]): Document {
  return {
    id: row.id,
    title: row.title,
    content: row.plain_text ?? '',
    description: row.excerpt ?? '',
    tags,
    author: row.author_id,
    type: mapDocTypeToLegacy(row.document_type),
    isPinned: row.is_pinned ?? false,
    views: row.view_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const DOC_SELECT = `id, title, plain_text, excerpt, author_id, document_type,
  COALESCE(is_pinned, FALSE) AS is_pinned, COALESCE(view_count, 0)::int AS view_count,
  created_at::text AS created_at, updated_at::text AS updated_at`;

export async function getDocumentById(id: string): Promise<Document | null> {
  const result = await query<DocRow>(
    `SELECT ${DOC_SELECT} FROM knowledge_documents WHERE id::text = $1 OR slug = $1`,
    [id]
  );
  const row = result.rows[0];
  if (!row) return null;
  const tags = await getTagsForDocument(row.id);
  return mapRowToDocument(row, tags);
}

export async function getPinnedDocuments(): Promise<Document[]> {
  const result = await query<DocRow>(
    `SELECT ${DOC_SELECT} FROM knowledge_documents WHERE is_pinned = TRUE ORDER BY updated_at DESC`
  );
  const docs: Document[] = [];
  for (const row of result.rows) {
    const tags = await getTagsForDocument(row.id);
    docs.push(mapRowToDocument(row, tags));
  }
  return docs;
}

export async function getAllDocuments(): Promise<Document[]> {
  const result = await query<DocRow>(
    `SELECT ${DOC_SELECT} FROM knowledge_documents WHERE status IN ('published', 'in_review') ORDER BY updated_at DESC`
  );
  const docs: Document[] = [];
  for (const row of result.rows) {
    const tags = await getTagsForDocument(row.id);
    docs.push(mapRowToDocument(row, tags));
  }
  return docs;
}

export async function searchDocuments(q: string): Promise<Document[]> {
  if (!q || !q.trim()) return getAllDocuments();
  const pattern = `%${q.trim().toLowerCase().replace(/%/g, '\\%')}%`;
  const result = await query<DocRow>(
    `SELECT ${DOC_SELECT} FROM knowledge_documents
     WHERE status IN ('published', 'in_review')
       AND (LOWER(title) LIKE $1 OR LOWER(COALESCE(excerpt, '')) LIKE $1 OR LOWER(COALESCE(plain_text, '')) LIKE $1
            OR EXISTS (
              SELECT 1 FROM knowledge_document_tags dt
              JOIN knowledge_tags t ON t.id = dt.tag_id
              WHERE dt.document_id = knowledge_documents.id AND LOWER(t.name) LIKE $1
            ))
     ORDER BY updated_at DESC`,
    [pattern]
  );
  const docs: Document[] = [];
  for (const row of result.rows) {
    const tags = await getTagsForDocument(row.id);
    docs.push(mapRowToDocument(row, tags));
  }
  return docs;
}

async function getOrCreateTag(name: string): Promise<string> {
  const slug = slugify(name) || 'tag';
  const existing = await query<{ id: string }>(
    `SELECT id FROM knowledge_tags WHERE LOWER(name) = LOWER($1) LIMIT 1`,
    [name]
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const inserted = await query<{ id: string }>(
    `INSERT INTO knowledge_tags (name, slug) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET name = $1 RETURNING id`,
    [name, slug]
  );
  return inserted.rows[0].id;
}

export async function addDocument(doc: Omit<Document, 'id'> & { id?: string }): Promise<Document> {
  const slug = slugify(doc.title) + '-' + Date.now().toString(36);
  const contentJson = JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: doc.content ?? '' }] }],
  });
  const result = await query<{ id: string }>(
    `INSERT INTO knowledge_documents (title, slug, content, plain_text, excerpt, status, document_type, author_id, is_pinned, view_count, published_at)
     VALUES ($1, $2, $3::jsonb, $4, $5, 'published', $6, $7, $8, $9, NOW())
     RETURNING id`,
    [
      doc.title,
      slug,
      contentJson,
      doc.content ?? '',
      doc.description ?? '',
      mapLegacyTypeToDocType(doc.type ?? 'wiki'),
      doc.author,
      doc.isPinned ?? false,
      doc.views ?? 0,
    ]
  );
  const id = result.rows[0].id;
  if (doc.tags?.length) {
    for (const tagName of doc.tags) {
      const tagId = await getOrCreateTag(tagName);
      await query(
        `INSERT INTO knowledge_document_tags (document_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [id, tagId]
      );
    }
  }
  const out = await getDocumentById(id);
  if (!out) throw new Error('Document insert failed');
  return out;
}

async function resolveDocId(idOrSlug: string): Promise<string | null> {
  const r = await query<{ id: string }>(`SELECT id FROM knowledge_documents WHERE id::text = $1 OR slug = $1`, [idOrSlug]);
  return r.rows[0]?.id ?? null;
}

export async function updateDocument(id: string, updates: Partial<Omit<Document, 'id'>>): Promise<Document | null> {
  const resolvedId = await resolveDocId(id);
  if (!resolvedId) return null;
  const current = await getDocumentById(resolvedId);
  if (!current) return null;
  const title = updates.title ?? current.title;
  const content = updates.content ?? current.content;
  const description = updates.description ?? current.description;
  const tags = updates.tags ?? current.tags;
  const type = updates.type ?? current.type;
  const isPinned = updates.isPinned ?? current.isPinned;
  const contentJson = JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: content }] }],
  });
  await query(
    `UPDATE knowledge_documents SET title = $1, content = $2, plain_text = $3, excerpt = $4, document_type = $5, is_pinned = $6, updated_at = NOW()
     WHERE id = $7`,
    [title, contentJson, content, description, mapLegacyTypeToDocType(type), isPinned, resolvedId]
  );
  await query(`DELETE FROM knowledge_document_tags WHERE document_id = $1`, [resolvedId]);
  if (tags?.length) {
    for (const tagName of tags) {
      const tagId = await getOrCreateTag(tagName);
      await query(
        `INSERT INTO knowledge_document_tags (document_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [resolvedId, tagId]
      );
    }
  }
  return getDocumentById(resolvedId);
}

export async function toggleDocumentPin(id: string): Promise<Document | null> {
  const resolvedId = await resolveDocId(id);
  if (!resolvedId) return null;
  await query(`UPDATE knowledge_documents SET is_pinned = NOT COALESCE(is_pinned, FALSE), updated_at = NOW() WHERE id = $1`, [resolvedId]);
  return getDocumentById(resolvedId);
}

export async function incrementDocumentViews(id: string): Promise<Document | null> {
  const resolvedId = await resolveDocId(id);
  if (!resolvedId) return null;
  await query(`UPDATE knowledge_documents SET view_count = COALESCE(view_count, 0) + 1 WHERE id = $1`, [resolvedId]);
  return getDocumentById(resolvedId);
}
