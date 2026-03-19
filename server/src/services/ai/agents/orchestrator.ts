/**
 * Orchestrator Agent — Traffic cop that routes to specialists
 *
 * Classifies user intent and either responds directly (greetings, general)
 * or delegates to the appropriate specialist via route_to_specialist.
 */

import type OpenAI from 'openai';
import { callModelSafe } from '../gateway.js';
import { getSpecialist } from './specialistRegistry.js';
import { compressConversationContext } from './contextCompressor.js';
import { executeTool } from '../toolRegistry.js';
import { streamGroqAnswer } from '../../../services/knowledgeGroq.js';
import { streamGeminiAnswer } from '../../../services/knowledgeGemini.js';
import type { AgentContext } from './types.js';
import type { DoraRequestContext } from '../dora/types.js';
import type { ToolContext } from '../types.js';
import type { OrchestrationResult } from '../orchestrator/types.js';
import type { PendingActionSSEEvent } from '../actions/types.js';

export type OrchestratorResult = OrchestrationResult | { type: 'no_specialist'; content: null; module: string; refinedQuery: string };

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
    description: 'Route the user\'s question to a specialist module. Use when the question requires live data or actions from a specific module. Do NOT use for greetings, documentation-only questions, or general chitchat.',
    parameters: {
      type: 'object' as const,
      properties: {
        primary_module: {
          type: 'string',
          enum: ['crm', 'support', 'finance', 'hr', 'marketing', 'time', 'okr', 'assets', 'contracts', 'heart'],
          description: `The specialist module: crm (deals, pipeline, contacts), support (tickets, SLA), finance (expenses, invoices, budgets), hr (employees, recruitment, PEOPLE, PERFORMANCE), marketing (campaigns, leads), time (timesheets, PROJECTS, TASKS, sprints), okr (goals), assets (inventory), contracts (renewals), heart (sentiment, wellness)`,
        },
        refined_query: { type: 'string', description: 'The user\'s question, possibly refined for the specialist' },
        complexity: { type: 'string', enum: ['simple', 'moderate', 'complex'], description: 'Estimated complexity' },
      },
      required: ['primary_module', 'refined_query'],
    },
  },
};

const KB_OR_RESPOND_TOOL = {
  type: 'function' as const,
  function: {
    name: 'search_knowledge_or_respond',
    description: 'Use for: documentation questions, how-to guides, platform info, greetings, or anything that does NOT need live business data from a specialist. For greetings/chitchat, set needs_kb_search=false and provide direct_response.',
    parameters: {
      type: 'object' as const,
      properties: {
        direct_response: { type: 'string', description: 'Your direct answer for greetings, chitchat, or questions you can answer immediately. Use empty string if needs_kb_search is true.' },
        needs_kb_search: { type: 'boolean', description: 'Set true if the query needs a knowledge base document search' },
        search_query: { type: 'string', description: 'The search query for the knowledge base (only if needs_kb_search is true)' },
      },
      required: ['direct_response', 'needs_kb_search'],
    },
  },
};

