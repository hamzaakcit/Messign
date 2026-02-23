import { query } from './index.js';

// ============================================================
// TYPES
// ============================================================

interface KhDocRow {
  id: string; title: string; slug: string; content: unknown; plain_text: string | null;
  excerpt: string | null; cover_image: string | null; status: string; document_type: string;
  metadata: unknown; author_id: string; category_id: string | null; is_public: boolean;
  is_pinned: boolean; is_featured: boolean; view_count: number; last_viewed_at: string | null;
  published_at: string | null; archived_at: string | null; created_at: string; updated_at: string;
  author_name?: string; category_name?: string; category_slug?: string; category_color?: string;
  tags?: unknown[]; bookmark_count?: number; comment_count?: number;
}

interface KhCategoryRow {
  id: string; name: string; slug: string; description: string | null; icon: string | null;
  color: string | null; parent_id: string | null; sort_order: number;
  created_at: string; updated_at: string; document_count?: number;
}

interface KhTagRow { id: string; name: string; slug: string; color: string | null; created_by: string | null; created_at: string; document_count?: number; }
interface KhVersionRow { id: string; document_id: string; version_number: number; content: unknown; plain_text: string | null; change_note: string | null; created_by: string; created_at: string; author_name?: string; }
interface KhCommentRow { id: string; document_id: string; author_id: string; content: string; selection_from: number | null; selection_to: number | null; selected_text: string | null; parent_id: string | null; is_resolved: boolean; created_at: string; updated_at: string; author_name?: string; replies?: KhCommentRow[]; }
interface KhBookmarkRow { id: string; user_id: string; document_id: string; created_at: string; }
interface KhCollectionRow { id: string; name: string; description: string | null; owner_id: string; is_shared: boolean; created_at: string; updated_at: string; document_count?: number; }
interface KhNotificationRow { id: string; user_id: string; type: string; title: string; message: string; link: string | null; is_read: boolean; related_document_id: string | null; created_at: string; }

// ============================================================
// HELPERS
// ============================================================

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '').slice(0, 200);
}

async function getUserNames(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
  const res = await query<{ id: string; full_name: string }>(
    `SELECT id, full_name FROM reimbursement_users WHERE id IN (${placeholders})`, ids
  );
  const map: Record<string, string> = {};
  for (const r of res.rows) map[r.id] = r.full_name;
  return map;
}

async function getTagsForDocs(docIds: string[]): Promise<Record<string, { id: string; name: string; slug: string; color: string | null }[]>> {
  if (!docIds.length) return {};
  const placeholders = docIds.map((_, i) => `$${i + 1}`).join(',');
  const res = await query<{ document_id: string; id: string; name: string; slug: string; color: string | null }>(
    `SELECT dt.document_id, t.id, t.name, t.slug, t.color
     FROM knowledge_document_tags dt JOIN knowledge_tags t ON t.id = dt.tag_id
     WHERE dt.document_id IN (${placeholders})`, docIds
  );
  const map: Record<string, { id: string; name: string; slug: string; color: string | null }[]> = {};
  for (const r of res.rows) {
    if (!map[r.document_id]) map[r.document_id] = [];
    map[r.document_id].push({ id: r.id, name: r.name, slug: r.slug, color: r.color });
  }
  return map;
}

// ============================================================
// DOCUMENTS
// ============================================================

const DOC_SELECT = `
  d.id, d.title, d.slug, d.content, d.plain_text, d.excerpt, d.cover_image,
  d.status, d.document_type, d.metadata, d.author_id, d.category_id,
  d.is_public, d.is_pinned, d.is_featured, d.view_count,
  d.last_viewed_at, d.published_at, d.archived_at, d.created_at, d.updated_at,
  c.name AS category_name, c.slug AS category_slug, c.color AS category_color`;

const DOC_FROM = `
  FROM knowledge_documents d
  LEFT JOIN knowledge_categories c ON c.id = d.category_id`;

export interface ListDocsParams {
  search?: string; category?: string; tag?: string; type?: string; status?: string;
  authorId?: string; teamId?: string; featured?: boolean; pinned?: boolean;
  sort?: 'recent' | 'popular' | 'alphabetical' | 'oldest';
  page?: number; limit?: number; userId?: string;
}

