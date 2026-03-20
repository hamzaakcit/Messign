import type OpenAI from 'openai';
import { executeTool } from '../../toolRegistry.js';
import { formatForLLM, trimHistory, FORMAT_PRESETS } from '../context/formatForLLM.js';
import { toLegacyToolContext } from '../context/resolveContext.js';
import { callWithFallback, selectModelTier } from '../gateway/modelRouter.js';
import { assemblePrompt, buildAgentPrompt } from '../prompts/assemble.js';
import type { StreamController } from '../stream/StreamController.js';
import type { DoraContext, EngineConfig, ExecutionTrace, ToolDefinitionV2 } from '../types.js';
import { StepTracker } from './stepTracker.js';

const DEFAULT_CONFIG: EngineConfig = {
  maxSteps: 3,
  maxTokensPerStep: 1200,
  maxToolOutputChars: 4000,
  enableDeduplication: true,
};

function extractSourcesFromResults(
  toolResults: import('../types.js').ToolResult[],
): ExecutionTrace['sources'] {
  const sources: ExecutionTrace['sources'] = [];
  const seen = new Set<string>();
  for (const result of toolResults) {
    if (!result.success || !result.data || !Array.isArray(result.data)) continue;
    for (const item of result.data as Record<string, unknown>[]) {
      if (item.title && item.id && (item.slug != null || item.document_type != null)) {
        const id = String(item.id);
        if (seen.has(id)) continue;
        seen.add(id);
        sources.push({
          id,
          title: String(item.title),
          slug: item.slug != null ? String(item.slug) : undefined,
          document_type: item.document_type != null ? String(item.document_type) : undefined,
        });
      }
    }
  }
  return sources;
}

export async function runAgenticEngine(params: {
  userMessage: string;
  history: Array<{ role: string; content: string }>;
  tools: ToolDefinitionV2[];
  context: DoraContext;
  streamController?: StreamController;
  config?: Partial<EngineConfig>;
}): Promise<ExecutionTrace> {
  const cfg = { ...DEFAULT_CONFIG, ...params.config };
  const tracker = new StepTracker();
  const toolResults: import('../types.js').ToolResult[] = [];
  const toolsUsed: string[] = [];

  const trimmedHist = trimHistory(params.history, 12, 2000);
  const baseMessages = assemblePrompt(buildAgentPrompt(params.context), params.context);
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    ...baseMessages,
    ...trimmedHist.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: params.userMessage },
  ];

  const llmTools = params.tools.map((t) => t.llmTool);
  const tiers = selectModelTier('agent', params.userMessage, llmTools.length);
  let finalAssistantContent: string | null = null;

  for (let step = 0; step < cfg.maxSteps; step++) {
    params.streamController?.emit('progress', {
      step: step + 1,
      maxSteps: cfg.maxSteps,
      phase: 'model',
    });

    const normalized = await callWithFallback(
      {
        messages,
        tools: llmTools.length ? llmTools : undefined,
        tenantId: params.context.organizationId,
        maxTokens: cfg.maxTokensPerStep,
        temperature: 0.3,
        userQuery: params.userMessage,
      },
      tiers.primary,
      tiers.fallback,
    );

    const assistantMsg = normalized.raw.choices?.[0]?.message;
    if (assistantMsg) {
      messages.push(assistantMsg as OpenAI.ChatCompletionMessageParam);
    }

    const tcList = normalized.toolCalls?.length
      ? normalized.toolCalls
      : (((assistantMsg as { tool_calls?: unknown })?.tool_calls as Array<{
            id?: string;
            function?: { name?: string; arguments?: string };
          }>) ?? []).map((x) => ({
            id: x.id,
            name: x.function?.name ?? '',
            arguments: x.function?.arguments ?? '{}',
          }));

    if (!tcList.length) {
      finalAssistantContent = normalized.content;
      break;
    }

    const stepCalls: import('../types.js').ToolCall[] = [];
    const stepResults: import('../types.js').ToolResult[] = [];

    for (const tc of tcList) {
      if (!tc.name) continue;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.arguments || '{}') as Record<string, unknown>;
      } catch {
        args = {};
      }

      const call = { name: tc.name, args };
      stepCalls.push(call);

      if (cfg.enableDeduplication && tracker.isDuplicate(call)) {
        const dup: import('../types.js').ToolResult = {
          success: true,
          data: null,
          summary: 'Skipped duplicate tool call.',
        };
        stepResults.push(dup);
        toolResults.push(dup);
        messages.push({
          role: 'tool',
          tool_call_id: tc.id ?? `call_${tc.name}`,
          content: formatForLLM(dup, { ...FORMAT_PRESETS.agentStep, maxChars: cfg.maxToolOutputChars }),
        });
        continue;
      }

      params.streamController?.emit('progress', {
        step: step + 1,
        maxSteps: cfg.maxSteps,
        phase: 'tool',
        tool: tc.name,
      });

      try {
        const legacy = toLegacyToolContext(params.context);
        const result = await executeTool(tc.name, args, legacy);
        toolsUsed.push(tc.name);
        toolResults.push(result);
        stepResults.push(result);
        const formatted = formatForLLM(result, { ...FORMAT_PRESETS.agentStep, maxChars: cfg.maxToolOutputChars });
        messages.push({
          role: 'tool',
          tool_call_id: tc.id ?? `call_${tc.name}`,
          content: formatted,
        });
      } catch (err) {
        const fail: import('../types.js').ToolResult = {
          success: false,
          data: null,
          summary: err instanceof Error ? err.message : String(err),
        };
        toolResults.push(fail);
        stepResults.push(fail);
        messages.push({
          role: 'tool',
          tool_call_id: tc.id ?? `call_${tc.name}`,
          content: formatForLLM(fail, FORMAT_PRESETS.agentStep),
        });
      }
    }

    tracker.recordStep(step, stepCalls, stepResults);
  }

  const dataPoints = toolResults.reduce((n, r) => {
    if (Array.isArray(r.data)) return n + r.data.length;
    if (r.data && typeof r.data === 'object') return n + 1;
    return n;
  }, 0);

  return {
    steps: tracker.steps,
    toolResults,
    toolsUsed,
    finalAssistantContent,
    dataPoints,
    sources: extractSourcesFromResults(toolResults),
  };
}
