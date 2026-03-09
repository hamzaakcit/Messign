import { query } from './index.js';

/* ============================================================
   TYPE HELPERS
   ============================================================ */

export interface KbDocRow {
  id: string;
  title: string;
  slug: string;
  content: string;
  description: string;
  tags: string[];
  author_id: string;
  author_name?: string;
  type: string;
  file_url: string | null;
  file_type: string | null;
  file_size_bytes: number | null;
  thumbnail_url: string | null;
  version: number;
  version_label: string | null;
  previous_version_id: string | null;
  category_id: string | null;
  category_name?: string | null;
  category_slug?: string | null;
  category_color?: string | null;
  status: string;
  is_pinned: boolean;
  is_required_reading: boolean;
  required_for_roles: string[];
  pin_order: number | null;
  views: number;
  download_count: number;
  published_at: string;
  new_badge_until: string | null;
  last_updated_by: string | null;
  last_updated_by_name?: string | null;
  created_at: string;
  updated_at: string;
  // joined
  user_pinned?: boolean;
  user_acknowledged?: boolean;
  flag_count?: number;
}

export interface KbCategoryRow {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  sort_order: number;
  created_at: string;
  document_count?: number;
}

export interface KbTagRow {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  document_count?: number;
}

export interface KbCollectionRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  cover_image: string | null;
  share_token: string;
  is_public: boolean;
  created_by: string;
  created_by_name?: string;
  document_count?: number;
  created_at: string;
  updated_at: string;
}

export interface KbFlagRow {
  id: string;
  document_id: string;
  document_title?: string;
  flagged_by: string;
  flagged_by_name?: string;
  reason: string;
  status: string;
  resolved_by: string | null;
  resolved_by_name?: string | null;
  resolved_at: string | null;
  resolved_note: string | null;
  created_at: string;
}

export interface KbAckRow {
  id: string;
  document_id: string;
  user_id: string;
  user_name?: string;
  acknowledged_at: string;
}

