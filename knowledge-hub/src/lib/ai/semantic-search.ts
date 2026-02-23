import { prisma } from "@/lib/prisma";
import { generateEmbedding } from "./embeddings";

interface SearchResult {
  documentId: string;
  chunkText: string;
  similarity: number;
}

export async function semanticSearch(
  query: string,
  limit: number = 5
): Promise<SearchResult[]> {
  const embedding = await generateEmbedding(query);
  if (embedding.length === 0) return [];

  const vectorStr = `[${embedding.join(",")}]`;

  const results = await prisma.$queryRawUnsafe<SearchResult[]>(
    `SELECT id, document_id AS "documentId", chunk_text AS "chunkText",
            1 - (embedding <=> $1::vector) AS similarity
     FROM document_embeddings
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    vectorStr,
    limit
  );

  return results;
}
