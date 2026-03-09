/**
 * Knowledge Hub: uses knowledge_documents (v2) only.
 * All document operations go through knowledgeV2Db.
 */
import * as v2 from './knowledgeV2Db.js';

export async function listDocuments(params: v2.ListDocsParams) {
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
    return await v2.listCategories(tree);
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === '42P01') return [];
    throw e;
  }
}

export async function getCategoryById(id: string) {
  try {
    return await v2.getCategoryById(id);
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === '42P01') return null;
    throw e;
  }
}

export async function getDocumentById(id: string, userId?: string) {
  try {
    return await v2.getDocumentById(id, userId);
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === '42P01') return null;
    throw e;
  }
}

export async function getDocumentBySlug(slug: string, userId?: string) {
  try {
    return await v2.getDocumentBySlug(slug, userId);
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === '42P01') return null;
    throw e;
  }
}