export interface KbActivityRow {
  id: string;
  action: string;
  document_id: string | null;
  document_title?: string | null;
  collection_id: string | null;
  user_id: string;
  user_name?: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

/* ============================================================
   DOCUMENT QUERIES
   ============================================================ */

const DOC_SELECT = `
  d.id, d.title, d.slug, d.plain_text AS content, d.excerpt AS description,
  d.author_id, d.document_type AS type,
  (d.metadata->'attachments'->0->>'url')::text AS file_url,
  (d.metadata->'attachments'->0->>'fileType')::text AS file_type,
  NULL::int AS file_size_bytes,
  d.cover_image AS thumbnail_url,
  1 AS version, 'v1' AS version_label, NULL AS previous_version_id,
  d.category_id, c.name AS category_name, c.slug AS category_slug, c.color AS category_color,
  COALESCE(d.status::text, 'published') AS status,
  COALESCE(d.is_pinned, FALSE) AS is_pinned,
  FALSE AS is_required_reading,
  '[]'::jsonb AS required_for_roles,
  NULL::int AS pin_order,
  COALESCE(d.view_count, 0)::int AS views,
  0 AS download_count,
  d.published_at::text AS published_at,
  NULL AS new_badge_until,
  NULL AS last_updated_by,
  d.created_at::text AS created_at,
  d.updated_at::text AS updated_at
`;

const DOC_FROM = `
  FROM knowledge_documents d
  LEFT JOIN knowledge_categories c ON c.id = d.category_id
`;

interface ListDocumentsParams {
  search?: string;
  categorySlug?: string;
  tagSlug?: string;
  fileType?: string;
  status?: string;
  sort?: 'recent' | 'popular' | 'alphabetical';
  page?: number;
  limit?: number;
  userId?: string; // for pin / ack status
}

export async function listDocuments(params: ListDocumentsParams) {
  const {
    search, categorySlug, tagSlug, fileType,
    status = 'published',
    sort = 'recent',
    page = 1,
    limit = 20,
    userId,
  } = params;

  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 0;

  if (status && status !== 'all') {
    conditions.push(`COALESCE(d.status::text, 'published') = $${++idx}`);
    values.push(status);
  }
  if (search) {
    const pat = `%${search.replace(/%/g, '\\%')}%`;
    conditions.push(`(LOWER(d.title) ILIKE $${++idx} OR LOWER(COALESCE(d.excerpt,'')) ILIKE $${idx} OR LOWER(COALESCE(d.plain_text,'')) ILIKE $${idx})`);
    values.push(pat.toLowerCase());
  }
  if (categorySlug) {
    conditions.push(`c.slug = $${++idx}`);
    values.push(categorySlug);
  }
  if (tagSlug) {
    conditions.push(`EXISTS (SELECT 1 FROM knowledge_document_tags dt JOIN knowledge_tags t ON t.id = dt.tag_id WHERE dt.document_id = d.id AND t.slug = $${++idx})`);
    values.push(tagSlug);
  }
  if (fileType) {
    conditions.push(`(d.metadata->'attachments'->0->>'fileType') = $${++idx}`);
    values.push(fileType);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  let orderBy = 'ORDER BY d.updated_at DESC';
  if (sort === 'popular') orderBy = 'ORDER BY d.view_count DESC, d.updated_at DESC';
  if (sort === 'alphabetical') orderBy = 'ORDER BY LOWER(d.title) ASC';

  const offset = (page - 1) * limit;

  // Count
  const countResult = await query<{ total: string }>(
    `SELECT COUNT(*)::text AS total ${DOC_FROM} ${where}`,
    values
  );
  const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

  // Fetch
  let extraCols = '';
  if (userId) {
    extraCols = `, (SELECT TRUE FROM knowledge_bookmarks b WHERE b.document_id = d.id AND b.user_id = $${++idx}) AS user_pinned,
                   FALSE AS user_acknowledged`;
    values.push(userId);
  }

  const dataResult = await query<KbDocRow>(
    `SELECT ${DOC_SELECT}${extraCols}
     ${DOC_FROM} ${where}
     ${orderBy}
     LIMIT $${++idx} OFFSET $${++idx}`,
    [...values, limit, offset]
  );

  // Fetch tags per document
  const docIds = dataResult.rows.map(r => r.id);
  const tagsMap = await getTagsForDocuments(docIds);
  const authorIds = [...new Set(dataResult.rows.map(r => r.author_id))];
  const authorMap = await getUserNames(authorIds);

  const docs = dataResult.rows.map(row => ({
    ...row,
    tags: tagsMap[row.id] ?? [],
    author_name: authorMap[row.author_id] ?? row.author_id,
    user_pinned: row.user_pinned ?? false,
    user_acknowledged: row.user_acknowledged ?? false,
  }));

  return { docs, total, page, limit };
}

export async function getDocumentBySlug(slug: string, userId?: string) {
  let extraCols = '';
  const values: unknown[] = [slug];
  if (userId) {
    extraCols = `, (SELECT TRUE FROM knowledge_bookmarks b WHERE b.document_id = d.id AND b.user_id = $2) AS user_pinned,
                   FALSE AS user_acknowledged,
                   (SELECT COUNT(*)::int FROM knowledge_content_flags f WHERE f.document_id = d.id AND f.is_resolved = false) AS flag_count`;
    values.push(userId);
  }

  const result = await query<KbDocRow>(
    `SELECT ${DOC_SELECT}${extraCols} ${DOC_FROM} WHERE d.slug = $1 LIMIT 1`,
    values
  );
  const row = result.rows[0];
  if (!row) return null;

  const tagsMap = await getTagsForDocuments([row.id]);
  const authorMap = await getUserNames([row.author_id, row.last_updated_by].filter(Boolean) as string[]);

  return {
    ...row,
    tags: tagsMap[row.id] ?? [],
    author_name: authorMap[row.author_id] ?? row.author_id,
    last_updated_by_name: row.last_updated_by ? authorMap[row.last_updated_by] ?? null : null,
    user_pinned: row.user_pinned ?? false,
    user_acknowledged: row.user_acknowledged ?? false,
  };
}

export async function getDocumentById(id: string) {
  const result = await query<KbDocRow>(
    `SELECT ${DOC_SELECT} ${DOC_FROM} WHERE d.id::text = $1 OR d.slug = $1 LIMIT 1`,
    [id]
  );
  const row = result.rows[0];
  if (!row) return null;
  const tagsMap = await getTagsForDocuments([row.id]);
  return { ...row, tags: tagsMap[row.id] ?? [] };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 200);
}

async function ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
  let slug = slugify(base);
  let attempt = 0;
  while (true) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt}`;
    const cond = excludeId ? ` AND id::text != $2` : '';
    const vals: unknown[] = [candidate];
    if (excludeId) vals.push(excludeId);
    const result = await query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM knowledge_documents WHERE slug = $1${cond}`, vals);
    if (parseInt(result.rows[0]?.cnt ?? '0', 10) === 0) return candidate;
    attempt++;
  }
}

