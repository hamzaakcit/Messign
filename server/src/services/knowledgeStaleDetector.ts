import { query } from '../db/index.js';
import { createNotification } from '../db/knowledgeV2Db.js';

export async function detectStaleContent(thresholdDays = 180) {
  const result = await query<{ id: string; title: string; slug: string; author_id: string }>(
    `SELECT id, title, slug, author_id FROM knowledge_documents
     WHERE status = 'published' AND updated_at < NOW() - ($1 || ' days')::interval
     AND id NOT IN (
       SELECT DISTINCT related_document_id FROM knowledge_notifications WHERE type = 'content_stale' AND created_at > NOW() - INTERVAL '30 days' AND related_document_id IS NOT NULL
     )`, [thresholdDays]
  );

  for (const doc of result.rows) {
    await createNotification({
      userId: doc.author_id,
      type: 'content_stale',
      title: 'Content may be outdated',
      message: `"${doc.title}" hasn't been updated in over ${thresholdDays} days. Consider reviewing it.`,
      link: `/knowledge-hub/documents/${doc.slug}`,
      relatedDocumentId: doc.id,
    });
  }

  return { flagged: result.rows.length };
}