export async function listDocuments(params: ListDocsParams = {}) {
  const { search, category, tag, type, status, authorId, teamId, featured, pinned,
    sort = 'recent', page = 1, limit = 20, userId } = params;

  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 0;

  if (search) { conditions.push(`(d.title ILIKE $${++idx} OR d.plain_text ILIKE $${idx})`); values.push(`%${search}%`); }
  if (category) { conditions.push(`c.slug = $${++idx}`); values.push(category); }
  if (tag) { conditions.push(`EXISTS (SELECT 1 FROM knowledge_document_tags dt JOIN knowledge_tags t ON t.id = dt.tag_id WHERE dt.document_id = d.id AND t.slug = $${++idx})`); values.push(tag); }
  if (type) { conditions.push(`d.document_type = $${++idx}::document_type`); values.push(type); }
  // Default to published+in_review when no status filter; use 'all' to show all statuses
  if (status === 'all') {
    // No status filter - show all
  } else if (status) {
    conditions.push(`d.status = $${++idx}::document_status`); values.push(status);
  } else {
    conditions.push(`d.status IN ('published', 'in_review')`);
  }
  if (authorId) { conditions.push(`d.author_id = $${++idx}`); values.push(authorId); }
  if (featured) conditions.push(`d.is_featured = true`);
  if (pinned) conditions.push(`d.is_pinned = true`);
  if (teamId) { conditions.push(`(d.is_public = true OR EXISTS (SELECT 1 FROM knowledge_team_access ta WHERE ta.document_id = d.id AND ta.team_id = $${++idx}))`); values.push(teamId); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderMap: Record<string, string> = { recent: 'd.updated_at DESC', popular: 'd.view_count DESC', alphabetical: 'd.title ASC', oldest: 'd.created_at ASC' };
  const orderBy = `ORDER BY d.is_pinned DESC, ${orderMap[sort] || orderMap.recent}`;

  const countRes = await query<{ count: string }>(`SELECT COUNT(*)::int AS count ${DOC_FROM} ${where}`, values);
  const total = parseInt(countRes.rows[0]?.count || '0');
  const offset = (page - 1) * limit;

  const dataRes = await query<KhDocRow>(
    `SELECT ${DOC_SELECT} ${DOC_FROM} ${where} ${orderBy} LIMIT $${++idx} OFFSET $${++idx}`,
    [...values, limit, offset]
  );

  const docIds = dataRes.rows.map(r => r.id);
  const tagsMap = await getTagsForDocs(docIds);
  const authorIds = [...new Set(dataRes.rows.map(r => r.author_id))];
  const authorMap = await getUserNames(authorIds);

  const docs = dataRes.rows.map(row => ({
    ...row,
    tags: tagsMap[row.id] ?? [],
    author_name: authorMap[row.author_id] ?? row.author_id,
  }));

  return { docs, total, page, limit };
}

export async function getDocumentById(id: string, userId?: string) {
  let extra = '';
  const values: unknown[] = [id];
  if (userId) {
    extra = `, (SELECT TRUE FROM knowledge_bookmarks b WHERE b.document_id = d.id AND b.user_id = $2) AS is_bookmarked`;
    values.push(userId);
  }
  const res = await query<KhDocRow & { is_bookmarked?: boolean }>(
    `SELECT ${DOC_SELECT}${extra} ${DOC_FROM} WHERE d.id = $1`, values
  );
  const row = res.rows[0];
  if (!row) return null;
  const tagsMap = await getTagsForDocs([row.id]);
  const authorMap = await getUserNames([row.author_id]);
  return { ...row, tags: tagsMap[row.id] ?? [], author_name: authorMap[row.author_id] ?? row.author_id };
}

export async function getDocumentBySlug(slug: string, userId?: string) {
  let extra = '';
  const values: unknown[] = [slug];
  if (userId) {
    extra = `, (SELECT TRUE FROM knowledge_bookmarks b WHERE b.document_id = d.id AND b.user_id = $2) AS is_bookmarked`;
    values.push(userId);
  }
  const res = await query<KhDocRow & { is_bookmarked?: boolean }>(
    `SELECT ${DOC_SELECT}${extra} ${DOC_FROM} WHERE d.slug = $1`, values
  );
  const row = res.rows[0];
  if (!row) return null;
  const tagsMap = await getTagsForDocs([row.id]);
  const authorMap = await getUserNames([row.author_id]);
  return { ...row, tags: tagsMap[row.id] ?? [], author_name: authorMap[row.author_id] ?? row.author_id };
}

export interface CreateDocInput {
  title: string; content?: unknown; plainText?: string; excerpt?: string;
  coverImage?: string; documentType?: string; metadata?: unknown;
  authorId: string; categoryId?: string; tagIds?: string[];
  isPublic?: boolean; isPinned?: boolean; isFeatured?: boolean;
  status?: string; teamIds?: string[];
}

export async function createDocument(input: CreateDocInput) {
  const slug = slugify(input.title) + '-' + Date.now().toString(36);
  const res = await query<KhDocRow>(
    `INSERT INTO knowledge_documents
      (title, slug, content, plain_text, excerpt, cover_image, status, document_type,
       metadata, author_id, category_id, is_public, is_pinned, is_featured, published_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7::document_status,$8::document_type,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      input.title, slug, JSON.stringify(input.content ?? {}), input.plainText ?? '',
      input.excerpt ?? '', input.coverImage ?? null,
      input.status ?? 'draft', input.documentType ?? 'guide',
      JSON.stringify(input.metadata ?? {}), input.authorId,
      input.categoryId ?? null, input.isPublic ?? false,
      input.isPinned ?? false, input.isFeatured ?? false,
      input.status === 'published' ? new Date() : null,
    ]
  );
  const doc = res.rows[0];
  if (doc && input.tagIds?.length) {
    const tagVals = input.tagIds.map((tid, i) => `($1, $${i + 2})`).join(',');
    await query(`INSERT INTO knowledge_document_tags (document_id, tag_id) VALUES ${tagVals} ON CONFLICT DO NOTHING`, [doc.id, ...input.tagIds]);
  }
  if (doc && input.teamIds?.length) {
    const teamVals = input.teamIds.map((_, i) => `($1, $${i + 2})`).join(',');
    await query(`INSERT INTO knowledge_team_access (document_id, team_id) VALUES ${teamVals} ON CONFLICT DO NOTHING`, [doc.id, ...input.teamIds]);
  }
  return doc;
}

export interface UpdateDocInput {
  title?: string; content?: unknown; plainText?: string; excerpt?: string;
  coverImage?: string; documentType?: string; metadata?: unknown;
  categoryId?: string | null; tagIds?: string[];
  isPublic?: boolean; isPinned?: boolean; isFeatured?: boolean;
  status?: string; teamIds?: string[];
}

export async function updateDocument(id: string, input: UpdateDocInput) {
  const sets: string[] = ['updated_at = NOW()'];
  const vals: unknown[] = [];
  let idx = 0;

  if (input.title !== undefined) { sets.push(`title = $${++idx}`); vals.push(input.title); }
  if (input.content !== undefined) { sets.push(`content = $${++idx}`); vals.push(JSON.stringify(input.content)); }
  if (input.plainText !== undefined) { sets.push(`plain_text = $${++idx}`); vals.push(input.plainText); }
  if (input.excerpt !== undefined) { sets.push(`excerpt = $${++idx}`); vals.push(input.excerpt); }
  if (input.coverImage !== undefined) { sets.push(`cover_image = $${++idx}`); vals.push(input.coverImage); }
  if (input.documentType !== undefined) { sets.push(`document_type = $${++idx}::document_type`); vals.push(input.documentType); }
  if (input.metadata !== undefined) { sets.push(`metadata = $${++idx}`); vals.push(JSON.stringify(input.metadata)); }
  if (input.categoryId !== undefined) { sets.push(`category_id = $${++idx}`); vals.push(input.categoryId); }
  if (input.isPublic !== undefined) { sets.push(`is_public = $${++idx}`); vals.push(input.isPublic); }
  if (input.isPinned !== undefined) { sets.push(`is_pinned = $${++idx}`); vals.push(input.isPinned); }
  if (input.isFeatured !== undefined) { sets.push(`is_featured = $${++idx}`); vals.push(input.isFeatured); }
  if (input.status !== undefined) {
    sets.push(`status = $${++idx}::document_status`); vals.push(input.status);
    if (input.status === 'published') { sets.push(`published_at = NOW()`); }
    if (input.status === 'archived') { sets.push(`archived_at = NOW()`); }
  }

  vals.push(id);
  const res = await query<KhDocRow>(`UPDATE knowledge_documents SET ${sets.join(', ')} WHERE id = $${++idx} RETURNING *`, vals);
  const doc = res.rows[0];

  if (doc && input.tagIds !== undefined) {
    await query(`DELETE FROM knowledge_document_tags WHERE document_id = $1`, [id]);
    if (input.tagIds.length) {
      const tagVals = input.tagIds.map((_, i) => `($1, $${i + 2})`).join(',');
      await query(`INSERT INTO knowledge_document_tags (document_id, tag_id) VALUES ${tagVals} ON CONFLICT DO NOTHING`, [id, ...input.tagIds]);
    }
  }
  if (doc && input.teamIds !== undefined) {
    await query(`DELETE FROM knowledge_team_access WHERE document_id = $1`, [id]);
    if (input.teamIds.length) {
      const teamVals = input.teamIds.map((_, i) => `($1, $${i + 2})`).join(',');
      await query(`INSERT INTO knowledge_team_access (document_id, team_id) VALUES ${teamVals} ON CONFLICT DO NOTHING`, [id, ...input.teamIds]);
    }
  }
  return doc;
}

export async function deleteDocument(id: string) {
  await query(`DELETE FROM knowledge_documents WHERE id = $1`, [id]);
}

export async function archiveDocument(id: string) {
  return updateDocument(id, { status: 'archived' });
}

export async function incrementViewCount(id: string, userId: string) {
  await query(`UPDATE knowledge_documents SET view_count = view_count + 1, last_viewed_at = NOW() WHERE id = $1`, [id]);
  await query(`INSERT INTO knowledge_document_views (document_id, user_id) VALUES ($1, $2)`, [id, userId]);
}

// ============================================================
// CATEGORIES (nested tree)
// ============================================================

export async function listCategories(tree = false) {
  const res = await query<KhCategoryRow>(
    `SELECT c.*, (SELECT COUNT(*)::int FROM knowledge_documents d WHERE d.category_id = c.id AND d.status = 'published') AS document_count
     FROM knowledge_categories c ORDER BY c.sort_order ASC, c.name ASC`
  );
  if (!tree) return res.rows;

  const map = new Map<string | null, KhCategoryRow[]>();
  for (const row of res.rows) {
    const parentKey = row.parent_id ?? '__root__';
    if (!map.has(parentKey)) map.set(parentKey, []);
    map.get(parentKey)!.push(row);
  }

  function buildTree(parentId: string | null): (KhCategoryRow & { children: unknown[] })[] {
    const children = map.get(parentId ?? '__root__') ?? [];
    return children.map(c => ({ ...c, children: buildTree(c.id) }));
  }
  return buildTree(null);
}

export async function getCategoryById(id: string) {
  const res = await query<KhCategoryRow>(`SELECT * FROM knowledge_categories WHERE id = $1`, [id]);
  return res.rows[0] ?? null;
}

export async function createCategory(data: { name: string; slug?: string; description?: string; icon?: string; color?: string; parentId?: string; sortOrder?: number }) {
  const slug = data.slug || slugify(data.name);
  const res = await query<KhCategoryRow>(
    `INSERT INTO knowledge_categories (name, slug, description, icon, color, parent_id, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [data.name, slug, data.description ?? null, data.icon ?? null, data.color ?? null, data.parentId ?? null, data.sortOrder ?? 0]
  );
  return res.rows[0];
}

export async function updateCategory(id: string, data: { name?: string; slug?: string; description?: string; icon?: string; color?: string; parentId?: string | null; sortOrder?: number }) {
  const sets: string[] = ['updated_at = NOW()'];
  const vals: unknown[] = [];
  let idx = 0;
  if (data.name !== undefined) { sets.push(`name = $${++idx}`); vals.push(data.name); }
  if (data.slug !== undefined) { sets.push(`slug = $${++idx}`); vals.push(data.slug); }
  if (data.description !== undefined) { sets.push(`description = $${++idx}`); vals.push(data.description); }
  if (data.icon !== undefined) { sets.push(`icon = $${++idx}`); vals.push(data.icon); }
  if (data.color !== undefined) { sets.push(`color = $${++idx}`); vals.push(data.color); }
  if (data.parentId !== undefined) { sets.push(`parent_id = $${++idx}`); vals.push(data.parentId); }
  if (data.sortOrder !== undefined) { sets.push(`sort_order = $${++idx}`); vals.push(data.sortOrder); }
  vals.push(id);
  await query(`UPDATE knowledge_categories SET ${sets.join(', ')} WHERE id = $${++idx}`, vals);
  return getCategoryById(id);
}

export async function deleteCategory(id: string) {
  await query(`UPDATE knowledge_documents SET category_id = NULL WHERE category_id = $1`, [id]);
  await query(`UPDATE knowledge_categories SET parent_id = NULL WHERE parent_id = $1`, [id]);
  await query(`DELETE FROM knowledge_categories WHERE id = $1`, [id]);
}

// ============================================================
// TAGS
// ============================================================

export async function listTags() {
  const res = await query<KhTagRow>(
    `SELECT t.*, (SELECT COUNT(*)::int FROM knowledge_document_tags dt WHERE dt.tag_id = t.id) AS document_count
     FROM knowledge_tags t ORDER BY t.name ASC`
  );
  return res.rows;
}

export async function createTag(data: { name: string; color?: string; createdBy?: string }) {
  const slug = slugify(data.name);
  const res = await query<KhTagRow>(
    `INSERT INTO knowledge_tags (name, slug, color, created_by) VALUES ($1,$2,$3,$4) RETURNING *`,
    [data.name, slug, data.color ?? null, data.createdBy ?? null]
  );
  return res.rows[0];
}

export async function deleteTag(id: string) {
  await query(`DELETE FROM knowledge_document_tags WHERE tag_id = $1`, [id]);
  await query(`DELETE FROM knowledge_tags WHERE id = $1`, [id]);
}

// ============================================================
// VERSIONS
// ============================================================

export async function createVersion(documentId: string, content: unknown, plainText: string | null, createdBy: string, changeNote?: string) {
  const numRes = await query<{ max: number }>(`SELECT COALESCE(MAX(version_number), 0) AS max FROM knowledge_document_versions WHERE document_id = $1`, [documentId]);
  const nextVersion = (numRes.rows[0]?.max ?? 0) + 1;
  const res = await query<KhVersionRow>(
    `INSERT INTO knowledge_document_versions (document_id, version_number, content, plain_text, change_note, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [documentId, nextVersion, JSON.stringify(content), plainText, changeNote ?? null, createdBy]
  );
  return res.rows[0];
}

export async function listVersions(documentId: string) {
  const res = await query<KhVersionRow>(
    `SELECT v.*, u.full_name AS author_name FROM knowledge_document_versions v
     LEFT JOIN reimbursement_users u ON u.id = v.created_by
     WHERE v.document_id = $1 ORDER BY v.version_number DESC`, [documentId]
  );
  return res.rows;
}

export async function getVersion(documentId: string, versionNumber: number) {
  const res = await query<KhVersionRow>(
    `SELECT * FROM knowledge_document_versions WHERE document_id = $1 AND version_number = $2`, [documentId, versionNumber]
  );
  return res.rows[0] ?? null;
}

// ============================================================
// COMMENTS
// ============================================================

export async function createComment(data: { documentId: string; authorId: string; content: string; selectionFrom?: number; selectionTo?: number; selectedText?: string; parentId?: string }) {
  const res = await query<KhCommentRow>(
    `INSERT INTO knowledge_comments (document_id, author_id, content, selection_from, selection_to, selected_text, parent_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [data.documentId, data.authorId, data.content, data.selectionFrom ?? null, data.selectionTo ?? null, data.selectedText ?? null, data.parentId ?? null]
  );
  return res.rows[0];
}

export async function listComments(documentId: string) {
  const res = await query<KhCommentRow & { author_name: string }>(
    `SELECT c.*, u.full_name AS author_name FROM knowledge_comments c
     LEFT JOIN reimbursement_users u ON u.id = c.author_id
     WHERE c.document_id = $1 ORDER BY c.created_at ASC`, [documentId]
  );
  const all = res.rows;
  const topLevel = all.filter(c => !c.parent_id);
  const replyMap = new Map<string, (typeof all)>();
  for (const c of all) {
    if (c.parent_id) {
      if (!replyMap.has(c.parent_id)) replyMap.set(c.parent_id, []);
      replyMap.get(c.parent_id)!.push(c);
    }
  }
  return topLevel.map(c => ({ ...c, replies: replyMap.get(c.id) ?? [] }));
}

export async function resolveComment(id: string) {
  await query(`UPDATE knowledge_comments SET is_resolved = true, updated_at = NOW() WHERE id = $1`, [id]);
}

export async function deleteComment(id: string) {
  await query(`DELETE FROM knowledge_comments WHERE id = $1`, [id]);
}

// ============================================================
// REVIEW ACTIONS
// ============================================================

export async function createReviewAction(data: { documentId: string; reviewerId: string; action: string; comment?: string }) {
  const res = await query(
    `INSERT INTO knowledge_review_actions (document_id, reviewer_id, action, comment)
     VALUES ($1,$2,$3::review_action_type,$4) RETURNING *`,
    [data.documentId, data.reviewerId, data.action, data.comment ?? null]
  );
  return res.rows[0];
}

export async function listReviewActions(documentId: string) {
  const res = await query(
    `SELECT ra.*, u.full_name AS reviewer_name FROM knowledge_review_actions ra
     LEFT JOIN reimbursement_users u ON u.id = ra.reviewer_id
     WHERE ra.document_id = $1 ORDER BY ra.created_at DESC`, [documentId]
  );
  return res.rows;
}

// ============================================================
// BOOKMARKS
// ============================================================

export async function toggleBookmark(userId: string, documentId: string): Promise<boolean> {
  const existing = await query(`SELECT id FROM knowledge_bookmarks WHERE user_id = $1 AND document_id = $2`, [userId, documentId]);
  if (existing.rows.length) {
    await query(`DELETE FROM knowledge_bookmarks WHERE user_id = $1 AND document_id = $2`, [userId, documentId]);
    return false;
  }
  await query(`INSERT INTO knowledge_bookmarks (user_id, document_id) VALUES ($1, $2)`, [userId, documentId]);
  return true;
}

export async function listBookmarks(userId: string) {
  const res = await query<KhDocRow>(
    `SELECT ${DOC_SELECT} ${DOC_FROM}
     JOIN knowledge_bookmarks b ON b.document_id = d.id
     WHERE b.user_id = $1 ORDER BY b.created_at DESC`, [userId]
  );
  const docIds = res.rows.map(r => r.id);
  const tagsMap = await getTagsForDocs(docIds);
  return res.rows.map(r => ({ ...r, tags: tagsMap[r.id] ?? [] }));
}

// ============================================================
// COLLECTIONS
// ============================================================

export async function listCollections(userId?: string) {
  const where = userId ? `WHERE c.owner_id = $1 OR c.is_shared = true` : '';
  const vals = userId ? [userId] : [];
  const res = await query<KhCollectionRow>(
    `SELECT c.*, (SELECT COUNT(*)::int FROM knowledge_collection_documents cd WHERE cd.collection_id = c.id) AS document_count
     FROM knowledge_collections c ${where} ORDER BY c.updated_at DESC`, vals
  );
  return res.rows;
}

export async function createCollection(data: { name: string; description?: string; ownerId: string; isShared?: boolean }) {
  const res = await query<KhCollectionRow>(
    `INSERT INTO knowledge_collections (name, description, owner_id, is_shared) VALUES ($1,$2,$3,$4) RETURNING *`,
    [data.name, data.description ?? null, data.ownerId, data.isShared ?? false]
  );
  return res.rows[0];
}

export async function addToCollection(collectionId: string, documentId: string) {
  const sortRes = await query<{ max: number }>(`SELECT COALESCE(MAX(sort_order), 0) AS max FROM knowledge_collection_documents WHERE collection_id = $1`, [collectionId]);
  await query(`INSERT INTO knowledge_collection_documents (collection_id, document_id, sort_order) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
    [collectionId, documentId, (sortRes.rows[0]?.max ?? 0) + 1]);
}

export async function removeFromCollection(collectionId: string, documentId: string) {
  await query(`DELETE FROM knowledge_collection_documents WHERE collection_id = $1 AND document_id = $2`, [collectionId, documentId]);
}

export async function deleteCollection(id: string) {
  await query(`DELETE FROM knowledge_collections WHERE id = $1`, [id]);
}

// ============================================================
// DOCUMENT LINKS (Backlinks)
// ============================================================

export async function getBacklinks(documentId: string) {
  const res = await query<{ id: string; title: string; slug: string }>(
    `SELECT d.id, d.title, d.slug FROM knowledge_document_links l
     JOIN knowledge_documents d ON d.id = l.source_id
     WHERE l.target_id = $1`, [documentId]
  );
  return res.rows;
}

export async function syncDocumentLinks(sourceId: string, targetIds: string[]) {
  await query(`DELETE FROM knowledge_document_links WHERE source_id = $1`, [sourceId]);
  for (const targetId of targetIds) {
    if (targetId !== sourceId) {
      await query(`INSERT INTO knowledge_document_links (source_id, target_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [sourceId, targetId]);
    }
  }
}

// ============================================================
// NOTIFICATIONS
// ============================================================

export async function createNotification(data: { userId: string; type: string; title: string; message: string; link?: string; relatedDocumentId?: string }) {
  const res = await query<KhNotificationRow>(
    `INSERT INTO knowledge_notifications (user_id, type, title, message, link, related_document_id)
     VALUES ($1,$2::kh_notification_type,$3,$4,$5,$6) RETURNING *`,
    [data.userId, data.type, data.title, data.message, data.link ?? null, data.relatedDocumentId ?? null]
  );
  return res.rows[0];
}

export async function listNotifications(userId: string, unreadOnly = false) {
  const where = unreadOnly ? `AND n.is_read = false` : '';
  const res = await query<KhNotificationRow>(
    `SELECT * FROM knowledge_notifications n WHERE n.user_id = $1 ${where} ORDER BY n.created_at DESC LIMIT 50`, [userId]
  );
  return res.rows;
}

export async function markNotificationRead(id: string) {
  await query(`UPDATE knowledge_notifications SET is_read = true WHERE id = $1`, [id]);
}

export async function markAllNotificationsRead(userId: string) {
  await query(`UPDATE knowledge_notifications SET is_read = true WHERE user_id = $1 AND is_read = false`, [userId]);
}

// ============================================================
// CONTENT FLAGS
// ============================================================

export async function createContentFlag(data: { documentId: string; flaggedBy: string; reason: string; description?: string }) {
  const res = await query(
    `INSERT INTO knowledge_content_flags (document_id, flagged_by, reason, description) VALUES ($1,$2,$3,$4) RETURNING *`,
    [data.documentId, data.flaggedBy, data.reason, data.description ?? null]
  );
  return res.rows[0];
}

export async function listContentFlags(resolved = false) {
  const res = await query(
    `SELECT f.*, d.title AS document_title, d.slug AS document_slug, u.full_name AS flagged_by_name
     FROM knowledge_content_flags f
     JOIN knowledge_documents d ON d.id = f.document_id
     LEFT JOIN reimbursement_users u ON u.id = f.flagged_by
     WHERE f.is_resolved = $1 ORDER BY f.created_at DESC`, [resolved]
  );
  return res.rows;
}

export async function resolveContentFlag(id: string, resolvedBy: string) {
  await query(`UPDATE knowledge_content_flags SET is_resolved = true, resolved_by = $2, resolved_at = NOW() WHERE id = $1`, [id, resolvedBy]);
}

// ============================================================
// SEARCH LOGS
// ============================================================

export async function logSearch(data: { userId: string; query: string; resultCount: number; searchType?: string; responseTimeMs?: number }) {
  await query(
    `INSERT INTO knowledge_search_logs (user_id, query, result_count, search_type, response_time_ms) VALUES ($1,$2,$3,$4,$5)`,
    [data.userId, data.query, data.resultCount, data.searchType ?? 'keyword', data.responseTimeMs ?? null]
  );
}

export async function logSearchClick(searchLogId: string, documentId: string) {
  await query(`UPDATE knowledge_search_logs SET clicked_document_id = $2 WHERE id = $1`, [searchLogId, documentId]);
}

// ============================================================
// AUDIT LOG
// ============================================================

export async function logAudit(data: { userId: string; action: string; entityType: string; entityId: string; details?: unknown; ipAddress?: string }) {
  await query(
    `INSERT INTO knowledge_audit_log (user_id, action, entity_type, entity_id, details, ip_address) VALUES ($1,$2,$3,$4,$5,$6)`,
    [data.userId, data.action, data.entityType, data.entityId, JSON.stringify(data.details ?? {}), data.ipAddress ?? null]
  );
}

// ============================================================
// ANALYTICS
// ============================================================

export async function getContentHealth() {
  const res = await query<{ status: string; count: string }>(`
    SELECT
      CASE
        WHEN updated_at > NOW() - INTERVAL '90 days' THEN 'fresh'
        WHEN updated_at > NOW() - INTERVAL '180 days' THEN 'aging'
        ELSE 'stale'
      END AS status,
      COUNT(*)::int AS count
    FROM knowledge_documents WHERE status = 'published'
    GROUP BY 1
  `);
  return res.rows;
}

export async function getTopSearches(days = 30, limit = 20) {
  const res = await query(
    `SELECT query, COUNT(*)::int AS count, AVG(result_count)::int AS avg_results
     FROM knowledge_search_logs WHERE created_at > NOW() - ($1 || ' days')::interval
     GROUP BY query ORDER BY count DESC LIMIT $2`, [days, limit]
  );
  return res.rows;
}

export async function getFailedSearches(days = 30, limit = 20) {
  const res = await query(
    `SELECT query, COUNT(*)::int AS count
     FROM knowledge_search_logs WHERE result_count = 0 AND created_at > NOW() - ($1 || ' days')::interval
     GROUP BY query ORDER BY count DESC LIMIT $2`, [days, limit]
  );
  return res.rows;
}

export async function getTopContributors(days = 30, limit = 10) {
  const res = await query(
    `SELECT d.author_id, u.full_name AS name, COUNT(*)::int AS doc_count
     FROM knowledge_documents d LEFT JOIN reimbursement_users u ON u.id = d.author_id
     WHERE d.created_at > NOW() - ($1 || ' days')::interval
     GROUP BY d.author_id, u.full_name ORDER BY doc_count DESC LIMIT $2`, [days, limit]
  );
  return res.rows;
}

export async function getViewTrends(days = 30) {
  const res = await query(
    `SELECT DATE(viewed_at) AS date, COUNT(*)::int AS views
     FROM knowledge_document_views WHERE viewed_at > NOW() - ($1 || ' days')::interval
     GROUP BY 1 ORDER BY 1 ASC`, [days]
  );
  return res.rows;
}

export async function getOverallStats() {
  const res = await query<{ total_docs: string; published_docs: string; total_views: string; total_searches: string; total_users: string }>(`
    SELECT
      (SELECT COUNT(*)::int FROM knowledge_documents) AS total_docs,
      (SELECT COUNT(*)::int FROM knowledge_documents WHERE status = 'published') AS published_docs,
      (SELECT COUNT(*)::int FROM knowledge_document_views) AS total_views,
      (SELECT COUNT(*)::int FROM knowledge_search_logs) AS total_searches,
      (SELECT COUNT(DISTINCT user_id)::int FROM knowledge_document_views) AS total_users
  `);
  return res.rows[0];
}

// ============================================================
// KNOWLEDGE USER ROLES
// ============================================================

export async function setUserRole(userId: string, role: string) {
  await query(
    `INSERT INTO knowledge_user_roles (user_id, role) VALUES ($1, $2::knowledge_role)
     ON CONFLICT (user_id) DO UPDATE SET role = $2::knowledge_role, updated_at = NOW()`,
    [userId, role]
  );
}

export async function listUserRoles() {
  const res = await query(
    `SELECT kr.*, u.full_name AS user_name, u.email FROM knowledge_user_roles kr
     LEFT JOIN reimbursement_users u ON u.auth_user_id = kr.user_id ORDER BY u.full_name ASC`
  );
  return res.rows;
}

// ============================================================
// TEAMS
// ============================================================

export async function listTeams() {
  const res = await query(
    `SELECT t.*, (SELECT COUNT(*)::int FROM knowledge_team_members tm WHERE tm.team_id = t.id) AS member_count
     FROM knowledge_teams t ORDER BY t.name ASC`
  );
  return res.rows;
}

export async function createTeam(data: { name: string; description?: string; color?: string }) {
  const res = await query(`INSERT INTO knowledge_teams (name, description, color) VALUES ($1,$2,$3) RETURNING *`,
    [data.name, data.description ?? null, data.color ?? null]);
  return res.rows[0];
}

export async function addTeamMember(teamId: string, userId: string) {
  await query(`INSERT INTO knowledge_team_members (team_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [teamId, userId]);
}

export async function removeTeamMember(teamId: string, userId: string) {
  await query(`DELETE FROM knowledge_team_members WHERE team_id = $1 AND user_id = $2`, [teamId, userId]);
}

export async function deleteTeam(id: string) {
  await query(`DELETE FROM knowledge_teams WHERE id = $1`, [id]);
}
