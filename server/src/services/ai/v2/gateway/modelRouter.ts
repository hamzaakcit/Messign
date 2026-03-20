import type OpenAI from 'openai';
import {
  callModelSafe,
  streamModel,
  classifyComplexity,
  type GatewayResponseWithCache,
  type ModelTier,
} from '../../gateway.js';
import type { ModelTask } from '../types.js';
import { DoraPipelineError } from '../errors.js';

export interface NormalizedModelResponse {
  content: string | null;
  toolCalls: Array<{ id?: string; name: string; arguments: string }>;
  raw: GatewayResponseWithCache;
}

function normalizeGatewayResponse(completion: GatewayResponseWithCache): NormalizedModelResponse {
  const msg = completion.choices?.[0]?.message;
  const content = msg?.content ?? null;
  const toolCallsRaw = (msg as { tool_calls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] })?.tool_calls;
  const toolCalls =
    toolCallsRaw?.map((tc) => ({
      id: tc.id,
      name: tc.type === 'function' ? tc.function.name : '',
      arguments: tc.type === 'function' ? tc.function.arguments ?? '{}' : '{}',
    })) ?? [];
  return { content: typeof content === 'string' ? content : null, toolCalls, raw: completion };
}

export function selectModelTier(task: ModelTask, userQuery: string, toolCount: number): ModelConfigResolved {
  const q = userQuery || '';
  if (task === 'planning' || task === 'greeting' || task === 'kb') {
    return { primary: 'fast', fallback: 'balanced' };
  }
  if (task === 'synthesis') {
    return { primary: 'balanced', fallback: 'complex' };
  }
  const tier = classifyComplexity(q, toolCount);
  if (tier === 'fast') return { primary: 'fast', fallback: 'balanced' };
  if (tier === 'complex' || tier === 'frontier') return { primary: 'complex', fallback: 'balanced' };
  return { primary: 'balanced', fallback: 'complex' };
}

export interface ModelConfigResolved {
  primary: ModelTier;
  fallback: ModelTier;
}

export async function callWithFallback(
  request: Omit<Parameters<typeof callModelSafe>[0], 'tier'>,
  primary: ModelTier,
  fallback: ModelTier,
): Promise<NormalizedModelResponse> {
  try {
    const raw = await callModelSafe({ ...request, tier: primary });
    return normalizeGatewayResponse(raw);
  } catch (err) {
    try {
      const raw = await callModelSafe({ ...request, tier: fallback });
      return normalizeGatewayResponse(raw);
    } catch (e2) {
      throw new DoraPipelineError('model_unavailable', 'Primary and fallback models failed', {
        primary,
        fallback,
        error: err instanceof Error ? err.message : String(err),
        fallbackError: e2 instanceof Error ? e2.message : String(e2),
      });
    }
  }
}

export async function* streamWithFallback(
  request: Omit<Parameters<typeof callModelSafe>[0], 'tier'>,
  primary: ModelTier,
  fallback: ModelTier,
): AsyncGenerator<OpenAI.ChatCompletionChunk, void, unknown> {
  try {
    yield* streamModel({ ...request, tier: primary });
    return;
  } catch (err) {
    try {
      yield* streamModel({ ...request, tier: fallback });
      return;
    } catch (e2) {
      throw new DoraPipelineError('model_unavailable', 'Streaming failed for primary and fallback', {
        primary,
        fallback,
        error: err instanceof Error ? err.message : String(err),
        fallbackError: e2 instanceof Error ? e2.message : String(e2),
      });
    }
  }
}
