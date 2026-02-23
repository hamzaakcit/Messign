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
  d.id, d.title, d.slug, d.content, d.description,
  COALESCE(d.tags, '[]')::jsonb AS tags,
  d.author_id, d.type,
  d.file_url, d.file_type, d.file_size_bytes, d.thumbnail_url,
  COALESCE(d.version, 1) AS version, d.version_label, d.previous_version_id,
  d.category_id, c.name AS category_name, c.slug AS category_slug, c.color AS category_color,
  COALESCE(d.status, 'published') AS status,
  COALESCE(d.is_pinned, FALSE) AS is_pinned,
  COALESCE(d.is_required_reading, FALSE) AS is_required_reading,
  COALESCE(d.required_for_roles, '[]')::jsonb AS required_for_roles,
  d.pin_order,
  COALESCE(d.views, 0)::int AS views,
  COALESCE(d.download_count, 0)::int AS download_count,
  d.published_at, d.new_badge_until,
  d.last_updated_by,
  d.created_at::text AS created_at,
  d.updated_at::text AS updated_at
`;

const DOC_FROM = `
  FROM kb_documents d
  LEFT JOIN kb_categories c ON c.id = d.category_id
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
    conditions.push(`COALESCE(d.status, 'published') = $${++idx}`);
    values.push(status);
  }
  if (search) {
    const pat = `%${search.replace(/%/g, '\\%')}%`;
    conditions.push(`(LOWER(d.title) ILIKE $${++idx} OR LOWER(d.description) ILIKE $${idx} OR LOWER(d.content) ILIKE $${idx})`);
    values.push(pat.toLowerCase());
  }
  if (categorySlug) {
    conditions.push(`c.slug = $${++idx}`);
    values.push(categorySlug);
  }
  if (tagSlug) {
    conditions.push(`EXISTS (SELECT 1 FROM kb_document_tags dt JOIN kb_tags t ON t.id = dt.tag_id WHERE dt.document_id = d.id AND t.slug = $${++idx})`);
    values.push(tagSlug);
  }
  if (fileType) {
    conditions.push(`d.file_type = $${++idx}`);
    values.push(fileType);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  let orderBy = 'ORDER BY d.updated_at DESC';
  if (sort === 'popular') orderBy = 'ORDER BY d.views DESC, d.updated_at DESC';
  if (sort === 'alphabetical') orderBy = 'ORDER BY LOWER(d.title) ASC';

  const offset = (page - 1) * limit;

  // Count
  const countResult = await query<{ total: string }>(
    `SELECT COUNT(*)::text AS total ${DOC_FROM} ${where}`,
    values
  );
  const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

  // Fetch
  let userJoins = '';
  let extraCols = '';
  if (userId) {
    extraCols = `, (SELECT TRUE FROM kb_user_pins p WHERE p.document_id = d.id AND p.user_id = $${++idx}) AS user_pinned,
                   (SELECT TRUE FROM kb_acknowledgements a WHERE a.document_id = d.id AND a.user_id = $${idx}) AS user_acknowledged`;
    values.push(userId);
  }

  const dataResult = await query<KbDocRow>(
    `SELECT ${DOC_SELECT}${extraCols}
     ${DOC_FROM} ${userJoins} ${where}
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
    extraCols = `, (SELECT TRUE FROM kb_user_pins p WHERE p.document_id = d.id AND p.user_id = $2) AS user_pinned,
                   (SELECT TRUE FROM kb_acknowledgements a WHERE a.document_id = d.id AND a.user_id = $2) AS user_acknowledged,
                   (SELECT COUNT(*)::int FROM kb_flags f WHERE f.document_id = d.id AND f.status = 'pending') AS flag_count`;
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
    `SELECT ${DOC_SELECT} ${DOC_FROM} WHERE d.id = $1 LIMIT 1`,
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
    const cond = excludeId ? ` AND id != $2` : '';
    const vals: unknown[] = [candidate];
    if (excludeId) vals.push(excludeId);
    const result = await query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM kb_documents WHERE slug = $1${cond}`, vals);
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
  const id = `doc-${Date.now()}`;
  const slug = await ensureUniqueSlug(input.title);
  const now = new Date().toISOString();
  const newBadgeUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await query(
    `INSERT INTO kb_documents
       (id, title, slug, content, description, file_url, file_type, file_size_bytes, thumbnail_url,
        category_id, status, is_required_reading, required_for_roles,
        is_pinned, pin_order, author_id, tags, type,
        version, version_label, published_at, new_badge_until, views, download_count)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'[]',$17,1,'v1',$18,$19,0,0)`,
    [
      id, input.title, slug,
      input.content ?? '', input.description ?? '',
      input.fileUrl ?? null, input.fileType ?? null, input.fileSizeBytes ?? null, input.thumbnailUrl ?? null,
      input.categoryId ?? null,
      input.status ?? 'published',
      input.isRequiredReading ?? false,
      JSON.stringify(input.requiredForRoles ?? []),
      input.isPinned ?? false, input.pinOrder ?? null,
      input.authorId,
      input.fileType ?? 'wiki',
      now, newBadgeUntil,
    ]
  );

  // Assign tags
  if (input.tagIds?.length) {
    for (const tagId of input.tagIds) {
      await query(`INSERT INTO kb_document_tags (document_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, tagId]);
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

  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 0;

  const set = (col: string, val: unknown) => { sets.push(`${col} = $${++idx}`); vals.push(val); };

  if (input.title !== undefined) set('title', input.title);
  if (input.content !== undefined) set('content', input.content);
  if (input.description !== undefined) set('description', input.description);
  if (input.fileUrl !== undefined) set('file_url', input.fileUrl);
  if (input.fileType !== undefined) { set('file_type', input.fileType); set('type', input.fileType || 'wiki'); }
  if (input.fileSizeBytes !== undefined) set('file_size_bytes', input.fileSizeBytes);
  if (input.thumbnailUrl !== undefined) set('thumbnail_url', input.thumbnailUrl);
  if (input.categoryId !== undefined) set('category_id', input.categoryId);
  if (input.status !== undefined) set('status', input.status);
  if (input.isRequiredReading !== undefined) set('is_required_reading', input.isRequiredReading);
  if (input.requiredForRoles !== undefined) set('required_for_roles', JSON.stringify(input.requiredForRoles));
  if (input.isPinned !== undefined) set('is_pinned', input.isPinned);
  if (input.pinOrder !== undefined) set('pin_order', input.pinOrder);
  set('last_updated_by', input.lastUpdatedBy);
  set('updated_at', new Date().toISOString());

  // Version bump if file changed
  if (input.fileChanged) {
    set('version', (current.version || 1) + 1);
    set('version_label', `v${(current.version || 1) + 1}`);
    set('new_badge_until', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString());
  }

  if (sets.length) {
    await query(`UPDATE kb_documents SET ${sets.join(', ')} WHERE id = $${++idx}`, [...vals, id]);
  }

  // Update tags
  if (input.tagIds !== undefined) {
    await query(`DELETE FROM kb_document_tags WHERE document_id = $1`, [id]);
    for (const tagId of input.tagIds) {
      await query(`INSERT INTO kb_document_tags (document_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, tagId]);
    }
  }

  return getDocumentById(id);
}

