/**
 * LiteLLM Gateway Client
 * Replaces: aiCascade.ts, taskRouter.ts
 *
 * Calls the LiteLLM proxy (OpenAI-compatible API) for model routing,
 * fallbacks, and cost tracking.
 */
import OpenAI from 'openai';
import { redactPII, restorePII, type RedactionMap } from './safety/piiRedactor.js';

// LiteLLM exposes an OpenAI-compatible API
const gateway = new OpenAI({
  baseURL: process.env.LITELLM_URL || 'http://localhost:4000/v1',
  apiKey: process.env.LITELLM_MASTER_KEY || 'sk-litellm',
});

export type ModelTier = 'fast' | 'balanced' | 'complex' | 'frontier' | 'vision';

interface GatewayCallOptions {
  tier: ModelTier;
  messages: OpenAI.ChatCompletionMessageParam[];
  tools?: OpenAI.ChatCompletionTool[];
  stream?: boolean;
  tenantId: string;
  maxTokens?: number;
  temperature?: number;
}

export async function callModelSafe(options: GatewayCallOptions) {
  const redactions: RedactionMap[] = [];
  const sanitizedMessages = options.messages.map((msg) => {
    if (msg.role === 'user' && typeof msg.content === 'string') {
      const result = redactPII(msg.content);
      redactions.push(...result.redactions);
      return { ...msg, content: result.redactedText };
    }
    if (msg.role === 'tool' && typeof msg.content === 'string') {
      const result = redactPII(msg.content);
      redactions.push(...result.redactions);
      return { ...msg, content: result.redactedText };
    }
    return msg;
  });

  const response = await callModel({ ...options, messages: sanitizedMessages });

  const choice = response.choices?.[0];
  if (choice?.message?.content && redactions.length > 0) {
    (choice.message as { content: string }).content = restorePII(choice.message.content, redactions);
  }

  return response;
}

export async function callModel(options: GatewayCallOptions) {
  const response = await gateway.chat.completions.create({
    model: options.tier,
    messages: options.messages,
    tools: options.tools,
    stream: options.stream ?? false,
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.3,
    // LiteLLM metadata for cost attribution
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata: {
      tenant_id: options.tenantId,
      trace_id: crypto.randomUUID(),
    },
  } as OpenAI.ChatCompletionCreateParamsNonStreaming & { metadata?: Record<string, string> });
  return response;
}

export async function* streamModelSafe(options: GatewayCallOptions) {
  const redactions: RedactionMap[] = [];
  const sanitizedMessages = options.messages.map((msg) => {
    if (msg.role === 'user' && typeof msg.content === 'string') {
      const result = redactPII(msg.content);
      redactions.push(...result.redactions);
      return { ...msg, content: result.redactedText };
    }
    if (msg.role === 'tool' && typeof msg.content === 'string') {
      const result = redactPII(msg.content);
      redactions.push(...result.redactions);
      return { ...msg, content: result.redactedText };
    }
    return msg;
  });

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
