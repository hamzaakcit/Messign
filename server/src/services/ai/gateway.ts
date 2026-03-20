/**
 * AI Gateway — LiteLLM proxy when deployed, direct providers on Railway / no proxy.
 *
 * When LITELLM_URL points at localhost or is unset, skips the proxy and calls
 * Groq + Gemini (OpenAI-compatible APIs) so orchestrator/specialists work without LiteLLM.
 */
import OpenAI from 'openai';
import { redactPII, restorePII, type RedactionMap } from './safety/piiRedactor.js';

export type ModelTier = 'fast' | 'balanced' | 'complex' | 'frontier' | 'vision';

/** LiteLLM only when URL is set and not local — avoids ECONNREFUSED on Railway. */
function normalizeLiteLLMBaseUrl(url: string): string {
  const u = url.replace(/\/$/, '');
  return u.endsWith('/v1') ? u : `${u}/v1`;
}

const LITELLM_URL_RAW = process.env.LITELLM_URL?.trim();
const useLiteLLM =
  !!LITELLM_URL_RAW && !/localhost|127\.0\.0\.1/i.test(LITELLM_URL_RAW);

const litellmClient = useLiteLLM
  ? new OpenAI({
      baseURL: normalizeLiteLLMBaseUrl(LITELLM_URL_RAW!),
      apiKey: process.env.LITELLM_MASTER_KEY || 'sk-litellm',
    })
  : null;

if (!useLiteLLM && LITELLM_URL_RAW) {
  console.log('[Gateway] LITELLM_URL is local or unset — using direct Groq/Gemini (no LiteLLM proxy)');
}

const groqApiKey = process.env.GROQ_API_KEY ?? '';
const geminiApiKey = process.env.GOOGLE_GEMINI_API_KEY ?? '';

const groqClient = new OpenAI({
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: groqApiKey,
});

const geminiClient = new OpenAI({
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  apiKey: geminiApiKey,
});

type DirectProvider = 'groq' | 'gemini';

/** Direct routing: Groq for tool-heavy tiers (reliable OpenAI-style tools); Gemini for balanced/vision. */
const TIER_DIRECT: Record<ModelTier, { provider: DirectProvider; model: string }> = {
  fast: { provider: 'groq', model: 'llama-3.3-70b-versatile' },
  balanced: { provider: 'gemini', model: 'gemini-2.0-flash-lite' },
  complex: { provider: 'groq', model: 'llama-3.3-70b-versatile' },
  frontier: { provider: 'groq', model: 'llama-3.3-70b-versatile' },
  vision: { provider: 'gemini', model: 'gemini-2.0-flash' },
};

const FALLBACK_CHAIN: Record<ModelTier, ModelTier[]> = {
  fast: ['balanced', 'complex'],
  balanced: ['complex', 'fast'],
  complex: ['fast', 'balanced'],
  frontier: ['complex', 'fast'],
  vision: ['balanced', 'fast'],
};

function getDirectClient(provider: DirectProvider): OpenAI | null {
  if (provider === 'groq') return groqApiKey ? groqClient : null;
  if (provider === 'gemini') return geminiApiKey ? geminiClient : null;
  return null;
}

function directClientForTier(tier: ModelTier): OpenAI | null {
  return getDirectClient(TIER_DIRECT[tier].provider);
}

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
  /** When set, forces a specific tool call (e.g. routing-only step). */
  toolChoice?: OpenAI.ChatCompletionCreateParams['tool_choice'];
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

