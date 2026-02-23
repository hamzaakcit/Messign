/**
 * Dora Phase 2 — RAG Pipeline Types
 *
 * Shared types for the Knowledge Hub RAG system:
 * chunking, embedding, search, ingestion, and auto-summarization.
 */

export interface KHDocument {
  id: string;
  title: string;
  slug: string;
  content: string;
  plainText?: string | null;
  documentType: string;
  categoryId: string | null;
  categoryName: string | null;
  authorId: string;
  authorName: string;
  status: 'draft' | 'published' | 'archived' | 'in_review';
  tags: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface DocumentChunk {
  documentId: string;
  chunkIndex: number;
  content: string;
  headingPath: string;
  headingLevel: number;
  tokenCount: number;
  metadata: ChunkMetadata;
}

export interface ChunkMetadata {
  documentId: string;
  documentTitle: string;
  documentSlug: string;
  documentType: string;
  categoryName: string | null;
  authorName: string;
  tags: string[];
  sectionTitle: string;
  chunkIndex: number;
  totalChunks: number;
  publishedAt: string;
  updatedAt: string;
}

export interface EmbeddedChunk extends DocumentChunk {
  embedding: number[];
}

export interface IngestionResult {
  documentId: string;
  documentTitle: string;
  success: boolean;
  chunksCreated: number;
  embeddingsGenerated: number;
  summary: string | null;
  processingTimeMs: number;
  error?: string;
}

export interface IngestionConfig {
  targetChunkSize: number;
  maxChunkSize: number;
  minChunkSize: number;
  overlapSentences: number;
  embeddingBatchSize: number;
  generateSummary: boolean;
  skipUnchanged: boolean;
}

export const DEFAULT_INGESTION_CONFIG: IngestionConfig = {
  targetChunkSize: 500,
  maxChunkSize: 700,
  minChunkSize: 80,
  overlapSentences: 2,
  embeddingBatchSize: 5,
  generateSummary: true,
  skipUnchanged: true,
};

export interface SearchResult {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  documentSlug: string;
  content: string;
  headingPath: string;
  score: number;
  vectorScore: number;
  keywordScore: number;
  metadata: ChunkMetadata;
}

export interface HybridSearchParams {
  query: string;
  topK: number;
  categoryFilter?: string;
  documentTypeFilter?: string;
  minScore?: number;
  vectorWeight?: number;
  keywordWeight?: number;
}

export interface DocumentSummary {
  documentId: string;
  summary: string;
  keyTopics: string[];
  audience: string;
  complexity: 'basic' | 'intermediate' | 'advanced';
  lastSummarizedAt: string;
  contentHash: string;
}

export interface ChunkRow {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  heading: string | null;
  token_count: number;
  metadata: ChunkMetadata;
  created_at?: string;
}

export interface SummaryRow {
  document_id: string;
  summary: string;
  key_topics: string[];
  audience: string;
  complexity: string;
  content_hash: string;
  last_summarized_at: string;
}

export interface VectorSearchRow extends ChunkRow {
  cosine_distance: number;
}

export interface FTSSearchRow extends ChunkRow {
  rank: number;
}