export async function archiveDocument(id: string) {
  await query(`UPDATE kb_documents SET status = 'archived', updated_at = NOW() WHERE id = $1`, [id]);
  return getDocumentById(id);
}

export async function restoreDocument(id: string) {
  await query(`UPDATE kb_documents SET status = 'published', updated_at = NOW() WHERE id = $1`, [id]);
  return getDocumentById(id);
}

export async function deleteDocumentPermanently(id: string) {
  await query(`DELETE FROM kb_documents WHERE id = $1`, [id]);
}

export async function incrementDownloadCount(id: string) {
  await query(`UPDATE kb_documents SET download_count = COALESCE(download_count, 0) + 1 WHERE id = $1`, [id]);
  return getDocumentById(id);
}

export async function incrementViews(id: string) {
  await query(`UPDATE kb_documents SET views = COALESCE(views, 0) + 1 WHERE id = $1`, [id]);
}

export async function getDocumentVersions(id: string) {
  // Walk the version chain backwards
  const result = await query<{ id: string; title: string; version: number; version_label: string | null; updated_at: string; last_updated_by: string | null }>(
    `WITH RECURSIVE chain AS (
       SELECT id, title, COALESCE(version,1) AS version, version_label, updated_at::text AS updated_at, last_updated_by, previous_version_id
       FROM kb_documents WHERE id = $1
       UNION ALL
       SELECT d.id, d.title, COALESCE(d.version,1), d.version_label, d.updated_at::text, d.last_updated_by, d.previous_version_id
       FROM kb_documents d JOIN chain c ON d.id = c.previous_version_id
     )
     SELECT id, title, version, version_label, updated_at, last_updated_by FROM chain ORDER BY version DESC`,
    [id]
  );
  return result.rows;
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
    `SELECT c.*, (SELECT COUNT(*)::int FROM kb_documents d WHERE d.category_id = c.id AND COALESCE(d.status,'published') != 'archived') AS document_count
     FROM kb_categories c ORDER BY c.sort_order ASC, c.name ASC`
  );
  return result.rows;
}