export interface CreateDocInput {
  title: string;
  content?: string;
  description?: string;
  fileUrl?: string;
  fileType?: string;
  fileSizeBytes?: number;
  thumbnailUrl?: string;
  categoryId?: string;
  tagIds?: string[];
  status?: string;
  isRequiredReading?: boolean;
  requiredForRoles?: string[];
  isPinned?: boolean;
  pinOrder?: number;
  authorId: string;
}

export async function createDocument(input: CreateDocInput) {
  const slug = await ensureUniqueSlug(input.title);
  const contentJson = input.content
    ? JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: input.content }] }] })
    : '{}';
  const metadata: Record<string, unknown> = {};
  if (input.fileUrl) {
    metadata.attachments = [{ url: input.fileUrl, fileName: input.title + (input.fileType ? '.' + input.fileType : ''), fileType: input.fileType ?? 'file' }];
  }
  const result = await query<{ id: string }>(
    `INSERT INTO knowledge_documents
       (title, slug, content, plain_text, excerpt, cover_image, status, document_type, metadata,
        author_id, category_id, is_pinned, view_count, published_at)
     VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7::document_status,'guide'::document_type,$8::jsonb,$9,$10,$11,0,$12)
     RETURNING id`,
    [
      input.title, slug, contentJson,
      input.content ?? '', input.description ?? '',
      input.thumbnailUrl ?? null,
      input.status ?? 'published',
      JSON.stringify(metadata),
      input.authorId,
      input.categoryId ?? null,
      input.isPinned ?? false,
      input.status === 'published' ? new Date() : null,
    ]
  );
  const id = result.rows[0].id;

  if (input.tagIds?.length) {
    for (const tagId of input.tagIds) {
      await query(`INSERT INTO knowledge_document_tags (document_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, tagId]);
    }
  }

  return getDocumentById(id);
}

export interface UpdateDocInput {
  title?: string;
  content?: string;
  description?: string;
  fileUrl?: string;
  fileType?: string;
  fileSizeBytes?: number;
  thumbnailUrl?: string;
  categoryId?: string | null;
  tagIds?: string[];
  status?: string;
  isRequiredReading?: boolean;
  requiredForRoles?: string[];
  isPinned?: boolean;
  pinOrder?: number | null;
  lastUpdatedBy: string;
  fileChanged?: boolean;
}

export async function updateDocument(id: string, input: UpdateDocInput) {
  const current = await getDocumentById(id);
  if (!current) return null;
  const docId = current.id;

  const sets: string[] = ['updated_at = NOW()'];
  const vals: unknown[] = [];
  let idx = 0;

  const set = (col: string, val: unknown) => { sets.push(`${col} = $${++idx}`); vals.push(val); };

  if (input.title !== undefined) set('title', input.title);
  if (input.content !== undefined) {
    set('plain_text', input.content);
    set('content', JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: input.content }] }] }));
  }
  if (input.description !== undefined) set('excerpt', input.description);
  if (input.thumbnailUrl !== undefined) set('cover_image', input.thumbnailUrl);
  if (input.categoryId !== undefined) set('category_id', input.categoryId);
  if (input.status !== undefined) { sets.push(`status = $${++idx}::document_status`); vals.push(input.status); }
  if (input.isPinned !== undefined) set('is_pinned', input.isPinned);
  if (input.fileUrl !== undefined || input.fileType !== undefined) {
    const meta = (current as { metadata?: { attachments?: unknown[] } })?.metadata ?? {};
    const attachments = Array.isArray(meta.attachments) ? meta.attachments : [];
    if (input.fileUrl) {
      attachments[0] = { url: input.fileUrl, fileName: (current.title || 'doc') + (input.fileType ? '.' + input.fileType : ''), fileType: input.fileType ?? 'file' };
    }
    set('metadata', JSON.stringify({ ...meta, attachments }));
  }

  if (sets.length > 1) {
    vals.push(docId);
    await query(`UPDATE knowledge_documents SET ${sets.join(', ')} WHERE id = $${++idx}`, vals);
  }

  if (input.tagIds !== undefined) {
    await query(`DELETE FROM knowledge_document_tags WHERE document_id = $1`, [docId]);
    for (const tagId of input.tagIds) {
      await query(`INSERT INTO knowledge_document_tags (document_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [docId, tagId]);
    }
  }

  return getDocumentById(docId);
}

