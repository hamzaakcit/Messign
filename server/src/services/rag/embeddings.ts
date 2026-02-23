/**
 * Dora Phase 2 — Embedding Provider
 *
 * Primary: OpenAI text-embedding-3-small (1536 dimensions)
 * Fallback: Local bge-small-en-v1.5 via simple hash-based deterministic vectors (384 dims)
 *
 * The local fallback produces stable vectors for testing/offline use but lacks
 * real semantic understanding. In production, always configure OPENAI_API_KEY.
 */

import type { DocumentChunk, EmbeddedChunk } from './types.js';

const OPENAI_MODEL = 'text-embedding-3-small';
const OPENAI_DIMENSIONS = 1536;
const LOCAL_DIMENSIONS = 384;
const BATCH_SIZE = 20;

interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
  usage?: { prompt_tokens: number; total_tokens: number };
}

function getOpenAIApiKey(): string | null {
  return process.env.OPENAI_API_KEY || null;
}

async function openAIEmbed(texts: string[]): Promise<number[][]> {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: texts,
      dimensions: OPENAI_DIMENSIONS,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`OpenAI Embeddings API error ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const data = (await res.json()) as OpenAIEmbeddingResponse;
  return data.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

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

export function getEmbeddingDimensions(): number {
  return getOpenAIApiKey() ? OPENAI_DIMENSIONS : LOCAL_DIMENSIONS;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    console.warn('[Embeddings] OPENAI_API_KEY not set, using local fallback (not semantically meaningful)');
    return localEmbed(texts);
  }

  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const truncated = batch.map((t) => t.slice(0, 8000));
    const embeddings = await openAIEmbed(truncated);
    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
}

export async function embedChunks(chunks: DocumentChunk[]): Promise<EmbeddedChunk[]> {
  if (chunks.length === 0) return [];

  const texts = chunks.map((c) => c.content);
  const embeddings = await embedTexts(texts);

  return chunks.map((chunk, i) => ({
    ...chunk,
    embedding: embeddings[i]!,
  }));
}

export async function embedQuery(queryText: string): Promise<number[]> {
  const [embedding] = await embedTexts([queryText]);
  return embedding!;
}
