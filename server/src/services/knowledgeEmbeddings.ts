import { query } from '../db/index.js';
import { embedViaGateway } from './ai/gateway.js';

/** ~750 tokens at ~4 chars/token for English */
const CHUNK_CHARS = 3000;
/** ~100 tokens overlap (~13% of 750) */
const OVERLAP_CHARS = 400;

const SPLIT_SEPARATORS = ['\n\n', '\n', '. ', ' '] as const;

/**
 * Recursive character text splitter (LangChain-style).
 * Splits on separators in order: \n\n → \n → . → space → character.
 * Prevents definitions from being cut in half across chunks.
 */
export function recursiveChunkText(
  text: string,
  chunkChars: number = CHUNK_CHARS,
  overlapChars: number = OVERLAP_CHARS
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (trimmed.length <= chunkChars) return [trimmed];

  const chunks: string[] = [];
  let start = 0;

  while (start < trimmed.length) {
    let end = Math.min(start + chunkChars, trimmed.length);
    let chunk = trimmed.slice(start, end);

    if (end < trimmed.length) {
      let bestSplit = -1;
      for (const sep of SPLIT_SEPARATORS) {
        const lastSep = chunk.lastIndexOf(sep);
        if (lastSep > chunk.length * 0.3) {
          bestSplit = lastSep;
          break;
        }
      }
      if (bestSplit > 0) {
        chunk = chunk.slice(0, bestSplit).trim();
        end = start + bestSplit;
      } else {
        const lastSpace = chunk.lastIndexOf(' ');
        if (lastSpace > chunk.length * 0.3) {
          chunk = chunk.slice(0, lastSpace).trim();
          end = start + lastSpace;
        }
      }
    }

    if (chunk) chunks.push(chunk);
    if (end >= trimmed.length) break;
    start = Math.max(start + 1, end - overlapChars);
  }

  return chunks;
}

async function getEmbedding(text: string, tenantId: string = 'system'): Promise<number[] | null> {
  try {
    const embeddings = await embedViaGateway([text], tenantId);
    return embeddings[0] ?? null;
  } catch {
    return null;
  }
}

export async function embedDocument(
  documentId: string,
  plainText: string | null,
  options?: { tenantId?: string },
) {
  if (!plainText?.trim()) return;

  const hasVector = await query(`SELECT 1 FROM pg_extension WHERE extname = 'vector'`);
  if (!hasVector.rows.length) {
    console.log('[embeddings] pgvector not available, skipping');
    return;
  }

  await query(`DELETE FROM knowledge_embeddings WHERE document_id = $1`, [documentId]);

  const tenantId = options?.tenantId ?? 'system';
  const chunks = recursiveChunkText(plainText);
  for (let i = 0; i < chunks.length; i++) {
    const embedding = await getEmbedding(chunks[i], tenantId);
    if (embedding) {
      const vectorStr = `[${embedding.join(',')}]`;
      await query(
        `INSERT INTO knowledge_embeddings (document_id, chunk_index, chunk_text, embedding) VALUES ($1, $2, $3, $4::vector)`,
        [documentId, i, chunks[i], vectorStr]
      );
    } else {
      await query(
        `INSERT INTO knowledge_embeddings (document_id, chunk_index, chunk_text) VALUES ($1, $2, $3)`,
        [documentId, i, chunks[i]]
      );
    }
  }
}
