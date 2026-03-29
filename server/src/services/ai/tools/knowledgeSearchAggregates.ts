/**
 * Aggregates for knowledge:search_knowledge_base (Dora knowledge widget).
 */

export interface KnowledgeSearchAggregates {
  count: number;
  /** document_type -> count */
  byType: Record<string, number>;
}

/**
 * Counts documents by `document_type` for charts and KPIs.
 */
export function computeKnowledgeSearchAggregates(
  docs: Array<{ document_type?: string | null }>,
): KnowledgeSearchAggregates {
  const byType: Record<string, number> = {};
  for (const d of docs) {
    const t = String(d.document_type ?? 'document');
    byType[t] = (byType[t] ?? 0) + 1;
  }
  return { count: docs.length, byType };
}

/**
 * Normalizes tool `data` from knowledge:search_knowledge_base — either legacy array or structured payload.
 */
export function documentsFromKnowledgeSearchData(data: unknown): unknown[] {
  if (data == null) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === 'object' && Array.isArray((data as Record<string, unknown>).documents)) {
    return (data as Record<string, unknown>).documents as unknown[];
  }
  return [];
}
