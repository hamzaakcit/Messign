/**
 * Unified LLM gateway — Anthropic (complex / planning) + Groq OpenAI-compatible (fast / JSON).
 * Retries, timeouts, normalized tool calls, and {@link LLMGatewayError} for callers.
 *
 * Env: `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, optional `LLM_COMPLEX_MODEL`, `LLM_FAST_MODEL`.
 */
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { ChatCompletionCreateParamsNonStreaming, ChatCompletionTool } from 'openai/resources/chat/completions';

/** Public routing tiers for marketing agents & orchestration */
export const LLM_TIER = {
  /** Orchestrator, Content Strategist, Campaign Manager — Claude Sonnet */
  COMPLEX: 'complex',
  /** Product Truth, Brand Voice, Compliance — Groq Llama (structured JSON) */
  FAST: 'fast',
} as const;

export type LLMRoutingTier = (typeof LLM_TIER)[keyof typeof LLM_TIER];

export const LLM_TIER_CONFIG = {
  [LLM_TIER.COMPLEX]: {
    provider: 'anthropic' as const,
    /** Claude 3.5 Sonnet — override with `LLM_COMPLEX_MODEL` */
    model: process.env.LLM_COMPLEX_MODEL?.trim() || 'claude-3-5-sonnet-20241022',
    timeoutMs: Number(process.env.LLM_COMPLEX_TIMEOUT_MS) || 45_000,
    maxRetries: 3,
  },
  [LLM_TIER.FAST]: {
    provider: 'groq' as const,
    /** Groq Llama 3.x — override with `LLM_FAST_MODEL` (e.g. llama-3.3-70b-versatile) */
    model: process.env.LLM_FAST_MODEL?.trim() || 'llama-3.3-70b-versatile',
    timeoutMs: Number(process.env.LLM_FAST_TIMEOUT_MS) || 15_000,
    maxRetries: 3,
  },
} as const;

export type LLMGatewayErrorCode =
  | 'timeout'
  | 'rate_limit'
  | 'server_error'
  | 'bad_request'
  | 'client_error'
  | 'unknown';

export class LLMGatewayError extends Error {
  readonly code: LLMGatewayErrorCode;

  readonly statusCode?: number;

  readonly cause?: unknown;

  constructor(message: string, code: LLMGatewayErrorCode, options?: { statusCode?: number; cause?: unknown }) {
    super(message);
    this.name = 'LLMGatewayError';
    this.code = code;
    this.statusCode = options?.statusCode;
    this.cause = options?.cause;
  }
}

export interface PromptConfig {
  tier: LLMRoutingTier;
  systemPrompt: string;
  userMessage: string;
  temperature?: number;
  maxTokens?: number;
  /** OpenAI-style tools (JSON Schema). Used for complex (Claude) and fast (Groq) when supported. */
  tools?: ChatCompletionTool[];
  toolChoice?: OpenAI.ChatCompletionCreateParams['tool_choice'];
  /** When true: Groq uses `response_format: json_object`; Claude gets strict JSON instructions in-system. */
  jsonMode?: boolean;
  /** Correlation / logging */
  tenantId?: string;
}

export interface NormalizedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMGatewayUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface LLMGatewayResult {
  content: string;
  toolCalls: NormalizedToolCall[];
  usage: LLMGatewayUsage;
  /** Which backend served the request */
  provider: 'anthropic' | 'groq';
  model: string;
}

const groqBaseUrl = process.env.GROQ_OPENAI_BASE_URL?.trim() || 'https://api.groq.com/openai/v1';

const groqClient = new OpenAI({
  baseURL: groqBaseUrl.endsWith('/v1') ? groqBaseUrl : `${groqBaseUrl.replace(/\/$/, '')}/v1`,
  apiKey: process.env.GROQ_API_KEY ?? '',
});

function getAnthropicClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    throw new LLMGatewayError('ANTHROPIC_API_KEY is not set', 'bad_request');
  }
  return new Anthropic({ apiKey: key });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof Error && (err.name === 'AbortError' || err.message === 'AbortError')) ||
    (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError')
  );
}

function httpStatus(err: unknown): number | undefined {
  if (err && typeof err === 'object' && 'status' in err && typeof (err as { status: unknown }).status === 'number') {
    return (err as { status: number }).status;
  }
  return undefined;
}

