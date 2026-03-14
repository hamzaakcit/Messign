/**
 * LiteLLM Gateway Client
 * Replaces: aiCascade.ts, taskRouter.ts
 *
 * Calls the LiteLLM proxy (OpenAI-compatible API) for model routing,
 * fallbacks, semantic caching, and cost tracking.
 */
import OpenAI from 'openai';
import { redactPII, restorePII, type RedactionMap } from './safety/piiRedactor.js';

// LiteLLM exposes an OpenAI-compatible API
const gateway = new OpenAI({
  baseURL: process.env.LITELLM_URL || 'http://localhost:4000/v1',
  apiKey: process.env.LITELLM_MASTER_KEY || 'sk-litellm',
});

export type ModelTier = 'fast' | 'balanced' | 'complex' | 'frontier' | 'vision';

/** Real-time keywords that trigger cache bypass (fresh inference) */
const REALTIME_CACHE_BUST_PATTERN = /\b(right now|current|latest|today|just happened)\b/i;

/** Estimated cost per request by tier (USD) — used for cache savings calculation */
const TIER_ESTIMATED_COST_USD: Record<ModelTier, number> = {
  fast: 0.0005,
  balanced: 0.002,
  complex: 0.01,
  frontier: 0.05,
  vision: 0.01,
};

interface GatewayCallOptions {
  tier: ModelTier;
  messages: OpenAI.ChatCompletionMessageParam[];
  tools?: OpenAI.ChatCompletionTool[];
  stream?: boolean;
  tenantId: string;
  maxTokens?: number;
  temperature?: number;
  /** Pre-collected redactions (e.g. from tool results redacted before append) for restore */
  initialRedactions?: RedactionMap[];
  /** User query text — used for cache-busting (real-time keywords skip cache) */
  userQuery?: string;
}

function sanitizeMessageContent(
  content: OpenAI.ChatCompletionMessageParam['content'],
  redactions: RedactionMap[],
): OpenAI.ChatCompletionMessageParam['content'] {
  if (typeof content === 'string') {
    const result = redactPII(content);
    redactions.push(...result.redactions);
    return result.redactedText;
  }
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (part.type === 'text' && 'text' in part) {
        const result = redactPII(part.text);
        redactions.push(...result.redactions);
        return { ...part, text: result.redactedText };
      }
      return part;
    }) as OpenAI.ChatCompletionContentPart[];
  }
  return content;
}

export type GatewayResponseWithCache = OpenAI.Chat.Completions.ChatCompletion & {
  _cacheHit?: boolean;
  _estimatedCostSavingsUsd?: number;
};

export async function callModelSafe(options: GatewayCallOptions): Promise<GatewayResponseWithCache> {
  const redactions: RedactionMap[] = [...(options.initialRedactions ?? [])];
  const sanitizedMessages = options.messages.map((msg) => {
    if (msg.role === 'system' && typeof msg.content === 'string') {
      const result = redactPII(msg.content);
      redactions.push(...result.redactions);
      return { ...msg, content: result.redactedText };
    }
    if (msg.role === 'user' && msg.content) {
      return { ...msg, content: sanitizeMessageContent(msg.content, redactions) } as OpenAI.ChatCompletionMessageParam;
    }
    if (msg.role === 'tool' && typeof msg.content === 'string') {
      const result = redactPII(msg.content);
      redactions.push(...result.redactions);
      return { ...msg, content: result.redactedText };
    }
    return msg;
  }) as OpenAI.ChatCompletionMessageParam[];

  const response = await callModel({ ...options, messages: sanitizedMessages });

  const choice = response.choices?.[0];
  if (choice?.message?.content && redactions.length > 0) {
    (choice.message as { content: string }).content = restorePII(choice.message.content, redactions);
  }

  return response;
}

function buildCacheParams(options: GatewayCallOptions): Record<string, unknown> | undefined {
  const skipCache =
    (options.userQuery && REALTIME_CACHE_BUST_PATTERN.test(options.userQuery)) ||
    (options.initialRedactions && options.initialRedactions.length > 0);
  if (skipCache) return { 'no-cache': true, 'no-store': true };

  const tier = options.tier;
  if (tier === 'complex' || tier === 'frontier') return { 'no-store': true };
  if (tier === 'fast') return { ttl: 3600 };
  if (tier === 'balanced') return { ttl: 1800 };
  return undefined;
}

export async function callModel(options: GatewayCallOptions): Promise<GatewayResponseWithCache> {
  const cacheParams = buildCacheParams(options);
  const body = {
    model: options.tier,
    messages: options.messages,
    tools: options.tools,
    stream: options.stream ?? false,
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.3,
    metadata: {
      tenant_id: options.tenantId,
      trace_id: crypto.randomUUID(),
    },
    ...(cacheParams ? { cache: cacheParams } : {}),
  } as OpenAI.ChatCompletionCreateParamsNonStreaming & { metadata?: Record<string, string>; cache?: Record<string, unknown> };

  const { data: completion, response } = await gateway.chat.completions.create(body).withResponse();

  const cacheKeyHeader = response.headers?.get?.('x-litellm-cache-key');
  const cacheHit = !!cacheKeyHeader;
  const estimatedCostSavingsUsd = cacheHit ? TIER_ESTIMATED_COST_USD[options.tier] ?? 0 : 0;

  return {
    ...completion,
    _cacheHit: cacheHit,
    _estimatedCostSavingsUsd: estimatedCostSavingsUsd,
  };
}