async function resolveDocId(idOrSlug: string): Promise<string | null> {
  const r = await query<{ id: string }>(`SELECT id FROM knowledge_documents WHERE id::text = $1 OR slug = $1`, [idOrSlug]);
  return r.rows[0]?.id ?? null;
}

export async function archiveDocument(id: string) {
  const docId = await resolveDocId(id);
  if (!docId) return null;
  await query(`UPDATE knowledge_documents SET status = 'archived', updated_at = NOW() WHERE id = $1`, [docId]);
  return getDocumentById(docId);
}

export async function restoreDocument(id: string) {
  const docId = await resolveDocId(id);
  if (!docId) return null;
  await query(`UPDATE knowledge_documents SET status = 'published', updated_at = NOW() WHERE id = $1`, [docId]);
  return getDocumentById(docId);
}

export async function deleteDocumentPermanently(id: string) {
  const docId = await resolveDocId(id);
  if (!docId) return;
  await query(`DELETE FROM knowledge_documents WHERE id = $1`, [docId]);
}

export async function incrementDownloadCount(id: string) {
  return getDocumentById(id);
}

export async function incrementViews(id: string) {
  const docId = await resolveDocId(id);
  if (!docId) return;
  await query(`UPDATE knowledge_documents SET view_count = COALESCE(view_count, 0) + 1 WHERE id = $1`, [docId]);
}

export async function getDocumentVersions(id: string) {
  const result = await query<{ id: string; title: string; version_number: number; change_note: string | null; updated_at: string; created_by: string | null }>(
    `SELECT v.id::text AS id, d.title, v.version_number AS version, v.change_note AS version_label, v.created_at::text AS updated_at, v.created_by AS last_updated_by
     FROM knowledge_document_versions v
     JOIN knowledge_documents d ON d.id = v.document_id
     WHERE d.id::text = $1 OR d.slug = $1
     ORDER BY v.version_number DESC`,
    [id]
  );
  return result.rows.map((r) => ({ id: r.id, title: r.title, version: r.version_number, version_label: r.change_note, updated_at: r.updated_at, last_updated_by: r.created_by }));
}

/* ============================================================
   SEARCH (full-text across title, description, content, tags, category)
   ============================================================ */

export async function searchDocuments(q: string, params: Omit<ListDocumentsParams, 'search'> = {}) {
  return listDocuments({ ...params, search: q });
}

/* ============================================================
   CATEGORIES
   ============================================================ */