async function callDirectProviders(
  options: GatewayCallOptions,
): Promise<GatewayResponseWithCache> {
  const chain: ModelTier[] = [options.tier];
  for (const t of FALLBACK_CHAIN[options.tier] ?? []) {
    if (!chain.includes(t)) chain.push(t);
  }

  const maxTokens = options.maxTokens ?? 4096;
  const temperature = options.temperature ?? 0.3;
  const lastErrors: string[] = [];

  for (const tier of chain) {
    const client = directClientForTier(tier);
    if (!client) {
      lastErrors.push(`${tier}: no API key for ${TIER_DIRECT[tier].provider}`);
      continue;
    }
    const { model } = TIER_DIRECT[tier];
    try {
      const completion = await client.chat.completions.create({
        model,
        messages: options.messages,
        tools: options.tools?.length ? options.tools : undefined,
        tool_choice: options.tools?.length ? options.toolChoice : undefined,
        max_tokens: maxTokens,
        temperature,
        stream: false,
      });
      return {
        ...completion,
        _cacheHit: false,
        _estimatedCostSavingsUsd: 0,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastErrors.push(`${tier} (${model}): ${msg}`);
      console.warn(`[Gateway] Direct provider failed for tier ${tier}`, { model, error: msg });
    }
  }

  throw new Error(`All direct LLM providers failed: ${lastErrors.join(' | ')}`);
}

export async function callModel(options: GatewayCallOptions): Promise<GatewayResponseWithCache> {
  if (litellmClient) {
    const cacheParams = buildCacheParams(options);
    const body = {
      model: options.tier,
      messages: options.messages,
      tools: options.tools,
      tool_choice: options.tools?.length ? options.toolChoice : undefined,
      stream: options.stream ?? false,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.3,
      metadata: {
        tenant_id: options.tenantId,
        trace_id: crypto.randomUUID(),
      },
      ...(cacheParams ? { cache: cacheParams } : {}),
    } as OpenAI.ChatCompletionCreateParamsNonStreaming & { metadata?: Record<string, string>; cache?: Record<string, unknown> };

    try {
      const { data: completion, response } = await litellmClient.chat.completions.create(body).withResponse();

      const cacheKeyHeader = response.headers?.get?.('x-litellm-cache-key');
      const cacheHit = !!cacheKeyHeader;
      const estimatedCostSavingsUsd = cacheHit ? TIER_ESTIMATED_COST_USD[options.tier] ?? 0 : 0;

      return {
        ...completion,
        _cacheHit: cacheHit,
        _estimatedCostSavingsUsd: estimatedCostSavingsUsd,
      };
    } catch (err) {
      console.warn('[Gateway] LiteLLM failed, using direct providers', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return callDirectProviders(options);
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
  for await (const chunk of streamModel({ ...options, messages: sanitizedMessages })) {
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

async function* streamDirectProviders(
  options: GatewayCallOptions,
): AsyncGenerator<OpenAI.ChatCompletionChunk, void, unknown> {
  const chain: ModelTier[] = [options.tier];
  for (const t of FALLBACK_CHAIN[options.tier] ?? []) {
    if (!chain.includes(t)) chain.push(t);
  }

  const maxTokens = options.maxTokens ?? 4096;
  const temperature = options.temperature ?? 0.3;

  for (const tier of chain) {
    const client = directClientForTier(tier);
    if (!client) continue;
    const { model } = TIER_DIRECT[tier];
    try {
      const stream = await client.chat.completions.create({
        model,
        messages: options.messages,
        tools: options.tools?.length ? options.tools : undefined,
        max_tokens: maxTokens,
        temperature,
        stream: true,
      });
      for await (const chunk of stream) {
        yield chunk;
      }
      return;
    } catch (err) {
      console.warn(`[Gateway] Direct stream failed for tier ${tier}`, {
        model,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  throw new Error('[Gateway] All direct streaming providers failed');
}

// Streaming variant for SSE responses
export async function* streamModel(options: GatewayCallOptions) {
  if (litellmClient) {
    try {
      const stream = await litellmClient.chat.completions.create({
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
      return;
    } catch (err) {
      console.warn('[Gateway] LiteLLM stream failed, using direct providers', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  yield* streamDirectProviders(options);
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

/** Embeddings — LiteLLM when configured; otherwise OpenAI text-embedding-3-small directly. */
export async function embedViaGateway(
  texts: string[],
  tenantId: string,
): Promise<number[][]> {
  if (texts.length === 0) return [];

  if (litellmClient) {
    try {
      const response = await litellmClient.embeddings.create({
        model: 'embeddings',
        input: texts,
        dimensions: 1536,
      });
      const sorted = (response.data ?? []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      return sorted.map((d) => d.embedding);
    } catch (err) {
      console.warn('[Gateway] LiteLLM embeddings failed, trying OpenAI direct', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    throw new Error(
      'OPENAI_API_KEY is required for embeddings when LiteLLM is unavailable. Set OPENAI_API_KEY or a reachable LITELLM_URL.',
    );
  }

  const openai = new OpenAI({ apiKey: openaiKey });
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
    dimensions: 1536,
  });
  const sorted = (response.data ?? []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return sorted.map((d) => d.embedding);
}

// Complexity classifier: determines which tier to use
/** Unified Anthropic + Groq client with retries/timeouts — see `llmGateway.ts` */
export {
  generateResponse,
  LLMGatewayError,
  LLM_TIER,
  LLM_TIER_CONFIG,
  type PromptConfig,
  type LLMGatewayResult,
  type LLMRoutingTier,
} from './llmGateway.js';

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