function buildOrchestratorPrompt(): string {
  return `You are the Messign routing agent. Your job is to classify the user's intent and route correctly.

You have TWO tools:
1. route_to_specialist — For questions requiring LIVE DATA (deals, tickets, tasks, performance, invoices, etc.). Use primary_module from: crm, support, finance, hr, marketing, time, okr, assets, contracts, heart.
   - hr: employees, recruitment, PEOPLE, PERFORMANCE reviews, team comparisons
   - time: time tracking, PROJECTS, TASKS, sprints, assignments, utilization
2. search_knowledge_or_respond — For: documentation, how-to guides, policies, greetings, "what can you do?", or anything that does NOT need live business data.

RULES:
1. Greetings ("hi", "hello", "thanks") → search_knowledge_or_respond with needs_kb_search=false, direct_response=your friendly reply.
2. "What can you do?" → search_knowledge_or_respond with needs_kb_search=false, direct_response=brief capability summary.
3. Documentation questions ("what does X say?", "how do I...?", "policy on...") → search_knowledge_or_respond with needs_kb_search=true, search_query=key terms.
4. Live data questions (tasks, performance, deals, invoices, etc.) → route_to_specialist with the correct primary_module.

Examples:
- "Hi!" → search_knowledge_or_respond(direct_response="Hi! How can I help you today?", needs_kb_search=false)
- "What does the Getting Started Guide say?" → search_knowledge_or_respond(direct_response="", needs_kb_search=true, search_query="Getting Started Guide")
- "What are my open tasks?" → route_to_specialist(primary_module="time", refined_query="What are my open tasks?")
- "How is Alex Chen's performance?" → route_to_specialist(primary_module="hr", refined_query="How is Alex Chen's performance?")
- "What's our pipeline value?" → route_to_specialist(primary_module="crm", refined_query="What is our total pipeline value?")`;
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
): Promise<OrchestratorResult> {
  const systemPrompt = buildOrchestratorPrompt();

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
    tools: [ROUTE_TOOL, KB_OR_RESPOND_TOOL].map((t) => t as unknown as OpenAI.ChatCompletionTool),
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

  // Handle search_knowledge_or_respond first (documentation, greetings, etc.)
  const kbCall = toolCalls.find((tc) => tc.type === 'function' && tc.function?.name === 'search_knowledge_or_respond');
  if (kbCall && kbCall.type === 'function' && kbCall.function) {
    let kbArgs: { direct_response?: string; needs_kb_search?: boolean; search_query?: string } = {};
    try {
      kbArgs = JSON.parse(kbCall.function.arguments || '{}') as typeof kbArgs;
    } catch {
      console.warn('[Orchestrator] Failed to parse search_knowledge_or_respond args');
    }
    const needsKbSearch = kbArgs.needs_kb_search === true;
    const searchQuery = (kbArgs.search_query?.trim() || query).slice(0, 500);
    const directResponse = kbArgs.direct_response?.trim() ?? '';

    if (!needsKbSearch && directResponse) {
      onChunk(directResponse);
      return {
        success: true,
        finalAnswer: directResponse,
        steps: [],
        stepCount: 0,
        terminationReason: 'complete',
        toolsUsed: [],
        totalDataPoints: 0,
        totalTokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        totalDurationMs: 0,
      };
    }

    if (needsKbSearch) {
      const ctx = agentContext.legacyContext;
      if (!ctx) throw new Error('[Orchestrator] legacyContext required for KB search');
      const kbResult = await executeTool('knowledge:search_knowledge_base', { query: searchQuery }, ctx);
      const context = kbResult.success && kbResult.summary
        ? kbResult.summary
        : (kbResult.success && kbResult.data && Array.isArray(kbResult.data))
          ? (kbResult.data as Record<string, unknown>[]).map((d) => (d as { title?: string; content?: string }).content ?? JSON.stringify(d)).join('\n\n')
          : 'No matching documents were found.';
      const chatHistory = history.slice(-4).filter((h) => h.role === 'user' || h.role === 'assistant').map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content }));
      const tenantId = agentContext.tenantId ?? 'system';
      try {
        await streamGroqAnswer(query, context, onChunk, chatHistory, { concise: agentContext.conciseMode, tenantId });
      } catch {
        await streamGeminiAnswer(query, context, onChunk, { tenantId });
      }
      return {
        success: true,
        finalAnswer: '',
        steps: [],
        stepCount: 1,
        terminationReason: 'complete',
        toolsUsed: ['knowledge:search_knowledge_base'],
        totalDataPoints: kbResult.success && kbResult.data && Array.isArray(kbResult.data) ? kbResult.data.length : 0,
        totalTokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        totalDurationMs: 0,
      };
    }
  }

  // Handle route_to_specialist
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
    console.log('[Orchestrator] No specialist for module, falling back', { module: primaryModule ?? 'unknown' });
    return {
      type: 'no_specialist',
      content: null,
      module: primaryModule ?? 'unknown',
      refinedQuery,
    };
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
    toolObservations: result.toolObservations,
  };
}