export async function listCategories() {
  const result = await query<KbCategoryRow>(
    `SELECT c.*, (SELECT COUNT(*)::int FROM knowledge_documents d WHERE d.category_id = c.id AND d.status != 'archived') AS document_count
     FROM knowledge_categories c ORDER BY c.sort_order ASC, c.name ASC`
  );
  return result.rows;
}

export async function getCategoryById(id: string) {
  const result = await query<KbCategoryRow>(`SELECT * FROM knowledge_categories WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function createCategory(data: { name: string; slug?: string; icon?: string; color?: string; sortOrder?: number }) {
  const slug = data.slug || slugify(data.name);
  const result = await query<KbCategoryRow>(
    `INSERT INTO knowledge_categories (name, slug, icon, color, sort_order) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [data.name, slug, data.icon ?? null, data.color ?? null, data.sortOrder ?? 0]
  );
  return result.rows[0];
}

export async function updateCategory(id: string, data: { name?: string; slug?: string; icon?: string; color?: string; sortOrder?: number }) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 0;
  if (data.name !== undefined) { sets.push(`name = $${++idx}`); vals.push(data.name); }
  if (data.slug !== undefined) { sets.push(`slug = $${++idx}`); vals.push(data.slug); }
  if (data.icon !== undefined) { sets.push(`icon = $${++idx}`); vals.push(data.icon); }
  if (data.color !== undefined) { sets.push(`color = $${++idx}`); vals.push(data.color); }
  if (data.sortOrder !== undefined) { sets.push(`sort_order = $${++idx}`); vals.push(data.sortOrder); }
  if (!sets.length) return getCategoryById(id);
  vals.push(id);
  await query(`UPDATE knowledge_categories SET ${sets.join(', ')} WHERE id = $${++idx}`, vals);
  return getCategoryById(id);
}

export async function deleteCategory(id: string) {
  await query(`UPDATE knowledge_documents SET category_id = NULL WHERE category_id = $1`, [id]);
  await query(`UPDATE knowledge_categories SET parent_id = NULL WHERE parent_id = $1`, [id]);
  await query(`DELETE FROM knowledge_categories WHERE id = $1`, [id]);
}

/* ============================================================
   TAGS
   ============================================================ */

export async function listTags() {
  const result = await query<KbTagRow>(
    `SELECT t.*, (SELECT COUNT(*)::int FROM knowledge_document_tags dt WHERE dt.tag_id = t.id) AS document_count
     FROM knowledge_tags t ORDER BY t.name ASC`
  );
  return result.rows;
}

export async function createTag(name: string) {
  const slug = slugify(name);
  const result = await query<KbTagRow>(
    `INSERT INTO knowledge_tags (name, slug) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET name = $1 RETURNING *`,
    [name, slug]
  );
  return result.rows[0];
}

export async function getOrCreateTag(name: string) {
  const existing = await query<KbTagRow>(`SELECT * FROM knowledge_tags WHERE LOWER(name) = LOWER($1) LIMIT 1`, [name]);
  if (existing.rows[0]) return existing.rows[0];
  return createTag(name);
}

/* ============================================================
   COLLECTIONS
   ============================================================ */

export async function listCollections() {
  const result = await query<{ id: string; name: string; description: string | null; is_shared: boolean; owner_id: string; created_at: string; updated_at: string; document_count: number }>(
    `SELECT col.id, col.name, col.description, col.is_shared AS is_public,
            col.owner_id AS created_by, col.created_at, col.updated_at,
            (SELECT COUNT(*)::int FROM knowledge_collection_documents cd WHERE cd.collection_id = col.id) AS document_count
     FROM knowledge_collections col ORDER BY col.updated_at DESC`
  );
  const creatorIds = [...new Set(result.rows.map((r) => r.owner_id).filter(Boolean))];
  const nameMap = await getUserNames(creatorIds);
  return result.rows.map((r) => ({ ...r, created_by: r.owner_id, created_by_name: nameMap[r.owner_id] ?? r.owner_id, slug: '', cover_image: null, share_token: '', is_public: r.is_shared })) as KbCollectionRow[];
}