export async function getCategoryById(id: string) {
  const result = await query<KbCategoryRow>(`SELECT * FROM kb_categories WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function createCategory(data: { name: string; slug?: string; icon?: string; color?: string; sortOrder?: number }) {
  const slug = data.slug || slugify(data.name);
  const result = await query<KbCategoryRow>(
    `INSERT INTO kb_categories (name, slug, icon, color, sort_order) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
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
  await query(`UPDATE kb_categories SET ${sets.join(', ')} WHERE id = $${++idx}`, [...vals, id]);
  return getCategoryById(id);
}

export async function deleteCategory(id: string) {
  // Unlink documents first
  await query(`UPDATE kb_documents SET category_id = NULL WHERE category_id = $1`, [id]);
  await query(`DELETE FROM kb_categories WHERE id = $1`, [id]);
}

/* ============================================================
   TAGS
   ============================================================ */

export async function listTags() {
  const result = await query<KbTagRow>(
    `SELECT t.*, (SELECT COUNT(*)::int FROM kb_document_tags dt WHERE dt.tag_id = t.id) AS document_count
     FROM kb_tags t ORDER BY t.name ASC`
  );
  return result.rows;
}

export async function createTag(name: string) {
  const slug = slugify(name);
  const result = await query<KbTagRow>(
    `INSERT INTO kb_tags (name, slug) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET name = $1 RETURNING *`,
    [name, slug]
  );
  return result.rows[0];
}

export async function getOrCreateTag(name: string) {
  const existing = await query<KbTagRow>(`SELECT * FROM kb_tags WHERE LOWER(name) = LOWER($1) LIMIT 1`, [name]);
  if (existing.rows[0]) return existing.rows[0];
  return createTag(name);
}

/* ============================================================
   COLLECTIONS
   ============================================================ */

export async function listCollections() {
  const result = await query<KbCollectionRow>(
    `SELECT col.*,
       (SELECT COUNT(*)::int FROM kb_collection_documents cd WHERE cd.collection_id = col.id) AS document_count
     FROM kb_collections col ORDER BY col.created_at DESC`
  );
  // get creator names
  const creatorIds = [...new Set(result.rows.map(r => r.created_by))];
  const nameMap = await getUserNames(creatorIds);
  return result.rows.map(r => ({ ...r, created_by_name: nameMap[r.created_by] ?? r.created_by }));
}

export async function getCollectionById(id: string) {
  const result = await query<KbCollectionRow>(
    `SELECT col.*, (SELECT COUNT(*)::int FROM kb_collection_documents cd WHERE cd.collection_id = col.id) AS document_count
     FROM kb_collections col WHERE col.id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function getCollectionByShareToken(shareToken: string) {
  const result = await query<KbCollectionRow>(
    `SELECT col.*, (SELECT COUNT(*)::int FROM kb_collection_documents cd WHERE cd.collection_id = col.id) AS document_count
     FROM kb_collections col WHERE col.share_token = $1`,
    [shareToken]
  );
  const col = result.rows[0];
  if (!col) return null;

  // get documents
  const docsResult = await query<KbDocRow>(
    `SELECT ${DOC_SELECT}
     ${DOC_FROM}
     JOIN kb_collection_documents cd ON cd.document_id = d.id
     WHERE cd.collection_id = $1
     ORDER BY cd.sort_order ASC`,
    [col.id]
  );
  const docIds = docsResult.rows.map(r => r.id);
  const tagsMap = await getTagsForDocuments(docIds);
  const docs = docsResult.rows.map(r => ({ ...r, tags: tagsMap[r.id] ?? [] }));

  return { ...col, documents: docs };
}

export async function createCollection(data: { name: string; description?: string; coverImage?: string; isPublic?: boolean; documentIds?: string[]; createdBy: string }) {
  const slug = slugify(data.name) + '-' + Date.now();
  const result = await query<KbCollectionRow>(
    `INSERT INTO kb_collections (name, slug, description, cover_image, is_public, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [data.name, slug, data.description ?? null, data.coverImage ?? null, data.isPublic ?? false, data.createdBy]
  );
  const col = result.rows[0];
  if (data.documentIds?.length) {
    for (let i = 0; i < data.documentIds.length; i++) {
      await query(`INSERT INTO kb_collection_documents (collection_id, document_id, sort_order) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [col.id, data.documentIds[i], i]);
    }
  }
  return getCollectionById(col.id);
}

export async function updateCollection(id: string, data: { name?: string; description?: string; coverImage?: string; isPublic?: boolean; documentIds?: string[] }) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 0;
  if (data.name !== undefined) { sets.push(`name = $${++idx}`); vals.push(data.name); }
  if (data.description !== undefined) { sets.push(`description = $${++idx}`); vals.push(data.description); }
  if (data.coverImage !== undefined) { sets.push(`cover_image = $${++idx}`); vals.push(data.coverImage); }
  if (data.isPublic !== undefined) { sets.push(`is_public = $${++idx}`); vals.push(data.isPublic); }
  sets.push(`updated_at = NOW()`);
  if (sets.length > 1) {
    await query(`UPDATE kb_collections SET ${sets.join(', ')} WHERE id = $${++idx}`, [...vals, id]);
  }
  if (data.documentIds !== undefined) {
    await query(`DELETE FROM kb_collection_documents WHERE collection_id = $1`, [id]);
    for (let i = 0; i < data.documentIds.length; i++) {
      await query(`INSERT INTO kb_collection_documents (collection_id, document_id, sort_order) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [id, data.documentIds[i], i]);
    }
  }
  return getCollectionById(id);
}

export async function deleteCollection(id: string) {
  await query(`DELETE FROM kb_collections WHERE id = $1`, [id]);
}

export async function getCollectionDocuments(collectionId: string) {
  const result = await query<KbDocRow>(
    `SELECT ${DOC_SELECT}
     ${DOC_FROM}
     JOIN kb_collection_documents cd ON cd.document_id = d.id
     WHERE cd.collection_id = $1
     ORDER BY cd.sort_order ASC`,
    [collectionId]
  );
  const docIds = result.rows.map(r => r.id);
  const tagsMap = await getTagsForDocuments(docIds);
  return result.rows.map(r => ({ ...r, tags: tagsMap[r.id] ?? [] }));
}

/* ============================================================
   ACKNOWLEDGEMENTS
   ============================================================ */

export async function acknowledgeDocument(documentId: string, userId: string) {
  await query(
    `INSERT INTO kb_acknowledgements (document_id, user_id) VALUES ($1, $2) ON CONFLICT (document_id, user_id) DO NOTHING`,
    [documentId, userId]
  );
}

export async function getUnacknowledgedRequired(userId: string, userRole: string) {
  const result = await query<KbDocRow>(
    `SELECT ${DOC_SELECT}
     ${DOC_FROM}
     WHERE d.is_required_reading = TRUE
       AND COALESCE(d.status, 'published') = 'published'
       AND NOT EXISTS (SELECT 1 FROM kb_acknowledgements a WHERE a.document_id = d.id AND a.user_id = $1)
       AND (d.required_for_roles = '[]'::jsonb OR d.required_for_roles @> $2::jsonb)
     ORDER BY d.published_at DESC`,
    [userId, JSON.stringify([userRole])]
  );
  return result.rows;
}

export async function getAcknowledgementsForDocument(documentId: string) {
  const result = await query<KbAckRow>(
    `SELECT a.*, ru.full_name AS user_name
     FROM kb_acknowledgements a
     LEFT JOIN reimbursement_users ru ON ru.auth_user_id = a.user_id
     WHERE a.document_id = $1
     ORDER BY a.acknowledged_at DESC`,
    [documentId]
  );
  return result.rows;
}

/* ============================================================
   FLAGS
   ============================================================ */

export async function createFlag(documentId: string, flaggedBy: string, reason: string) {
  const result = await query<KbFlagRow>(
    `INSERT INTO kb_flags (document_id, flagged_by, reason) VALUES ($1, $2, $3) RETURNING *`,
    [documentId, flaggedBy, reason]
  );
  return result.rows[0];
}

export async function listFlags(status?: string) {
  const where = status ? `WHERE f.status = $1` : '';
  const vals = status ? [status] : [];
  const result = await query<KbFlagRow>(
    `SELECT f.*, d.title AS document_title,
       ru_flag.full_name AS flagged_by_name,
       ru_res.full_name AS resolved_by_name
     FROM kb_flags f
     LEFT JOIN kb_documents d ON d.id = f.document_id
     LEFT JOIN reimbursement_users ru_flag ON ru_flag.auth_user_id = f.flagged_by
     LEFT JOIN reimbursement_users ru_res ON ru_res.auth_user_id = f.resolved_by
     ${where}
     ORDER BY f.created_at DESC`,
    vals
  );
  return result.rows;
}

export async function resolveFlag(id: string, resolvedBy: string, note: string, newStatus: 'resolved' | 'dismissed' | 'reviewed') {
  await query(
    `UPDATE kb_flags SET status = $1, resolved_by = $2, resolved_note = $3, resolved_at = NOW() WHERE id = $4`,
    [newStatus, resolvedBy, note, id]
  );
  return (await query<KbFlagRow>(`SELECT * FROM kb_flags WHERE id = $1`, [id])).rows[0];
}

export async function getPendingFlagCount() {
  const result = await query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM kb_flags WHERE status = 'pending'`);
  return parseInt(result.rows[0]?.cnt ?? '0', 10);
}

/* ============================================================
   USER PINS
   ============================================================ */

export async function toggleUserPin(userId: string, documentId: string): Promise<boolean> {
  const existing = await query(`SELECT id FROM kb_user_pins WHERE user_id = $1 AND document_id = $2`, [userId, documentId]);
  if (existing.rows.length) {
    await query(`DELETE FROM kb_user_pins WHERE user_id = $1 AND document_id = $2`, [userId, documentId]);
    return false; // unpinned
  } else {
    await query(`INSERT INTO kb_user_pins (user_id, document_id) VALUES ($1, $2)`, [userId, documentId]);
    return true; // pinned
  }
}

export async function getUserPinnedDocuments(userId: string) {
  const result = await query<KbDocRow>(
    `SELECT ${DOC_SELECT}, TRUE AS user_pinned
     ${DOC_FROM}
     JOIN kb_user_pins p ON p.document_id = d.id AND p.user_id = $1
     ORDER BY p.created_at DESC`,
    [userId]
  );
  const docIds = result.rows.map(r => r.id);
  const tagsMap = await getTagsForDocuments(docIds);
  const authorIds = [...new Set(result.rows.map(r => r.author_id))];
  const authorMap = await getUserNames(authorIds);
  return result.rows.map(r => ({ ...r, tags: tagsMap[r.id] ?? [], author_name: authorMap[r.author_id] ?? r.author_id }));
}

/* ============================================================
   ACTIVITIES
   ============================================================ */

export async function logActivity(action: string, userId: string, documentId?: string, collectionId?: string, metadata?: Record<string, unknown>) {
  await query(
    `INSERT INTO kb_activities (action, document_id, collection_id, user_id, metadata) VALUES ($1, $2, $3, $4, $5)`,
    [action, documentId ?? null, collectionId ?? null, userId, JSON.stringify(metadata ?? {})]
  );
}

export async function getRecentActivities(limit = 20) {
  const result = await query<KbActivityRow>(
    `SELECT a.*, d.title AS document_title, ru.full_name AS user_name
     FROM kb_activities a
     LEFT JOIN kb_documents d ON d.id = a.document_id
     LEFT JOIN reimbursement_users ru ON ru.auth_user_id = a.user_id
     ORDER BY a.created_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

/* ============================================================
   STATS (admin)
   ============================================================ */

export async function getKnowledgeStats() {
  const [totalDocs, totalViews, totalDownloads, pendingFlags, pendingRequired] = await Promise.all([
    query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM kb_documents WHERE COALESCE(status,'published') != 'archived'`),
    query<{ cnt: string }>(`SELECT COALESCE(SUM(views),0)::text AS cnt FROM kb_documents`),
    query<{ cnt: string }>(`SELECT COALESCE(SUM(download_count),0)::text AS cnt FROM kb_documents`),
    query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM kb_flags WHERE status = 'pending'`),
    query<{ cnt: string }>(
      `SELECT COUNT(DISTINCT d.id)::text AS cnt FROM kb_documents d
       WHERE d.is_required_reading = TRUE AND COALESCE(d.status,'published') = 'published'
         AND EXISTS (
           SELECT 1 FROM reimbursement_users ru
           WHERE NOT EXISTS (SELECT 1 FROM kb_acknowledgements a WHERE a.document_id = d.id AND a.user_id = ru.auth_user_id)
         )`
    ),
  ]);

  return {
    totalDocuments: parseInt(totalDocs.rows[0]?.cnt ?? '0', 10),
    totalViews: parseInt(totalViews.rows[0]?.cnt ?? '0', 10),
    totalDownloads: parseInt(totalDownloads.rows[0]?.cnt ?? '0', 10),
    pendingFlags: parseInt(pendingFlags.rows[0]?.cnt ?? '0', 10),
    pendingRequiredReadings: parseInt(pendingRequired.rows[0]?.cnt ?? '0', 10),
  };
}

/* ============================================================
   COMPLIANCE
   ============================================================ */

export async function getComplianceData() {
  // Get all required reading documents
  const docsResult = await query<{ id: string; title: string; required_for_roles: string[]; status: string }>(
    `SELECT id, title, COALESCE(required_for_roles, '[]')::jsonb AS required_for_roles, COALESCE(status,'published') AS status
     FROM kb_documents
     WHERE is_required_reading = TRUE AND COALESCE(status,'published') = 'published'
     ORDER BY title`
  );

  const totalUsersResult = await query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM reimbursement_users WHERE auth_user_id IS NOT NULL`);
  const totalUsers = parseInt(totalUsersResult.rows[0]?.cnt ?? '0', 10);

  const compliance = [];
  for (const doc of docsResult.rows) {
    const ackResult = await query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM kb_acknowledgements WHERE document_id = $1`, [doc.id]
    );
    const acknowledged = parseInt(ackResult.rows[0]?.cnt ?? '0', 10);
    compliance.push({
      documentId: doc.id,
      title: doc.title,
      requiredForRoles: doc.required_for_roles,
      totalUsers,
      acknowledged,
      pending: Math.max(0, totalUsers - acknowledged),
      compliancePercent: totalUsers > 0 ? Math.round((acknowledged / totalUsers) * 100) : 0,
    });
  }

  const fullyAcknowledged = compliance.filter(c => c.pending === 0).length;
  const totalPending = compliance.reduce((sum, c) => sum + c.pending, 0);
  const overallRate = compliance.length > 0
    ? Math.round(compliance.reduce((s, c) => s + c.compliancePercent, 0) / compliance.length)
    : 100;

  return {
    totalRequired: compliance.length,
    fullyAcknowledged,
    totalPending,
    overallRate,
    documents: compliance,
  };
}

/* ============================================================
   HELPERS
   ============================================================ */

async function getTagsForDocuments(docIds: string[]): Promise<Record<string, { id: string; name: string; slug: string }[]>> {
  if (!docIds.length) return {};
  const result = await query<{ document_id: string; id: string; name: string; slug: string }>(
    `SELECT dt.document_id, t.id, t.name, t.slug
     FROM kb_document_tags dt JOIN kb_tags t ON t.id = dt.tag_id
     WHERE dt.document_id = ANY($1)`,
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
