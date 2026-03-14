/**
 * Cross-Module RAG — Embedding Ingestion Pipeline
 *
 * Ingests CRM notes, support messages, chat, HR data into entity_embeddings.
 * Uses LiteLLM (OpenAI text-embedding-3-small) via gateway; permission-aware similarity search.
 */
import { withTenantQuery } from '../../../middleware/tenantContext.js';
import { embedViaGateway } from '../gateway.js';

export interface EmbeddingInput {
  tenantId: string;
  sourceModule: string;
  sourceType: string;
  sourceId: string;
  text: string;
  metadata: Record<string, unknown>;
  accessRoles: string[];
  sensitivity: 'normal' | 'confidential' | 'restricted';
}

/** Chunk text: max 2000 chars with 200 char overlap */
function chunkText(text: string, maxChars = 2000, overlapChars = 200): string[] {
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlapChars;
  }
  return chunks;
}

export async function embedAndStore(input: EmbeddingInput): Promise<void> {
  const text = input.text?.trim();
  if (!text) return;

  const chunks = chunkText(text);

  for (const chunk of chunks) {
    const [vector] = await embedViaGateway([chunk], input.tenantId);
    if (!vector) continue;

    await withTenantQuery(input.tenantId, async (client) => {
      await client.query(
        `INSERT INTO entity_embeddings 
         (tenant_id, source_module, source_type, source_id, content_text, metadata, embedding, access_roles, sensitivity)
         VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8, $9)`,
        [
          input.tenantId,
          input.sourceModule,
          input.sourceType,
          input.sourceId,
          chunk,
          JSON.stringify(input.metadata),
          JSON.stringify(vector),
          input.accessRoles,
          input.sensitivity,
        ],
      );
    });
  }
}

export interface SearchResult {
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
  source: string;
}

export async function searchEmbeddings(
  tenantId: string,
  query: string,
  userRoles: string[],
  options: {
    modules?: string[];
    limit?: number;
    minSimilarity?: number;
  } = {},
): Promise<SearchResult[]> {
  const [vector] = await embedViaGateway([query], tenantId);
  if (!vector) return [];

  const limit = Math.min(options.limit ?? 10, 100);
  const minSim = options.minSimilarity ?? 0.7;
  const modules = options.modules;

  return withTenantQuery(tenantId, async (client) => {
    const params: unknown[] = [
      JSON.stringify(vector),
      minSim,
      userRoles,
      limit,
    ];
    const moduleFilter = modules?.length
      ? `AND source_module = ANY($5)`
      : '';
    if (modules?.length) params.push(modules);

    const result = await client.query(
      `SELECT 
         content_text,
         1 - (embedding <=> $1::vector) AS similarity,
         metadata,
         source_module,
         source_type
       FROM entity_embeddings
       WHERE 1 - (embedding <=> $1::vector) > $2
         ${moduleFilter}
         AND (access_roles = '{}' OR access_roles && $3)
         AND sensitivity != 'restricted'
       ORDER BY embedding <=> $1::vector
       LIMIT $4`,
      params,
    );

    return result.rows.map((row) => ({
      content: row.content_text,
      similarity: parseFloat(String(row.similarity)),
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      source: `${row.source_module}:${row.source_type}`,
    }));
  });
}
