/**
 * Orchestrator Agent — Traffic cop that routes to specialists
 *
 * Classifies user intent and either responds directly (greetings, general)
 * or delegates to the appropriate specialist via route_to_specialist.
 */

import type OpenAI from 'openai';
import { callModelSafe } from '../gateway.js';
import { getAccessibleModules } from '../../../modules/registry.js';
import { getSpecialist } from './specialistRegistry.js';
import { compressConversationContext } from './contextCompressor.js';
import type { AgentContext } from './types.js';
import type { DoraRequestContext } from '../dora/types.js';
import type { ToolContext } from '../types.js';
import type { OrchestrationResult } from '../orchestrator/types.js';
import type { PendingActionSSEEvent } from '../actions/types.js';

export class NoSpecialistError extends Error {
  constructor(public readonly module: string) {
    super(`No specialist for module: ${module}`);
    this.name = 'NoSpecialistError';
  }
}

const ROUTE_TOOL = {
  type: 'function' as const,
  function: {
    name: 'route_to_specialist',
    description: 'Route the user\'s question to a specialist module. Use when the question requires data or actions from a specific module. Do NOT use for simple greetings, "hi", "thanks", or general chitchat.',
    parameters: {
      type: 'object' as const,
      properties: {
        primary_module: { type: 'string', description: 'Module namespace: crm, support, finance, hr, marketing, knowledge, time, okr, heart, executive' },
        refined_query: { type: 'string', description: 'The user\'s question, possibly refined for the specialist' },
        complexity: { type: 'string', enum: ['simple', 'moderate', 'complex'], description: 'Estimated complexity' },
      },
      required: ['primary_module', 'refined_query'],
    },
  },
};

function buildOrchestratorPrompt(moduleList: string[]): string {
  return `You are the Messign routing agent. Your job is to classify the user's intent and route to the correct specialist.

Available modules: ${moduleList.join(', ')}

RULES:
1. You do NOT execute actions or answer data questions yourself. You classify and route.
2. For simple greetings ("hi", "hello", "thanks", "how are you"), general chitchat, or "what can you do?" — respond directly with a friendly, brief message. Do NOT call route_to_specialist.
3. For any question that requires data (deals, tickets, metrics, invoices, etc.) or actions (create task, create deal, etc.) — call route_to_specialist with the correct primary_module and the user's question as refined_query.
4. Pick the single best module. If the question spans multiple areas, pick the primary one.

Examples:
- "Hi!" → respond directly
- "What's our pipeline value?" → route_to_specialist(primary_module: "crm", refined_query: "What is our total pipeline value?")
- "Show me open support tickets" → route_to_specialist(primary_module: "support", refined_query: "Show me open support tickets")
- "How many invoices are overdue?" → route_to_specialist(primary_module: "finance", refined_query: "How many invoices are overdue?")`;
}

export function buildAgentContextFromDora(
  doraCtx: DoraRequestContext,
  legacyContext: ToolContext,
  conversationId: string,
  currentPath: string,
): AgentContext {
  const userRoles = [
    doraCtx.user.userRole,
    'employee',
    'manager',
    'admin',
    'cpo',
    'hr',
    'finance',
    'finance_admin',
    'system_admin',
  ].filter(Boolean);

  return {
    tenantId: doraCtx.user.organizationId ?? 'no-tenant',
    userId: doraCtx.user.userId,
    userRoles,
    userName: doraCtx.user.userName,
    userRole: doraCtx.user.userRole,
    conversationId,
    currentPage: currentPath,
    currentModule: doraCtx.page.currentModule,
    todayDate: doraCtx.todayDate,
    conciseMode: doraCtx.conciseMode,
    organizationId: doraCtx.user.organizationId,
    department: doraCtx.user.department,
    teamId: doraCtx.user.teamId,
    doraCtx,
    legacyContext,
  };
}