export async function getCollectionById(id: string) {
  const result = await query<{ id: string; name: string; description: string | null; is_shared: boolean; owner_id: string; created_at: string; updated_at: string; document_count: number }>(
    `SELECT col.id, col.name, col.description, col.is_shared, col.owner_id, col.created_at, col.updated_at,
            (SELECT COUNT(*)::int FROM knowledge_collection_documents cd WHERE cd.collection_id = col.id) AS document_count
     FROM knowledge_collections col WHERE col.id = $1`,
    [id]
  );
  const row = result.rows[0];
  if (!row) return null;
  return { ...row, slug: '', cover_image: null, share_token: '', is_public: row.is_shared, created_by: row.owner_id } as KbCollectionRow;
}

export async function getCollectionByShareToken(_shareToken: string) {
  return null;
}

export async function createCollection(data: { name: string; description?: string; coverImage?: string; isPublic?: boolean; documentIds?: string[]; createdBy: string }) {
  const result = await query<KbCollectionRow & { id: string }>(
    `INSERT INTO knowledge_collections (name, description, owner_id, is_shared) VALUES ($1, $2, $3, $4) RETURNING *`,
    [data.name, data.description ?? null, data.createdBy, data.isPublic ?? false]
  );
  const col = result.rows[0];
  if (data.documentIds?.length) {
    for (let i = 0; i < data.documentIds.length; i++) {
      await query(`INSERT INTO knowledge_collection_documents (collection_id, document_id, sort_order, added_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT (collection_id, document_id) DO NOTHING`, [col.id, data.documentIds[i], i]);
    }
  }
  return getCollectionById(col.id);
}

export async function updateCollection(id: string, data: { name?: string; description?: string; coverImage?: string; isPublic?: boolean; documentIds?: string[] }) {
  const sets: string[] = ['updated_at = NOW()'];
  const vals: unknown[] = [];
  let idx = 0;
  if (data.name !== undefined) { sets.push(`name = $${++idx}`); vals.push(data.name); }
  if (data.description !== undefined) { sets.push(`description = $${++idx}`); vals.push(data.description); }
  if (data.isPublic !== undefined) { sets.push(`is_shared = $${++idx}`); vals.push(data.isPublic); }
  vals.push(id);
  if (sets.length > 1) await query(`UPDATE knowledge_collections SET ${sets.join(', ')} WHERE id = $${++idx}`, vals);
  if (data.documentIds !== undefined) {
    await query(`DELETE FROM knowledge_collection_documents WHERE collection_id = $1`, [id]);
    for (let i = 0; i < data.documentIds.length; i++) {
      await query(`INSERT INTO knowledge_collection_documents (collection_id, document_id, sort_order, added_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT (collection_id, document_id) DO NOTHING`, [id, data.documentIds[i], i]);
    }
  }
  return getCollectionById(id);
}

export async function deleteCollection(id: string) {
  await query(`DELETE FROM knowledge_collections WHERE id = $1`, [id]);
}

export async function getCollectionDocuments(collectionId: string) {
  const result = await query<KbDocRow>(
    `SELECT ${DOC_SELECT}
     ${DOC_FROM}
     JOIN knowledge_collection_documents cd ON cd.document_id = d.id
     WHERE cd.collection_id = $1
     ORDER BY cd.sort_order ASC`,
    [collectionId]
  );
  const docIds = result.rows.map((r) => r.id);
  const tagsMap = await getTagsForDocuments(docIds);
  return result.rows.map((r) => ({ ...r, tags: tagsMap[r.id] ?? [] }));
}

/* ============================================================
   ACKNOWLEDGEMENTS
   ============================================================ */

export async function acknowledgeDocument(_documentId: string, _userId: string) {
}

export async function getUnacknowledgedRequired(_userId: string, _userRole: string) {
  return [];
}

export async function getAcknowledgementsForDocument(_documentId: string) {
  return [];
}

/* ============================================================
   FLAGS
   ============================================================ */

