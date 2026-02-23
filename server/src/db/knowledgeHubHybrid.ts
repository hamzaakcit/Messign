/**
 * Knowledge Hub hybrid layer: uses kb_documents first (where admin uploads go),
 * falls back to knowledge_documents (v2) when kb is empty or fails.
 * This ensures documents uploaded via Admin Knowledge appear in the Knowledge Hub.
 */
import * as v2 from './knowledgeV2Db.js';
import * as kb from './knowledgeDb.js';

const KB_TYPE_TO_DOC_TYPE: Record<string, string> = {
  pdf: 'guide', pptx: 'guide', docx: 'guide', wiki: 'guide', file: 'guide',
  image: 'guide', video: 'guide',
};
const DOC_TYPE_VALUES = new Set(['guide', 'faq', 'tutorial', 'reference', 'meeting_note', 'changelog']);

const FILE_EXT: Record<string, string> = {
  pdf: '.pdf', docx: '.docx', pptx: '.pptx', image: '.png', video: '.mp4',
  png: '.png', jpg: '.jpg', jpeg: '.jpeg', gif: '.gif', webp: '.webp', svg: '.svg', bmp: '.bmp',
  mp4: '.mp4', webm: '.webm', mov: '.mov', avi: '.avi', ogg: '.ogg',
  mp3: '.mp3', wav: '.wav', m4a: '.m4a', aac: '.aac', flac: '.flac',
};

function inferFileTypeFromUrl(url: string): string {
  const m = url.match(/\.([a-z0-9]+)(?:\?|$)/i);
  return m ? m[1].toLowerCase() : 'file';
}

function mapKbDocToKh(kbDoc: {
  id: string; title: string; slug: string; content: string; description?: string;
  author_id: string; author_name?: string; type: string;
  category_id: string | null; category_name?: string | null; category_slug?: string | null; category_color?: string | null;
  status: string; is_pinned: boolean; views: number;
  published_at: string | null; created_at: string; updated_at: string;
  tags: { id: string; name: string; slug: string }[];
  thumbnail_url?: string | null;
  file_url?: string | null;
  file_type?: string | null;
  file_size_bytes?: number | null;
}): Record<string, unknown> {
  const tags = (kbDoc.tags ?? []).map(t => ({ ...t, color: null }));
  const attachments: { url: string; fileName: string; fileType?: string }[] = [];
  if (kbDoc.file_url) {
    const ft = (kbDoc.file_type || inferFileTypeFromUrl(kbDoc.file_url)).toLowerCase();
    const urlExt = (() => { const m = kbDoc.file_url!.match(/\.([a-z0-9]+)(?:\?|$)/i); return m ? m[0] : ''; })();
    const ext = FILE_EXT[ft] || urlExt;
    attachments.push({ url: kbDoc.file_url, fileName: `${kbDoc.title}${ext}`, fileType: ft });
  }
  return {
    id: kbDoc.id,
    title: kbDoc.title,
    slug: kbDoc.slug,
    content: kbDoc.content ? { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: kbDoc.content }] }] } : {},
    plain_text: kbDoc.content || null,
    excerpt: kbDoc.description || null,
    cover_image: kbDoc.thumbnail_url || null,
    status: kbDoc.status || 'published',
    document_type: KB_TYPE_TO_DOC_TYPE[kbDoc.type] || 'guide',
    metadata: attachments.length ? { attachments } : {},
    author_id: kbDoc.author_id,
    author_name: kbDoc.author_name ?? kbDoc.author_id,
    category_id: kbDoc.category_id,
    category_name: kbDoc.category_name ?? null,
    category_slug: kbDoc.category_slug ?? null,
    category_color: kbDoc.category_color ?? null,
    is_public: true,
    is_pinned: kbDoc.is_pinned ?? false,
    is_featured: false,
    is_bookmarked: false,
    view_count: kbDoc.views ?? 0,
    last_viewed_at: null,
    published_at: kbDoc.published_at ?? null,
    archived_at: null,
    created_at: kbDoc.created_at,
    updated_at: kbDoc.updated_at,
    tags,
  };
}

export async function listDocuments(params: v2.ListDocsParams) {
  const kbParams = {
    search: params.search,
    categorySlug: params.category as string,
    tagSlug: params.tag as string,
    fileType: DOC_TYPE_VALUES.has(params.type || '') ? undefined : (params.type as string),
    status: params.status === 'all' ? 'all' : (params.status || 'published'),
    sort: params.sort === 'oldest' ? 'alphabetical' : (params.sort || 'recent'),
    page: params.page ?? 1,
    limit: params.limit ?? 20,
    userId: params.userId,
  };

  // Try kb_documents first (where admin uploads go); fall back to v2 if kb is empty
  try {
    const kbResult = await kb.listDocuments(kbParams);
    const docs = kbResult.docs.map(d => mapKbDocToKh(d as Parameters<typeof mapKbDocToKh>[0]));
    if (kbResult.docs.length > 0) return { docs, total: kbResult.total, page: kbResult.page, limit: kbResult.limit };
  } catch {
    /* kb failed, try v2 */
  }

  try {
    return await v2.listDocuments(params);
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === '42P01') return { docs: [], total: 0, page: params.page ?? 1, limit: params.limit ?? 20 };
    throw e;
  }
}

export async function listCategories(tree = false) {
  try {
    const result = await v2.listCategories(tree);
    if (Array.isArray(result) && result.length > 0) return result;
    if (tree && typeof result === 'object' && Array.isArray((result as { children?: unknown[] }).children)) return result;
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code !== '42P01') throw e;
  }

  try {
    const rows = await kb.listCategories();
    if (!tree) return rows;
    return rows.map((r: { id: string; name: string; slug: string; document_count?: number }) => ({ ...r, children: [] }));
  } catch {
    return [];
  }
}

export async function getCategoryById(id: string) {
  try {
    const cat = await v2.getCategoryById(id);
    if (cat) return cat;
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code !== '42P01') throw e;
  }
  try {
    return await kb.getCategoryById(id);
  } catch {
    return null;
  }
}

export async function getDocumentById(id: string, userId?: string) {
  try {
    const doc = await v2.getDocumentById(id, userId);
    if (doc) return doc;
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code !== '42P01') throw e;
  }
  try {
    const kbDoc = await kb.getDocumentById(id);
    if (!kbDoc) return null;
    return mapKbDocToKh(kbDoc as Parameters<typeof mapKbDocToKh>[0]) as Awaited<ReturnType<typeof v2.getDocumentById>>;
  } catch {
    return null;
  }
}

export async function getDocumentBySlug(slug: string, userId?: string) {
  // Try kb first (where admin uploads go), then v2
  try {
    const kbDoc = await kb.getDocumentBySlug(slug, userId);
    if (kbDoc) return mapKbDocToKh(kbDoc as Parameters<typeof mapKbDocToKh>[0]) as Awaited<ReturnType<typeof v2.getDocumentBySlug>>;
  } catch {
    /* kb failed, try v2 */
  }
  try {
    return await v2.getDocumentBySlug(slug, userId);
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === '42P01') return null;
    throw e;
  }
}