/**
 * Run the orchestrator: classify intent, then either respond directly or delegate to specialist.
 * @param onSpecialist - Optional callback fired when routing to a specialist (before streaming answer)
 */
export async function runOrchestrator(
  query: string,
  history: Array<{ role: string; content: string }>,
  agentContext: AgentContext,
  onChunk: (chunk: string) => void,
  onSpecialist?: (info: { module: string }) => void,
): Promise<OrchestrationResult> {
  const modules = getAccessibleModules(agentContext.userRoles);
  const moduleList = modules.map((m: { namespace: string }) => m.namespace);
  const systemPrompt = buildOrchestratorPrompt(moduleList);

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-4)
      .filter((h) => h.role === 'user' || h.role === 'assistant')
      .map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user', content: query },
  ];

  const response = await callModelSafe({
    tier: 'fast',
    messages,
    tools: [ROUTE_TOOL as unknown as OpenAI.ChatCompletionTool],
    tenantId: agentContext.tenantId,
    maxTokens: 500,
    temperature: 0.1,
  });

  const choice = response.choices?.[0];
  const message = choice?.message;
  if (!message) {
    throw new Error('No message in orchestrator response');
  }

  const directContent = message.content?.trim();
  const toolCalls = message.tool_calls;

  if (!toolCalls || toolCalls.length === 0) {
    const answer = directContent || "How can I help you today?";
    onChunk(answer);
    return {
      success: true,
      finalAnswer: answer,
      steps: [],
      stepCount: 0,
      terminationReason: 'complete',
      toolsUsed: [],
      totalDataPoints: 0,
      totalTokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      totalDurationMs: 0,
    };
  }

  const routeCall = toolCalls.find((tc) => tc.type === 'function' && tc.function?.name === 'route_to_specialist');
  if (!routeCall || routeCall.type !== 'function' || !routeCall.function) {
    const answer = directContent || "I'll route that to the right specialist. One moment.";
    onChunk(answer);
    return {
      success: true,
      finalAnswer: answer,
      steps: [],
      stepCount: 0,
      terminationReason: 'complete',
      toolsUsed: [],
      totalDataPoints: 0,
      totalTokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      totalDurationMs: 0,
    };
  }

  let args: { primary_module?: string; refined_query?: string } = {};
  try {
    args = JSON.parse(routeCall.function.arguments || '{}') as typeof args;
  } catch {
    console.warn('[Orchestrator] Failed to parse route_to_specialist args');
  }

  const primaryModule = args.primary_module?.toLowerCase().trim();
  const refinedQuery = args.refined_query?.trim() || query;

  const specialist = primaryModule ? getSpecialist(primaryModule) : undefined;

  if (!specialist) {
    throw new NoSpecialistError(primaryModule ?? 'unknown');
  }

  onSpecialist?.({ module: primaryModule ?? 'unknown' });

  let priorContext: string | undefined;
  if (history.length > 0) {
    priorContext = await compressConversationContext(history, agentContext.tenantId);
  }

  const result = await specialist.execute(refinedQuery, agentContext, priorContext);

  if (result.type !== 'final_answer') {
    const answer = ('content' in result ? result.content : null) ?? "I've routed your request. Please check the confirmation below.";
    onChunk(answer);
    return {
      success: true,
      finalAnswer: answer,
      steps: [],
      stepCount: 1,
      terminationReason: 'complete',
      toolsUsed: [primaryModule ?? 'unknown'],
      totalDataPoints: 0,
      totalTokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      totalDurationMs: 0,
      pendingActions: [],
    };
  }

  onChunk(result.content);

  return {
    success: true,
    finalAnswer: result.content,
    steps: [],
    stepCount: 1,
    terminationReason: 'complete',
    toolsUsed: [primaryModule ?? 'unknown'],
    totalDataPoints: 0,
    totalTokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    totalDurationMs: 0,
    pendingActions: result.pendingActions ?? [],
  };
}