export async function createFlag(documentId: string, flaggedBy: string, reason: string): Promise<KbFlagRow | null> {
  const docId = await resolveDocId(documentId);
  if (!docId) return null;
  const result = await query<{ id: string; document_id: string; flagged_by: string; reason: string; is_resolved: boolean; description: string | null; created_at: string }>(
    `INSERT INTO knowledge_content_flags (document_id, flagged_by, reason) VALUES ($1, $2, LEFT($3, 50)) RETURNING *`,
    [docId, flaggedBy, reason]
  );
  const r = result.rows[0];
  if (!r) return null;
  const doc = await query<{ title: string }>(`SELECT title FROM knowledge_documents WHERE id = $1`, [docId]);
  return { ...r, document_title: doc.rows[0]?.title, status: r.is_resolved ? 'resolved' : 'pending', resolved_by: null, resolved_at: null, resolved_note: r.description } as KbFlagRow;
}

export async function listFlags(status?: string) {
  const where = status === 'pending' ? `WHERE f.is_resolved = false` : status === 'resolved' ? `WHERE f.is_resolved = true` : '';
  const result = await query<KbFlagRow>(
    `SELECT f.id, f.document_id, d.title AS document_title, f.flagged_by,
       ru_flag.full_name AS flagged_by_name, f.resolved_by, ru_res.full_name AS resolved_by_name,
       f.reason, f.description AS resolved_note, f.created_at,
       CASE WHEN f.is_resolved THEN 'resolved' ELSE 'pending' END AS status,
       f.resolved_at
     FROM knowledge_content_flags f
     LEFT JOIN knowledge_documents d ON d.id = f.document_id
     LEFT JOIN reimbursement_users ru_flag ON ru_flag.auth_user_id = f.flagged_by
     LEFT JOIN reimbursement_users ru_res ON ru_res.auth_user_id = f.resolved_by
     ${where}
     ORDER BY f.created_at DESC`
  );
  return result.rows;
}

export async function resolveFlag(id: string, resolvedBy: string, note: string, _newStatus: 'resolved' | 'dismissed' | 'reviewed'): Promise<KbFlagRow | null> {
  await query(`UPDATE knowledge_content_flags SET is_resolved = true, resolved_by = $2, resolved_at = NOW(), description = $3 WHERE id = $1`, [id, resolvedBy, note]);
  const r = (await query<{ id: string; document_id: string; flagged_by: string; reason: string; description: string | null; document_title: string | null; created_at: string }>(`SELECT f.id, f.document_id, f.flagged_by, f.reason, f.description, f.created_at, d.title AS document_title FROM knowledge_content_flags f LEFT JOIN knowledge_documents d ON d.id = f.document_id WHERE f.id = $1`, [id])).rows[0];
  return r ? { ...r, status: 'resolved', resolved_by: resolvedBy, resolved_at: new Date().toISOString(), resolved_note: r.description } as KbFlagRow : null;
}

export async function getPendingFlagCount() {
  const result = await query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM knowledge_content_flags WHERE is_resolved = false`);
  return parseInt(result.rows[0]?.cnt ?? '0', 10);
}

/* ============================================================
   USER PINS
   ============================================================ */

export async function toggleUserPin(userId: string, documentId: string): Promise<boolean> {
  const docId = await resolveDocId(documentId);
  if (!docId) return false;
  const existing = await query(`SELECT id FROM knowledge_bookmarks WHERE user_id = $1 AND document_id = $2`, [userId, docId]);
  if (existing.rows.length) {
    await query(`DELETE FROM knowledge_bookmarks WHERE user_id = $1 AND document_id = $2`, [userId, docId]);
    return false;
  }
  await query(`INSERT INTO knowledge_bookmarks (user_id, document_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, docId]);
  return true;
}