function classifyError(err: unknown): { code: LLMGatewayErrorCode; status?: number; retryable: boolean } {
  if (err instanceof LLMGatewayError) {
    return {
      code: err.code,
      status: err.statusCode,
      retryable: err.code === 'rate_limit' || err.code === 'server_error',
    };
  }
  if (isAbortError(err)) {
    return { code: 'timeout', status: undefined, retryable: false };
  }
  const status = httpStatus(err);
  if (status === 429) return { code: 'rate_limit', status, retryable: true };
  if (status != null && status >= 500 && status < 600) return { code: 'server_error', status, retryable: true };
  if (status != null && status >= 400 && status < 500) return { code: 'bad_request', status, retryable: false };
  return { code: 'unknown', status, retryable: false };
}

function isRetryableStatus(status?: number): boolean {
  if (status == null) return false;
  if (status === 429) return true;
  return status >= 500 && status < 600;
}

/** Map OpenAI ChatCompletion tools to Anthropic `tools` shape */
function openaiToolsToAnthropic(tools: ChatCompletionTool[]): Anthropic.Tool[] {
  return tools
    .filter((t): t is ChatCompletionTool & { type: 'function' } => t.type === 'function' && !!t.function?.name)
    .map((t) => {
      const params = t.function.parameters;
      const input_schema =
        params &&
        typeof params === 'object' &&
        !Array.isArray(params) &&
        (params as { type?: string }).type === 'object'
          ? (params as Anthropic.Tool.InputSchema)
          : ({
              type: 'object',
              properties: {},
              additionalProperties: true,
            } as Anthropic.Tool.InputSchema);
      return {
        name: t.function.name,
        description: t.function.description ?? '',
        input_schema,
      };
    });
}

function parseJsonArgs(raw: string): Record<string, unknown> {
  try {
    const o = JSON.parse(raw || '{}');
    return typeof o === 'object' && o !== null && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Normalize OpenAI-style `tool_calls` from Groq */
function normalizeOpenAIToolCalls(
  message: OpenAI.ChatCompletionMessage | null | undefined,
): NormalizedToolCall[] {
  const calls = message?.tool_calls;
  if (!calls?.length) return [];
  const out: NormalizedToolCall[] = [];
  for (const tc of calls) {
    if (tc.type !== 'function' || !('function' in tc) || !tc.function?.name) continue;
    out.push({
      name: tc.function.name,
      arguments: parseJsonArgs(tc.function.arguments ?? '{}'),
    });
  }
  return out;
}

async function callGroq(
  config: PromptConfig,
  cfg: (typeof LLM_TIER_CONFIG)['fast'],
  signal: AbortSignal,
): Promise<LLMGatewayResult> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) {
    throw new LLMGatewayError('GROQ_API_KEY is not set', 'bad_request');
  }

  /** Groq JSON mode is incompatible with parallel tool calls in most setups */
  const toolsForRequest = config.jsonMode ? undefined : config.tools;
  if (config.jsonMode && config.tools?.length) {
    console.warn('[llmGateway] jsonMode: omitting tools for Groq request');
  }

  const system = config.jsonMode
    ? `${config.systemPrompt}\n\nYou must respond with a single valid JSON object only (no markdown fences).`
    : config.systemPrompt;

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: system },
    { role: 'user', content: config.userMessage },
  ];

  const maxTokens = config.maxTokens ?? 2048;
  const temperature = config.temperature ?? 0.2;

  const body: ChatCompletionCreateParamsNonStreaming = {
    model: cfg.model,
    messages,
    max_tokens: maxTokens,
    temperature,
    stream: false,
    ...(config.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
    ...(toolsForRequest?.length
      ? {
          tools: toolsForRequest,
          tool_choice: config.toolChoice ?? 'auto',
        }
      : {}),
  };

  const completion = await groqClient.chat.completions.create(body, { signal });

  const msg = completion.choices?.[0]?.message;
  const content = msg?.content?.trim() ?? '';
  const toolCalls = normalizeOpenAIToolCalls(msg);
  const u = completion.usage;

  return {
    content,
    toolCalls,
    usage: {
      promptTokens: u?.prompt_tokens,
      completionTokens: u?.completion_tokens,
      totalTokens: u?.total_tokens,
    },
    provider: 'groq',
    model: cfg.model,
  };
}

