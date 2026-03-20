/**
 * Transactional-style RAG outbox: enqueue on document changes; worker processes embeddings.
 */
import { query } from '../../../db/index.js';
import { ingestDocument, removeDocumentFromRAG } from '../../rag/ingest.js';
import type { KHDocument } from '../../rag/types.js';

export async function setupRagOutboxSchema(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS rag_outbox_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID,
      aggregate_type TEXT NOT NULL,
      aggregate_id UUID NOT NULL,
      op TEXT NOT NULL CHECK (op IN ('upsert', 'delete')),
      payload JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMPTZ,
      attempts INT NOT NULL DEFAULT 0,
      last_error TEXT
    )
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_rag_outbox_pending ON rag_outbox_events (created_at) WHERE processed_at IS NULL`,
  );
}

export async function enqueueRagOutboxEvent(
  organizationId: string | null,
  aggregateType: string,
  aggregateId: string,
  op: 'upsert' | 'delete',
  payload: Record<string, unknown> = {},
): Promise<void> {
  await query(
    `INSERT INTO rag_outbox_events (organization_id, aggregate_type, aggregate_id, op, payload)
     VALUES ($1::uuid, $2, $3::uuid, $4, $5::jsonb)`,
    [organizationId, aggregateType, aggregateId, op, JSON.stringify(payload)],
  );
}

async function loadDocumentForIngest(documentId: string): Promise<KHDocument | null> {
  const res = await query<Record<string, unknown>>(
    `SELECT d.id, d.title, d.slug, d.content, d.plain_text, d.document_type, d.author_id, d.category_id,
            d.status, d.created_at, d.updated_at,
            c.name AS category_name,
            COALESCE(
              (SELECT string_agg(t.name, ', ') FROM knowledge_document_tags kdt
               JOIN knowledge_tags t ON t.id = kdt.tag_id WHERE kdt.document_id = d.id),
              ''
            ) AS tag_names
     FROM knowledge_documents d
     LEFT JOIN knowledge_categories c ON c.id = d.category_id
     WHERE d.id = $1::uuid
     LIMIT 1`,
    [documentId],
  );
  const row = res.rows[0];
  if (!row) return null;
  const tags = String(row.tag_names || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    slug: String(row.slug ?? row.id ?? ''),
    content: String(row.content ?? ''),
    plainText: row.plain_text != null ? String(row.plain_text) : null,
    documentType: String(row.document_type ?? 'document'),
    categoryId: row.category_id != null ? String(row.category_id) : null,
    categoryName: row.category_name != null ? String(row.category_name) : null,
    authorId: String(row.author_id ?? ''),
    authorName: String(row.author_id ?? ''),
    status: (row.status as KHDocument['status']) ?? 'published',
    tags,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    version: 1,
  };
}

export async function processRagOutboxBatch(limit = 8): Promise<number> {
  const sel = await query<{ id: string; aggregate_type: string; aggregate_id: string; op: string }>(
    `SELECT id::text, aggregate_type, aggregate_id::text, op
     FROM rag_outbox_events
     WHERE processed_at IS NULL
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit],
  );
  let done = 0;
  for (const row of sel.rows) {
    try {
      if (row.aggregate_type === 'knowledge_document') {
        if (row.op === 'delete') {
          await removeDocumentFromRAG(row.aggregate_id);
        } else {
          const doc = await loadDocumentForIngest(row.aggregate_id);
          if (doc && (doc.status === 'published' || doc.status === 'in_review')) {
            await ingestDocument(doc, { generateSummary: false, skipUnchanged: true });
          }
        }
      }
      await query(
        `UPDATE rag_outbox_events SET processed_at = NOW(), attempts = attempts + 1, last_error = NULL WHERE id = $1::uuid`,
        [row.id],
      );
      done++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await query(
        `UPDATE rag_outbox_events SET attempts = attempts + 1, last_error = $2 WHERE id = $1::uuid`,
        [row.id, msg.slice(0, 2000)],
      );
    }
  }
  return done;
}