export async function* streamModelSafe(options: GatewayCallOptions) {
  const redactions: RedactionMap[] = [...(options.initialRedactions ?? [])];
  const sanitizedMessages = options.messages.map((msg) => {
    if (msg.role === 'system' && typeof msg.content === 'string') {
      const result = redactPII(msg.content);
      redactions.push(...result.redactions);
      return { ...msg, content: result.redactedText };
    }
    if (msg.role === 'user' && msg.content) {
      return { ...msg, content: sanitizeMessageContent(msg.content, redactions) } as OpenAI.ChatCompletionMessageParam;
    }
    if (msg.role === 'tool' && typeof msg.content === 'string') {
      const result = redactPII(msg.content);
      redactions.push(...result.redactions);
      return { ...msg, content: result.redactedText };
    }
    return msg;
  }) as OpenAI.ChatCompletionMessageParam[];

  let bufferedContent = '';
  const stream = await gateway.chat.completions.create({
    model: options.tier,
    messages: sanitizedMessages,
    tools: options.tools,
    stream: true,
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.3,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata: { tenant_id: options.tenantId },
  } as OpenAI.ChatCompletionCreateParamsStreaming & { metadata?: Record<string, string> });

  for await (const chunk of stream) {
    const content = chunk.choices?.[0]?.delta?.content;
    if (content) bufferedContent += content;
  }

  if (redactions.length > 0 && bufferedContent) {
    bufferedContent = restorePII(bufferedContent, redactions);
  }

  if (bufferedContent) {
    yield { choices: [{ delta: { content: bufferedContent }, index: 0 }] } as OpenAI.ChatCompletionChunk;
  }
}

// Streaming variant for SSE responses
export async function* streamModel(options: GatewayCallOptions) {
  const stream = await gateway.chat.completions.create({
    model: options.tier,
    messages: options.messages,
    tools: options.tools,
    stream: true,
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.3,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata: { tenant_id: options.tenantId },
  } as OpenAI.ChatCompletionCreateParamsStreaming & { metadata?: Record<string, string> });

  for await (const chunk of stream) {
    yield chunk;
  }
}

/** Simple text generation (non-chat, no tools). Use for extraction, classification, etc. */
export async function generateText(options: {
  tier: ModelTier;
  prompt: string;
  systemPrompt?: string;
  tenantId: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const messages: OpenAI.ChatCompletionMessageParam[] = [];
  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }
  messages.push({ role: 'user', content: options.prompt });

  const response = await callModelSafe({
    tier: options.tier,
    messages,
    tenantId: options.tenantId,
    maxTokens: options.maxTokens,
    temperature: options.temperature,
  });

  return response.choices?.[0]?.message?.content?.trim() ?? '';
}

/** Vision extraction (invoice/receipt/OCR). Sends image or PDF + prompt through the vision tier. */
export async function generateVision(options: {
  imageBase64: string;
  mediaType: string;
  prompt: string;
  tenantId: string;
  maxTokens?: number;
}): Promise<string> {
  const dataUrl = `data:${options.mediaType};base64,${options.imageBase64}`;

  // LiteLLM supports both image_url (images) and file with file_data (PDF) via vision tier
  const contentParts: Array<{ type: 'image_url'; image_url: { url: string } } | { type: 'text'; text: string } | { type: 'file'; file: { file_data: string } }> = [];

  if (options.mediaType === 'application/pdf') {
    contentParts.push({ type: 'file', file: { file_data: dataUrl } });
  } else {
    contentParts.push({ type: 'image_url', image_url: { url: dataUrl } });
  }
  contentParts.push({ type: 'text', text: options.prompt });

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: 'user',
      content: contentParts as OpenAI.ChatCompletionContentPart[],
    },
  ];

  const response = await callModelSafe({
    tier: 'vision',
    messages,
    tenantId: options.tenantId,
    maxTokens: options.maxTokens ?? 4096,
    temperature: 0.1,
  });

  return response.choices?.[0]?.message?.content?.trim() ?? '';
}

/** Embeddings via LiteLLM (OpenAI-compatible). For semantic search, RAG, etc. */
export async function embedViaGateway(
  texts: string[],
  tenantId: string,
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const response = await gateway.embeddings.create({
    model: 'embeddings',
    input: texts,
    dimensions: 1536,
  });

  const sorted = (response.data ?? []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return sorted.map((d) => d.embedding);
}

// Complexity classifier: determines which tier to use
export function classifyComplexity(query: string, toolCount: number): ModelTier {
  const lowComplexityPatterns = [
    /^(what|who|when|where|how many|how much|show|list|get|find)\b/i,
    /^(search|look up|check)\b/i,
  ];

  const highComplexityPatterns = [
    /\b(analyze|compare|correlate|recommend|strategy|forecast|cross.?module)\b/i,
    /\b(why|what.?if|should we|impact|relationship between)\b/i,
  ];

  const isLow = lowComplexityPatterns.some(p => p.test(query));
  const isHigh = highComplexityPatterns.some(p => p.test(query));

  if (isHigh || toolCount > 3) return 'complex';
  if (isLow && toolCount <= 1) return 'fast';
  return 'balanced';
}