export async function getUserPinnedDocuments(userId: string) {
  const result = await query<KbDocRow>(
    `SELECT ${DOC_SELECT}, TRUE AS user_pinned
     ${DOC_FROM}
     JOIN knowledge_bookmarks b ON b.document_id = d.id AND b.user_id = $1
     ORDER BY b.created_at DESC`,
    [userId]
  );
  const docIds = result.rows.map((r) => r.id);
  const tagsMap = await getTagsForDocuments(docIds);
  const authorIds = [...new Set(result.rows.map((r) => r.author_id))];
  const authorMap = await getUserNames(authorIds);
  return result.rows.map((r) => ({ ...r, tags: tagsMap[r.id] ?? [], author_name: authorMap[r.author_id] ?? r.author_id }));
}

/* ============================================================
   ACTIVITIES
   ============================================================ */

export async function logActivity(action: string, userId: string, documentId?: string, _collectionId?: string, metadata?: Record<string, unknown>) {
  await query(
    `INSERT INTO knowledge_audit_log (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, 'document', $3, $4)`,
    [userId, action, documentId ?? '', JSON.stringify(metadata ?? {})]
  );
}

export async function getRecentActivities(limit = 20) {
  const result = await query<KbActivityRow>(
    `SELECT al.user_id AS user_id, al.action AS action, al.entity_id AS document_id, al.details AS metadata, al.created_at,
       d.title AS document_title, ru.full_name AS user_name, NULL AS collection_id
     FROM knowledge_audit_log al
     LEFT JOIN knowledge_documents d ON d.id::text = al.entity_id
     LEFT JOIN reimbursement_users ru ON ru.auth_user_id = al.user_id
     WHERE al.entity_type = 'document' AND al.action IN ('created','updated','archived','deleted')
     ORDER BY al.created_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

/* ============================================================
   STATS (admin)
   ============================================================ */

export async function getKnowledgeStats() {
  const [totalDocs, totalViews, pendingFlags] = await Promise.all([
    query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM knowledge_documents WHERE status != 'archived'`),
    query<{ cnt: string }>(`SELECT COALESCE(SUM(view_count),0)::text AS cnt FROM knowledge_documents`),
    query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM knowledge_content_flags WHERE is_resolved = false`),
  ]);

  return {
    totalDocuments: parseInt(totalDocs.rows[0]?.cnt ?? '0', 10),
    totalViews: parseInt(totalViews.rows[0]?.cnt ?? '0', 10),
    totalDownloads: 0,
    pendingFlags: parseInt(pendingFlags.rows[0]?.cnt ?? '0', 10),
    pendingRequiredReadings: 0,
  };
}

/* ============================================================
   COMPLIANCE
   ============================================================ */

export async function getComplianceData() {
  return {
    totalRequired: 0,
    fullyAcknowledged: 0,
    totalPending: 0,
    overallRate: 100,
    documents: [],
  };
}

/* ============================================================
   HELPERS
   ============================================================ */

async function getTagsForDocuments(docIds: string[]): Promise<Record<string, { id: string; name: string; slug: string }[]>> {
  if (!docIds.length) return {};
  const result = await query<{ document_id: string; id: string; name: string; slug: string }>(
    `SELECT dt.document_id::text AS document_id, t.id::text AS id, t.name, t.slug
     FROM knowledge_document_tags dt JOIN knowledge_tags t ON t.id = dt.tag_id
     WHERE dt.document_id::text = ANY($1)`,
    [docIds]
  );
  const map: Record<string, { id: string; name: string; slug: string }[]> = {};
  for (const row of result.rows) {
    if (!map[row.document_id]) map[row.document_id] = [];
    map[row.document_id].push({ id: row.id, name: row.name, slug: row.slug });
  }
  return map;
}

async function getUserNames(userIds: string[]): Promise<Record<string, string>> {
  if (!userIds.length) return {};
  const result = await query<{ auth_user_id: string; full_name: string }>(
    `SELECT auth_user_id, full_name FROM reimbursement_users WHERE auth_user_id = ANY($1)`,
    [userIds]
  );
  const map: Record<string, string> = {};
  for (const row of result.rows) {
    map[row.auth_user_id] = row.full_name;
  }
  return map;
}
