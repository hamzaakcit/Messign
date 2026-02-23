/**
 * Dora Phase 2 — Document Ingestion Pipeline Orchestrator
 *
 * Pipeline: hash check → summarize → chunk → embed → store
 *
 * Steps for each document:
 * 1. Check existing summary content hash — skip if unchanged
 * 2. Generate auto-summary via Groq/Gemini
 * 3. Chunk document using heading-aware splitter
 * 4. Prepend summary as "chunk 0" (semantic anchor)
 * 5. Generate embeddings for all chunks
 * 6. Store chunks + summary in database
 */

import { chunkDocument, stripHtml } from './chunker.js';
import { embedChunks } from './embeddings.js';
import { summarizeDocument, hashContent } from './summarize.js';
import {
  saveDocumentChunks,
  saveDocumentSummary,
  deleteDocumentChunks,
  getExistingSummary,
} from './db.js';
import type {
  KHDocument,
  IngestionResult,
  IngestionConfig,
  DocumentChunk,
  DEFAULT_INGESTION_CONFIG,
} from './types.js';

export async function ingestDocument(
  document: KHDocument,
  config: Partial<IngestionConfig> = {},
): Promise<IngestionResult> {
  const startTime = Date.now();
  const generateSummary = config.generateSummary ?? true;
  const skipUnchanged = config.skipUnchanged ?? true;

  try {
    const rawContent = document.plainText || document.content || '';
    const plainText = stripHtml(rawContent);
    const currentHash = hashContent(plainText);

    if (skipUnchanged) {
      const existing = await getExistingSummary(document.id);
      if (existing && existing.content_hash === currentHash) {
        console.log(`[Ingest] Skipping "${document.title}" — content unchanged`);
        return {
          documentId: document.id,
          documentTitle: document.title,
          success: true,
          chunksCreated: 0,
          embeddingsGenerated: 0,
          summary: existing.summary,
          processingTimeMs: Date.now() - startTime,
        };
      }
    }

    let summary = null;
    if (generateSummary) {
      try {
        const docSummary = await summarizeDocument(document);
        summary = docSummary.summary;
        await saveDocumentSummary(docSummary);
        console.log(`[Ingest] Summary saved for "${document.title}"`);
      } catch (err) {
        console.warn(`[Ingest] Summarization failed for "${document.title}":`, err instanceof Error ? err.message : err);
      }
    }

    const chunks = chunkDocument(document, config);

    if (chunks.length === 0) {
      console.warn(`[Ingest] No chunks produced for "${document.title}"`);
      return {
        documentId: document.id,
        documentTitle: document.title,
        success: true,
        chunksCreated: 0,
        embeddingsGenerated: 0,
        summary,
        processingTimeMs: Date.now() - startTime,
      };
    }

    if (summary) {
      const summaryChunk: DocumentChunk = {
        documentId: document.id,
        chunkIndex: -1,
        content: `[Document Summary] ${summary}`,
        headingPath: 'Summary',
        headingLevel: 0,
        tokenCount: Math.ceil(summary.length / 4),
        metadata: {
          documentId: document.id,
          documentTitle: document.title,
          documentSlug: document.slug,
          documentType: document.documentType,
          categoryName: document.categoryName,
          authorName: document.authorName,
          tags: document.tags,
          sectionTitle: 'Summary',
          chunkIndex: -1,
          totalChunks: chunks.length + 1,
          publishedAt: document.createdAt,
          updatedAt: document.updatedAt,
        },
      };

      chunks.unshift(summaryChunk);

      for (let i = 0; i < chunks.length; i++) {
        chunks[i]!.chunkIndex = i;
        chunks[i]!.metadata.chunkIndex = i;
        chunks[i]!.metadata.totalChunks = chunks.length;
      }
    }

    const embeddedChunks = await embedChunks(chunks);
    const saved = await saveDocumentChunks(embeddedChunks);

    const processingTimeMs = Date.now() - startTime;
    console.log(
      `[Ingest] "${document.title}" complete: ${saved} chunks, ${embeddedChunks.length} embeddings, ${processingTimeMs}ms`,
    );

    return {
      documentId: document.id,
      documentTitle: document.title,
      success: true,
      chunksCreated: saved,
      embeddingsGenerated: embeddedChunks.length,
      summary,
      processingTimeMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Ingest] Failed for "${document.title}":`, message);
    return {
      documentId: document.id,
      documentTitle: document.title,
      success: false,
      chunksCreated: 0,
      embeddingsGenerated: 0,
      summary: null,
      processingTimeMs: Date.now() - startTime,
      error: message,
    };
  }
}

export async function batchIngest(
  documents: KHDocument[],
  config: Partial<IngestionConfig> = {},
): Promise<IngestionResult[]> {
  const results: IngestionResult[] = [];

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i]!;
    console.log(`[Ingest Batch] Processing ${i + 1}/${documents.length}: "${doc.title}"`);
    const result = await ingestDocument(doc, config);
    results.push(result);

    if (i < documents.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  const totalChunks = results.reduce((s, r) => s + r.chunksCreated, 0);
  const totalTime = results.reduce((s, r) => s + r.processingTimeMs, 0);

  console.log(
    `[Ingest Batch] Complete: ${succeeded}/${documents.length} succeeded, ` +
    `${totalChunks} chunks total, ${totalTime}ms`,
  );

  return results;
}

export async function removeDocumentFromRAG(documentId: string): Promise<void> {
  await deleteDocumentChunks(documentId);
  console.log(`[Ingest] Removed RAG data for document ${documentId}`);
}
