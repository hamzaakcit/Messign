import type { Message, PromptSpec, DoraContext } from '../types.js';
import {
  guardrailsLayer,
  guardrailsWidgetSupplementLayer,
  identityLayer,
  kbRulesLayer,
  moduleHintLayer,
  outputFormatsLayer,
  policyLayer,
  sessionLayer,
} from './layers/index.js';

const LAYER_BUILDERS: Record<
  import('../types.js').PromptLayerKind,
  (ctx: DoraContext, spec: PromptSpec) => string
> = {
  identity: () => identityLayer(),
  session: (ctx) => sessionLayer(ctx),
  policy: (ctx) => policyLayer(ctx),
  moduleHint: (ctx) => moduleHintLayer(ctx),
  kbRules: () => kbRulesLayer(),
  outputFormats: (_ctx, spec) =>
    outputFormatsLayer(
      spec.task === 'agent'
        ? 'toolCalling'
        : spec.task === 'planning'
          ? 'jsonOnly'
          : spec.task === 'synthesis_visual'
            ? 'widgetVisual'
            : 'streaming',
    ),
  guardrails: (_ctx, spec) =>
    spec.task === 'synthesis_visual' ? guardrailsWidgetSupplementLayer() : guardrailsLayer(),
};

export function assemblePrompt(spec: PromptSpec, ctx: DoraContext): Message[] {
  const systemParts = spec.layers.map((layer) => LAYER_BUILDERS[layer](ctx, spec));
  const system = systemParts.join('\n\n');
  return [{ role: 'system', content: system }];
}

export function buildAgentPrompt(ctx: DoraContext): PromptSpec {
  return {
    task: 'agent',
    layers: ['identity', 'session', 'policy', 'moduleHint', 'outputFormats', 'guardrails'],
  };
}

export function buildSynthesisPrompt(ctx: DoraContext): PromptSpec {
  return {
    task: 'synthesis',
    layers: ['identity', 'session', 'policy', 'moduleHint', 'outputFormats', 'guardrails'],
  };
}

/**
 * Synthesis when the client will render widgets (charts, tables, cards). System prompt avoids
 * instructing the model to repeat every metric in prose (conflicts with on-screen visuals).
 */
export function buildSynthesisVisualPrompt(_ctx: DoraContext): PromptSpec {
  return {
    task: 'synthesis_visual',
    layers: ['identity', 'session', 'policy', 'moduleHint', 'outputFormats', 'guardrails'],
  };
}

export function buildKBSynthesisPrompt(ctx: DoraContext): PromptSpec {
  return {
    task: 'kb_synthesis',
    layers: ['identity', 'session', 'policy', 'kbRules', 'outputFormats', 'guardrails'],
  };
}

export function buildGreetingPrompt(ctx: DoraContext): PromptSpec {
  return {
    task: 'greeting',
    layers: ['identity', 'session', 'outputFormats', 'guardrails'],
  };
}

export function buildPlanningPrompt(_ctx: DoraContext): PromptSpec {
  return {
    task: 'planning',
    layers: ['identity', 'session', 'outputFormats', 'guardrails'],
  };
}

export function buildExtractionPrompt(_ctx: DoraContext): PromptSpec {
  return {
    task: 'extraction',
    layers: ['identity', 'outputFormats', 'guardrails'],
  };
}

/** Gemini-style: fold leading system into first user message when needed. */
export function adaptForProvider(messages: Message[], provider: 'openai' | 'gemini'): Message[] {
  if (provider !== 'gemini') return messages;
  const [first, ...rest] = messages;
  if (first?.role !== 'system' || typeof first.content !== 'string') return messages;
  const userIdx = rest.findIndex((m) => m.role === 'user');
  if (userIdx === -1) {
    return [{ role: 'user', content: first.content }, ...rest];
  }
  const u = rest[userIdx]!;
  const merged =
    typeof u.content === 'string'
      ? `${first.content}\n\n${u.content}`
      : first.content;
  const next = [...rest];
  next[userIdx] = { ...u, content: merged };
  return next;
}
