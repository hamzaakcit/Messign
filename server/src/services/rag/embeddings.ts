/**
 * Dora Phase 2 — Embedding Provider
 *
 * Uses embedViaGateway (LiteLLM → text-embedding-3-small, 1536 dimensions).
 * Fallback: Local hash-based deterministic vectors (384 dims) when gateway unavailable.
 *
 * The local fallback produces stable vectors for testing/offline use but lacks
 * real semantic understanding. In production, configure LITELLM for embeddings.
 */

import type { DocumentChunk, EmbeddedChunk } from './types.js';
import { embedViaGateway } from '../ai/gateway.js';

const GATEWAY_DIMENSIONS = 1536;
const LOCAL_DIMENSIONS = 384;
const BATCH_SIZE = 20;

/**
 * Deterministic hash-based fallback for offline/testing.
 * NOT semantically meaningful — only ensures consistent vectors for the same input.
 */
function localEmbed(texts: string[]): number[][] {
  return texts.map((text) => {
    const vec = new Array(LOCAL_DIMENSIONS).fill(0);
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    for (let i = 0; i < LOCAL_DIMENSIONS; i++) {
      hash = ((hash << 5) - hash + i) | 0;
      vec[i] = ((hash & 0xffff) / 32768) - 1;
    }
    const mag = Math.sqrt(vec.reduce((s: number, v: number) => s + v * v, 0));
    return mag > 0 ? vec.map((v: number) => v / mag) : vec;
  });
}

function isGatewayAvailable(): boolean {
  return !!(process.env.LITELLM_URL || process.env.LITELLM_MASTER_KEY);
}

export function getEmbeddingDimensions(): number {
  return isGatewayAvailable() ? GATEWAY_DIMENSIONS : LOCAL_DIMENSIONS;
}

export async function embedTexts(texts: string[], tenantId: string = 'system'): Promise<number[][]> {
  if (texts.length === 0) return [];

  if (isGatewayAvailable()) {
    const allEmbeddings: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const truncated = batch.map((t) => t.slice(0, 8000));
      const embeddings = await embedViaGateway(truncated, tenantId);
      allEmbeddings.push(...embeddings);
    }
    return allEmbeddings;
  }

  console.warn('[Embeddings] LiteLLM not configured, using local fallback (not semantically meaningful)');
  return localEmbed(texts);
}

export async function embedChunks(chunks: DocumentChunk[], tenantId: string = 'system'): Promise<EmbeddedChunk[]> {
  if (chunks.length === 0) return [];

  const texts = chunks.map((c) => c.content);
  const embeddings = await embedTexts(texts, tenantId);

  return chunks.map((chunk, i) => ({
    ...chunk,
    embedding: embeddings[i]!,
  }));
}

export async function embedQuery(queryText: string, tenantId: string = 'system'): Promise<number[]> {
  const [embedding] = await embedTexts([queryText], tenantId);
  return embedding!;
}
