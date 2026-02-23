/**
 * One-off script to embed knowledge documents that have no chunks.
 * Run: npx tsx src/db/embedKnowledgeDocs.ts
 */
import 'dotenv/config';
import { query } from './index.js';
import { embedDocument } from '../services/knowledgeEmbeddings.js';

async function main() {
  const docs = await query<{ id: string; title: string; plain_text: string | null }>(
    `SELECT d.id, d.title, d.plain_text
     FROM knowledge_documents d
     WHERE d.status IN ('published', 'in_review')
       AND d.plain_text IS NOT NULL AND TRIM(d.plain_text) != ''
       AND NOT EXISTS (SELECT 1 FROM knowledge_embeddings e WHERE e.document_id = d.id)
     ORDER BY d.updated_at DESC`
  );

  console.log(`Found ${docs.rows.length} documents without embeddings.`);

  for (let i = 0; i < docs.rows.length; i++) {
    const doc = docs.rows[i]!;
    console.log(`[${i + 1}/${docs.rows.length}] Embedding: ${doc.title} (${doc.id})`);
    try {
      await embedDocument(doc.id, doc.plain_text);
      console.log(`  Done.`);
    } catch (e) {
      console.error(`  Failed:`, e);
    }
    if (i < docs.rows.length - 1) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  console.log('Embedding complete.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