async function callAnthropic(
  config: PromptConfig,
  cfg: (typeof LLM_TIER_CONFIG)['complex'],
  signal: AbortSignal,
): Promise<LLMGatewayResult> {
  const client = getAnthropicClient();
  const system =
    (config.jsonMode
      ? `${config.systemPrompt}\n\nRespond with valid JSON only (no markdown code fences unless the user explicitly asked for code).`
      : config.systemPrompt) ?? config.systemPrompt;

  const anthropicTools = config.tools?.length ? openaiToolsToAnthropic(config.tools) : undefined;

  const request: Anthropic.MessageCreateParams = {
    model: cfg.model,
    max_tokens: config.maxTokens ?? 4096,
    temperature: config.temperature ?? 0.2,
    system,
    messages: [{ role: 'user', content: config.userMessage }],
    ...(anthropicTools?.length ? { tools: anthropicTools } : {}),
  };

  const message = await client.messages.create(request, { signal });

  let text = '';
  const toolCalls: NormalizedToolCall[] = [];

  for (const block of message.content) {
    if (block.type === 'text') {
      text += block.text;
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        name: block.name,
        arguments:
          typeof block.input === 'object' && block.input !== null && !Array.isArray(block.input)
            ? (block.input as Record<string, unknown>)
            : {},
      });
    }
  }

  const usage: LLMGatewayUsage = {
    promptTokens: message.usage?.input_tokens,
    completionTokens: message.usage?.output_tokens,
    totalTokens:
      message.usage?.input_tokens != null && message.usage?.output_tokens != null
        ? message.usage.input_tokens + message.usage.output_tokens
        : undefined,
  };

  return {
    content: text.trim(),
    toolCalls,
    usage,
    provider: 'anthropic',
    model: cfg.model,
  };
}

async function tryViaLiteLLM(config: PromptConfig): Promise<LLMGatewayResult | null> {
  const litellmUrl = process.env.LITELLM_URL?.trim();
  if (!litellmUrl || /localhost|127\.0\.0\.1/i.test(litellmUrl)) return null;

  try {
    const { callModelSafe } = await import('./gateway.js');
    const tier = config.tier === LLM_TIER.FAST ? 'fast' : 'complex';
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: config.systemPrompt },
      { role: 'user', content: config.userMessage },
    ];
    const response = await callModelSafe({
      tier: tier as 'fast' | 'complex',
      messages,
      tools: config.tools,
      toolChoice: config.toolChoice,
      tenantId: config.tenantId ?? 'llm-gateway',
      maxTokens: config.maxTokens,
      temperature: config.temperature,
    });

    const msg = response.choices?.[0]?.message;
    const u = response.usage;
    return {
      content: msg?.content?.trim() ?? '',
      toolCalls: normalizeOpenAIToolCalls(msg),
      usage: {
        promptTokens: u?.prompt_tokens,
        completionTokens: u?.completion_tokens,
        totalTokens: u ? (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0) : undefined,
      },
      provider: config.tier === LLM_TIER.FAST ? 'groq' : 'anthropic',
      model: config.tier === LLM_TIER.FAST ? LLM_TIER_CONFIG.fast.model : LLM_TIER_CONFIG.complex.model,
    };
  } catch {
    return null;
  }
}

async function executeOnce(config: PromptConfig, signal: AbortSignal): Promise<LLMGatewayResult> {
  const litellmResult = await tryViaLiteLLM(config);
  if (litellmResult) return litellmResult;

  if (config.tier === LLM_TIER.FAST) {
    return callGroq(config, LLM_TIER_CONFIG.fast, signal);
  }
  return callAnthropic(config, LLM_TIER_CONFIG.complex, signal);
}

function wrapSdkError(err: unknown): LLMGatewayError {
  const { code, status } = classifyError(err);
  const msg = err instanceof Error ? err.message : String(err);
  return new LLMGatewayError(msg, code, { statusCode: status, cause: err });
}

/**
 * Single entry: route by tier (Claude vs Groq), apply timeout, retries on 429/5xx.
 */
export async function generateResponse(config: PromptConfig): Promise<LLMGatewayResult> {
  const tierCfg = config.tier === LLM_TIER.FAST ? LLM_TIER_CONFIG.fast : LLM_TIER_CONFIG.complex;
  const maxRetries = tierCfg.maxRetries;
  const timeoutMs = tierCfg.timeoutMs;

  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const result = await executeOnce(config, controller.signal);
      clearTimeout(timer);
      return result;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;

      const classified = classifyError(err);
      const status = httpStatus(err) ?? classified.status;

      if (isAbortError(err) || classified.code === 'timeout') {
        throw new LLMGatewayError(
          err instanceof Error ? err.message : 'Request timed out',
          'timeout',
          { statusCode: status, cause: err },
        );
      }

      const retryable = classified.retryable || isRetryableStatus(status);

      if (!retryable || attempt === maxRetries - 1) {
        throw wrapSdkError(err);
      }

      const delayMs = Math.min(8000, 400 * 2 ** attempt);
      console.warn(`[llmGateway] retry ${attempt + 1}/${maxRetries} after error`, {
        tier: config.tier,
        tenantId: config.tenantId,
        delayMs,
        message: err instanceof Error ? err.message : String(err),
        status,
      });
      await sleep(delayMs);
    }
  }

  throw wrapSdkError(lastErr);
}
