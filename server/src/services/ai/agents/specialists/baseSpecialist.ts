/**
 * Base Specialist — Shared mini agentic loop for module specialists
 *
 * Runs a bounded ReAct loop (max 4 steps) with only namespace-scoped tools.
 * Uses classifyActionRisk before write tools; irreversible → HITL.
 */

import type OpenAI from 'openai';
import { callModelSafe } from '../../gateway.js';
import { getToolsForNamespace, executeTool, resolveRegisteredToolName } from '../../toolRegistry.js';
import { validateToolArgsForExecution } from '../../toolArgSchemas.js';
import { getModulePrompt } from '../../../../modules/registry.js';
import { isWriteTool, interceptWriteAction } from '../../actions/actionInterceptor.js';
import { classifyActionRisk } from '../governance.js';
import { redactPII } from '../../safety/piiRedactor.js';
import { sanitizeData } from '../../dataSanitizer.js';
import type { AgentContext, AgentResult, ToolObservation } from '../types.js';
import type { DoraRequestContext } from '../../dora/types.js';
import type { ToolContext, ToolResult } from '../../types.js';
import type { PendingActionSSEEvent } from '../../actions/types.js';

const MAX_STEPS = 4;
const STEP_TIMEOUT_MS = 10_000;
const TOTAL_TIMEOUT_MS = 25_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout`)), ms),
    ),
  ]);
}

export interface SpecialistLoopResult {
  type: 'final_answer' | 'needs_approval';
  content: string;
  toolsUsed: string[];
  pendingActions: PendingActionSSEEvent[];
  toolObservations: ToolObservation[];
}

/**
 * Run the specialist's mini agentic loop.
 */
export async function runSpecialistLoop(
  namespace: string,
  query: string,
  agentContext: AgentContext,
  doraCtx: DoraRequestContext,
  legacyContext: ToolContext,
  priorContext?: string,
): Promise<SpecialistLoopResult> {
  const tools = getToolsForNamespace(namespace, agentContext.userRoles);
  const systemPrompt = getModulePrompt(namespace, agentContext.userRole) ?? `You are the ${namespace} specialist.`;

  if (tools.length === 0) {
    return {
      type: 'final_answer',
      content: `I don't have access to ${namespace} tools for your role. Please contact an administrator.`,
      toolsUsed: [],
      pendingActions: [],
      toolObservations: [],
    };
  }

  async function executeLoop(): Promise<SpecialistLoopResult> {
    const fullSystemPrompt = `${systemPrompt}

You have access ONLY to ${namespace} tools. Use them to answer the user's question.
Max ${MAX_STEPS} tool-calling steps. After gathering data, synthesize a clear answer.
If the user asks for something outside ${namespace}, say so and suggest the right module.`;

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: fullSystemPrompt },
    ...(priorContext ? [{ role: 'user' as const, content: `Prior context: ${priorContext}` }, { role: 'assistant' as const, content: 'Understood.' }] : []),
    { role: 'user', content: query },
  ];

  const pendingActions: PendingActionSSEEvent[] = [];
  const toolsUsed: string[] = [];
  const toolObservations: ToolObservation[] = [];
  let tier: 'balanced' | 'complex' = 'balanced';

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await withTimeout(
      callModelSafe({
        tier,
        messages,
        tools: tools as unknown as OpenAI.ChatCompletionTool[],
        tenantId: agentContext.tenantId,
        maxTokens: 1500,
        temperature: 0.2,
      }),
      STEP_TIMEOUT_MS,
      'Specialist step',
    );

    const choice = response.choices?.[0];
    const message = choice?.message;
    if (!message) throw new Error('No message in specialist response');

    const thought = message.content?.trim() || null;
    const toolCalls = message.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      const answer = thought || "I couldn't gather enough data to answer. Please try rephrasing.";
      console.log('[SPECIALIST DEBUG] Returning result (no tool calls):', {
        type: 'final_answer',
        hasToolObs: toolObservations.length,
        toolNames: toolObservations.map((o) => o.toolName),
      });
      return {
        type: 'final_answer',
        content: answer,
        toolsUsed,
        pendingActions,
        toolObservations,
      };
    }

    if (step > 0) tier = 'complex';

    messages.push({
      role: 'assistant',
      content: thought || null,
      tool_calls: toolCalls
        .filter((tc): tc is typeof tc & { type: 'function'; function: { name: string; arguments?: string } } =>
          tc.type === 'function' && 'function' in tc && tc.function != null)
        .map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.function.name, arguments: tc.function.arguments ?? '' },
        })),
    });

    const validCalls = toolCalls.filter(
      (tc): tc is typeof tc & { type: 'function'; function: { name: string; arguments?: string } } =>
        tc.type === 'function' && 'function' in tc && tc.function != null,
    );

    for (const tc of validCalls) {
      const fn = tc.function;
      const toolName = fn.name;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(fn.arguments || '{}') as Record<string, unknown>;
      } catch {
        console.warn(`[Specialist] Failed to parse args for ${toolName}`);
      }

      toolsUsed.push(toolName);

      const resolvedTn = resolveRegisteredToolName(toolName) ?? toolName;
      const argVal = validateToolArgsForExecution(resolvedTn, args);
      const risk = classifyActionRisk(resolvedTn, argVal.ok ? argVal.args : args);
      const needsHITL = risk === 'irreversible' || isWriteTool(resolvedTn);

      let toolResult: ToolResult;
      if (!argVal.ok) {
        toolResult = {
          success: false,
          data: null,
          summary: argVal.summary,
          metadata: { source: 'tool_validation', validationError: true },
        };
      } else if (needsHITL) {
        const { toolResult: tr, sseEvent } = await interceptWriteAction(resolvedTn, argVal.args, doraCtx, query, risk);
        toolResult = tr;
        pendingActions.push(sseEvent);
      } else {
        toolResult = await executeTool(resolvedTn, argVal.args, legacyContext);
        toolResult = {
          ...toolResult,
          data: toolResult.data ? sanitizeData(toolResult.data, legacyContext.userRole === 'admin') : null,
        };
      }

      toolObservations.push({
        toolName,
        success: toolResult.success,
        data: toolResult.data ?? toolResult,
        summary: toolResult.summary,
      });

      const content = toolResult.summary || JSON.stringify(toolResult.data ?? {});
      const redacted = redactPII(content.slice(0, 8000));
      messages.push({ role: 'tool', tool_call_id: tc.id!, content: redacted.redactedText });
    }
  }

  // Final synthesis: ask LLM to summarize tool results into an answer
  const outcomeHints = toolObservations
    .map((o) => {
      if (!o.success) {
        return `- ${o.toolName}: FAILED — do not invent numbers; briefly say the lookup did not complete and suggest retry or checking permissions.`;
      }
      const d = o.data;
      const emptyArray = Array.isArray(d) && d.length === 0;
      const emptyObj =
        d &&
        typeof d === 'object' &&
        !Array.isArray(d) &&
        Object.keys(d as object).length === 0;
      const emptyEmployees =
        d &&
        typeof d === 'object' &&
        !Array.isArray(d) &&
        Array.isArray((d as { employees?: unknown }).employees) &&
        (d as { employees: unknown[] }).employees.length === 0;
      if (d == null || emptyArray || emptyObj || emptyEmployees) {
        return `- ${o.toolName}: OK but EMPTY — say clearly there is no data for this period (e.g. no tasks assigned), not a system error.`;
      }
      return `- ${o.toolName}: OK`;
    })
    .join('\n');

  const synthesisPrompt = `Based on the tool results above, provide a clear, concise answer to the user's question: "${query}".

TOOL OUTCOMES (follow strictly):
${outcomeHints}

IMPORTANT: A visual widget (table or chart) may appear alongside your text when data exists.
Keep your answer to 2-4 sentences focusing on the key insight. Do NOT list raw data when a widget will show it.
Never say "our data retrieval system encountered an issue" when the outcome says OK but EMPTY — that means simply no records yet.`;
  messages.push({ role: 'user', content: synthesisPrompt });

  const synthResponse = await withTimeout(
    callModelSafe({
      tier: 'balanced',
      messages,
      tenantId: agentContext.tenantId,
      maxTokens: 1000,
      temperature: 0.3,
    }),
    STEP_TIMEOUT_MS,
    'Specialist synthesis',
  );

  const synthContent = synthResponse.choices?.[0]?.message?.content?.trim() || "I've gathered the data. Here's what I found.";

    console.log('[SPECIALIST DEBUG] Returning result:', {
      type: pendingActions.length > 0 ? 'needs_approval' : 'final_answer',
      hasToolObs: toolObservations.length,
      toolNames: toolObservations.map((o) => o.toolName),
    });

    return {
      type: pendingActions.length > 0 ? 'needs_approval' : 'final_answer',
      content: synthContent,
      toolsUsed,
      pendingActions,
      toolObservations,
    };
  }

  return withTimeout(executeLoop(), TOTAL_TIMEOUT_MS, 'Specialist');
}
