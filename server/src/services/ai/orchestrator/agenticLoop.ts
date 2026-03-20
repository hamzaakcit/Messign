import {
  getBaseToolsForLLM,
  getToolsForLLM,
  executeTool,
  resolveRegisteredToolName,
} from '../toolRegistry.js';
import { validateToolArgsForExecution } from '../toolArgSchemas.js';
import { createToolSession, activateTool } from '../tools/core/activateTool.js';
import { searchTools } from '../tools/core/searchTools.js';
import { callModelSafe, streamModelSafe, classifyComplexity, type ModelTier } from '../gateway.js';
import { redactPII, type RedactionMap } from '../safety/piiRedactor.js';
import { sanitizeData } from '../dataSanitizer.js';
import { logToolExecution } from '../queryLogger.js';
import { buildDoraAgenticPrompt, buildForcedSynthesisPrompt } from '../dora/agenticPrompts.js';
import { StepTracker } from './stepTracker.js';
import { isWriteTool, interceptWriteAction } from '../actions/actionInterceptor.js';
import { getToolsForRole } from '../tools/writeDefinitions.js';
import { stripPII, restorePII } from '../piiStripper.js';
import type { OpenAI } from 'openai';
import type { ToolContext, ToolResult } from '../types.js';
import type { DoraRequestContext } from '../dora/types.js';
import type { PendingActionSSEEvent } from '../actions/types.js';
import type {
  OrchestratorConfig,
  DEFAULT_ORCHESTRATOR_CONFIG as _defaults,
  OrchestrationResult,
  AgentStep,
  ResolvedToolCall,
  StepTokenUsage,
  TerminationReason,
} from './types.js';
import { DEFAULT_ORCHESTRATOR_CONFIG } from './types.js';

export const WIDGET_TOOL_NAMES = new Set([
  'analytics:get_system_stats',
  'projects:get_tasks_by_user',
  'projects:get_project_status',
  'finance:get_financial_summary',
  'finance:get_invoice_details',
  'achievements:get_achievements_leaderboard',
  'fun:play_dora_dash',
]);

const STRICT_RAG_PREAMBLE = `STRICT RAG DIRECTIVES (you must follow these for the knowledge base context below):
1. Answer the user's question ONLY using the CONTEXT below. Do NOT use general knowledge.
2. Read the CONTEXT deeply. Look for synonyms or related explanations if the exact phrase isn't obvious.
3. If the context contains the answer, explain it comprehensively. Quote important terms.
4. If the exact answer is not in the context: (1) Infer from related concepts, synonyms, or adjacent content when reasonable. (2) If inference is not safe, suggest escalation. (3) Never say "I cannot find" without offering inference or escalation.
5. After answering, add 1-2 related concepts or document titles from the context.

CONTEXT:
`;

/**
 * Runs the full agentic orchestration for a user query.
 *
 * This is the Phase 3 replacement for the Phase 1 runAgentLoop().
 * It implements a ReAct (THINK -> ACT -> OBSERVE) cycle with:
 * - Bounded iterations (max 6 steps)
 * - Token budget tracking
 * - Tool call deduplication
 * - LiteLLM gateway (tier-based routing + fallbacks)
 * - Streaming final synthesis only
 */
export async function orchestrate(
  query: string,
  history: Array<{ role: string; content: string }>,
  ctx: DoraRequestContext,
  legacyContext: ToolContext,
  onChunk: (chunk: string) => void,
  config: Partial<OrchestratorConfig> & { provider?: string } = {},
): Promise<OrchestrationResult> {
  const { provider, isDynamicToolLoopEnabled = false, ...restConfig } = config;
  const cfg = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...restConfig };
  const tracker = new StepTracker(cfg);
  const startTime = Date.now();

  console.log(`[Orchestrator] Starting for query: "${query.substring(0, 80)}..." (user: ${ctx.user.userName})`);
  console.log(`[A/B Test] Dynamic Loop: ${isDynamicToolLoopEnabled ? 'TRUE' : 'FALSE'}`);

  const systemPrompt = buildDoraAgenticPrompt(ctx);
  const session = createToolSession();
  const userRoles = [
    ctx.user.userRole,
    'employee',
    'manager',
    'admin',
    'cpo',
    'hr',
    'finance',
    'finance_admin',
    'system_admin',
  ].filter(Boolean);

  const baseTools = isDynamicToolLoopEnabled
    ? getBaseToolsForLLM(userRoles)
    : getToolsForLLM();
  // Sanity check: Dora's CRITICAL TOOL EXECUTION RULES require core:search_tools to be in request.tools
  // when dynamic loop is enabled. Both core:search_tools and core:activate_tool have alwaysLoaded: true.
  if (isDynamicToolLoopEnabled) {
    const hasSearch = baseTools.some(
      (t) => t.type === 'function' && t.function?.name === 'core:search_tools',
    );
    if (!hasSearch) {
      console.warn('[Orchestrator] core:search_tools not in base tools — Dora may hallucinate tools');
    }
  }
  const pendingActionEvents: PendingActionSSEEvent[] = [];

  const buildCurrentTools = () => {
    if (isDynamicToolLoopEnabled) {
      const activatedSchemas = Array.from(session.activatedTools.values()) as import('../types.js').LLMToolDefinition[];
      return getToolsForRole(ctx.user.userRole, [...baseTools, ...activatedSchemas]);
    }
    return getToolsForRole(ctx.user.userRole, baseTools);
  };

  const piiResult = stripPII(query);
  const sanitizedQuery = piiResult.sanitizedText;
  const piiMappings = piiResult.mappings;
  if (piiResult.strippedCount > 0) {
    console.log(`[Orchestrator] Stripped ${piiResult.strippedCount} PII field(s) from query`);
  }

  const toolsForTask = buildCurrentTools();
  const tier = classifyComplexity(sanitizedQuery, toolsForTask.length);
  console.log(`[Orchestrator] ${isDynamicToolLoopEnabled ? 'Base' : 'Legacy'} ${toolsForTask.length} tools (tier: ${tier})`);

  const toolRedactions: RedactionMap[] = [];

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-6).filter((h) => h.role === 'user' || h.role === 'assistant')
      .map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user', content: sanitizedQuery },
  ];

  let terminationReason: TerminationReason = 'complete';

  try {
    while (true) {
      const shouldStop = tracker.shouldTerminate();
      if (shouldStop) {
        terminationReason = shouldStop;
        console.log(`[Orchestrator] Forced termination: ${shouldStop}`);
        break;
      }

      const stepIndex = tracker.getStepCount();
      const stepStartTime = Date.now();

      console.log(`[Orchestrator] Step ${stepIndex + 1}/${cfg.maxSteps} — calling gateway (tier: ${tier})...`);

      type LlmResponseShape = { content?: string | null; toolCalls?: Array<{ name: string; args: Record<string, unknown>; callId?: string }> | null; rawToolCalls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>; usage?: StepTokenUsage; _cacheHit?: boolean; _estimatedCostSavingsUsd?: number };
      let llmResponse: LlmResponseShape | undefined;

      const tools = buildCurrentTools();
      const tenantId = ctx.user.organizationId ?? 'no-tenant';

      try {
        const response = await callModelSafe({
          tier,
          messages,
          tools: tools.length > 0 ? (tools as unknown as OpenAI.ChatCompletionTool[]) : undefined,
          tenantId,
          maxTokens: 1500,
          temperature: cfg.reasoningTemperature,
          initialRedactions: toolRedactions,
          userQuery: query,
        });

        const choice = response.choices?.[0];
        const message = choice?.message;
        if (!message) {
          throw new Error('No message in gateway response');
        }

        const usage = response.usage
          ? { promptTokens: response.usage.prompt_tokens ?? 0, completionTokens: response.usage.completion_tokens ?? 0, totalTokens: (response.usage.prompt_tokens ?? 0) + (response.usage.completion_tokens ?? 0) }
          : { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

        let toolCalls: LlmResponseShape['toolCalls'] = null;
        let rawToolCalls: LlmResponseShape['rawToolCalls'];

        if (message.tool_calls && message.tool_calls.length > 0) {
          const standardToolCalls = message.tool_calls.filter(
            (tc): tc is OpenAI.ChatCompletionMessageToolCall & { function: { name: string; arguments: string } } =>
              tc.type === 'function' && 'function' in tc && tc.function != null,
          );
          rawToolCalls = standardToolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.function.name, arguments: tc.function.arguments },
          }));
          toolCalls = standardToolCalls.map((tc) => {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
            } catch {
              console.warn(`[Orchestrator] Failed to parse tool args for ${tc.function.name}`);
            }
            return { name: tc.function.name, args, callId: tc.id };
          });
        }

        const gwResp = response as { _cacheHit?: boolean; _estimatedCostSavingsUsd?: number };
        llmResponse = {
          content: message.content ?? null,
          toolCalls,
          rawToolCalls,
          usage,
          _cacheHit: gwResp._cacheHit,
          _estimatedCostSavingsUsd: gwResp._estimatedCostSavingsUsd,
        };
        console.log(`[Orchestrator] Gateway succeeded at step ${stepIndex + 1}`);
      } catch (err) {
        const lastError = err instanceof Error ? err : new Error(String(err));
        const errMsg = lastError.message;

        if (errMsg.includes('429') || errMsg.toLowerCase().includes('rate limit') || errMsg.toLowerCase().includes('quota exceeded')) {
          console.warn(`[Orchestrator] Gateway rate limit hit — informing user`);
          const rateLimitMsg = "AI services are temporarily rate-limited. Please try again in a minute.";
          onChunk(rateLimitMsg);
          return buildResult(tracker, 'error', rateLimitMsg, startTime, 'rate_limit', pendingActionEvents, isDynamicToolLoopEnabled);
        }

        console.error(`[Orchestrator] Gateway failed at step ${stepIndex + 1}:`, errMsg);
        terminationReason = 'cascade_failure';
        break;
      }

      if (!llmResponse) {
        terminationReason = 'cascade_failure';
        break;
      }

      const stepTokens: StepTokenUsage = (llmResponse.usage && typeof llmResponse.usage.promptTokens === 'number')
        ? llmResponse.usage
        : { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      const thought = llmResponse.content?.trim() || null;

      if (cfg.logThoughts && thought) {
        console.log(`[Orchestrator] Step ${stepIndex + 1} thought: "${thought.substring(0, 120)}..."`);
      }

      const toolCalls = llmResponse.toolCalls;
      const rawToolCalls = llmResponse.rawToolCalls;

      if (!toolCalls || toolCalls.length === 0) {
        // No tools called -- LLM is done or answering directly
        if (tracker.getStepCount() === 0 && thought) {
          terminationReason = 'no_tools';
          tracker.addStep({
            index: stepIndex,
            thought,
            toolCalls: [],
            observations: [],
            success: true,
            tokensUsed: stepTokens,
            durationMs: Date.now() - stepStartTime,
            startedAt: new Date(stepStartTime).toISOString(),
          });

          onChunk(thought);
          return buildResult(tracker, terminationReason, thought, startTime, undefined, pendingActionEvents, isDynamicToolLoopEnabled, llmResponse._cacheHit, llmResponse._estimatedCostSavingsUsd);
        }

        terminationReason = 'complete';
        tracker.addStep({
          index: stepIndex,
          thought,
          toolCalls: [],
          observations: [],
          success: true,
          tokensUsed: stepTokens,
          durationMs: Date.now() - stepStartTime,
          startedAt: new Date(stepStartTime).toISOString(),
        });
        break; // Exit loop -> go to synthesis
      }

      // Tools called -- execute them
      const resolvedCalls: ResolvedToolCall[] = [];
      const observations: AgentStep['observations'] = [];

      // Build the assistant message with tool_calls for history
      if (rawToolCalls && rawToolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: thought || null,
          tool_calls: rawToolCalls,
        });
      }

      for (const tc of toolCalls) {
        const toolName = tc.name;
        const callId = tc.callId || `call_${stepIndex}_${resolvedCalls.length}_${toolName}`;
        const parsedArgs = (tc.args as Record<string, unknown>) ?? {};

        // Check deduplication cache
        const cached = tracker.getCachedResult(toolName, parsedArgs);
        if (cached) {
          resolvedCalls.push({
            id: callId,
            toolName,
            rawArguments: JSON.stringify(parsedArgs),
            parsedArguments: parsedArgs,
            wasCached: true,
          });
          observations.push({ ...cached, toolName, executionTimeMs: 0 });

          let toolContent = cached.summary || JSON.stringify(cached.data ?? {});
          if ((toolName === 'knowledge:search_knowledge_base' || toolName?.endsWith('search_knowledge_base')) && cached.success && cached.summary?.includes('| Content:')) {
            toolContent = STRICT_RAG_PREAMBLE + cached.summary;
          }
          const redacted = redactPII(toolContent.slice(0, 8000));
          toolRedactions.push(...redacted.redactions);
          messages.push({ role: 'tool', tool_call_id: callId, content: redacted.redactedText });
          continue;
        }

        resolvedCalls.push({
          id: callId,
          toolName,
          rawArguments: JSON.stringify(parsedArgs),
          parsedArguments: parsedArgs,
          wasCached: false,
        });

        // Phase 4: intercept write tools instead of executing them directly
        if (isWriteTool(toolName)) {
          const resolvedTn = resolveRegisteredToolName(toolName) ?? toolName;
          const argVal = validateToolArgsForExecution(resolvedTn, parsedArgs);
          if (!argVal.ok) {
            const toolResult: ToolResult = {
              success: false,
              data: null,
              summary: argVal.summary,
              metadata: { source: 'tool_validation', validationError: true },
            };
            tracker.cacheResult(toolName, parsedArgs, toolResult);
            observations.push({ ...toolResult, toolName, executionTimeMs: 0 });
            const redacted = redactPII(toolResult.summary.slice(0, 8000));
            toolRedactions.push(...redacted.redactions);
            messages.push({ role: 'tool', tool_call_id: callId, content: redacted.redactedText });
            continue;
          }
          const interceptStart = Date.now();
          const { toolResult, sseEvent } = await interceptWriteAction(resolvedTn, argVal.args, ctx, query);
          const interceptElapsed = Date.now() - interceptStart;

          pendingActionEvents.push(sseEvent);
          tracker.cacheResult(toolName, parsedArgs, toolResult);
          observations.push({ ...toolResult, toolName, executionTimeMs: interceptElapsed });

          const toolContent = toolResult.summary || JSON.stringify(toolResult.data ?? {});
          const redacted = redactPII(toolContent.slice(0, 8000));
          toolRedactions.push(...redacted.redactions);
          messages.push({ role: 'tool', tool_call_id: callId, content: redacted.redactedText });
          continue;
        }

        // Inline handling for core:search_tools and core:activate_tool (no executeTool)
        if (toolName === 'core:search_tools') {
          const stVal = validateToolArgsForExecution('core:search_tools', parsedArgs);
          if (!stVal.ok) {
            const toolResult: ToolResult = {
              success: false,
              data: null,
              summary: stVal.summary,
              metadata: { source: 'tool_validation', validationError: true },
            };
            tracker.cacheResult(toolName, parsedArgs, toolResult);
            observations.push({ ...toolResult, toolName, executionTimeMs: 0 });
            const redacted = redactPII(toolResult.summary.slice(0, 8000));
            toolRedactions.push(...redacted.redactions);
            messages.push({ role: 'tool', tool_call_id: callId, content: redacted.redactedText });
            continue;
          }
          const searchQuery = String(stVal.args.query ?? '').trim();
          const namespace =
            typeof stVal.args.namespace === 'string' ? stVal.args.namespace.trim() || undefined : undefined;
          const matches = searchTools(searchQuery, userRoles, 5, namespace);
          const summary =
            matches.length === 0
              ? `No tools found matching "${searchQuery}". Try a different description or omit the namespace filter.`
              : `**Tools matching "${searchQuery}"**\n\n` +
                matches
                  .map((t) => `- **${t.namespace}:${t.name}** — ${t.summary}\n  Params: ${t.parameterHints}`)
                  .join('\n\n');
          const toolResult: ToolResult = {
            success: true,
            data: matches,
            summary,
            metadata: { source: 'tool_index', count: matches.length },
          };
          tracker.cacheResult(toolName, parsedArgs, toolResult);
          observations.push({ ...toolResult, toolName, executionTimeMs: 0 });
          const searchRedacted = redactPII(summary.slice(0, 8000));
          toolRedactions.push(...searchRedacted.redactions);
          messages.push({ role: 'tool', tool_call_id: callId, content: searchRedacted.redactedText });
          continue;
        }

        if (toolName === 'core:activate_tool') {
          const atVal = validateToolArgsForExecution('core:activate_tool', parsedArgs);
          if (!atVal.ok) {
            const toolResult: ToolResult = {
              success: false,
              data: null,
              summary: atVal.summary,
              metadata: { source: 'tool_validation', validationError: true },
            };
            tracker.cacheResult(toolName, parsedArgs, toolResult);
            observations.push({ ...toolResult, toolName, executionTimeMs: 0 });
            const redacted = redactPII(toolResult.summary.slice(0, 8000));
            toolRedactions.push(...redacted.redactions);
            messages.push({ role: 'tool', tool_call_id: callId, content: redacted.redactedText });
            continue;
          }
          const toolToActivate = String(atVal.args.tool_name ?? '').trim();
          const activation = activateTool(toolToActivate, session, userRoles);
          const summary = activation.success
            ? `Tool "${toolToActivate}" is now available. You can call it with the appropriate parameters.`
            : (activation.error ?? 'Failed to activate tool.');
          const toolResult: ToolResult = {
            success: activation.success,
            data: activation.tool ?? null,
            summary,
            metadata: { source: 'tool_registry', count: activation.success ? 1 : 0 },
          };
          tracker.cacheResult(toolName, parsedArgs, toolResult);
          observations.push({ ...toolResult, toolName, executionTimeMs: 0 });
          const activateRedacted = redactPII(summary.slice(0, 8000));
          toolRedactions.push(...activateRedacted.redactions);
          messages.push({ role: 'tool', tool_call_id: callId, content: activateRedacted.redactedText });
          continue;
        }

        const toolStart = Date.now();
        const result = await executeTool(toolName, parsedArgs, legacyContext);
        const toolElapsed = Date.now() - toolStart;

        logToolExecution(null, toolName, toolElapsed, result.success, result.metadata?.count ?? 0).catch((err) => console.error('[agenticLoop] logToolExecution failed', { error: err instanceof Error ? err.message : String(err) }));

        const sanitized: ToolResult = {
          ...result,
          data: result.data ? sanitizeData(result.data, legacyContext.userRole === 'admin') : null,
        };

        tracker.cacheResult(toolName, parsedArgs, sanitized);
        observations.push({ ...sanitized, toolName, executionTimeMs: toolElapsed });

        let toolContent = sanitized.summary || JSON.stringify(sanitized.data ?? {});
        if ((toolName === 'knowledge:search_knowledge_base' || toolName?.endsWith('search_knowledge_base')) && sanitized.success && sanitized.summary?.includes('| Content:')) {
          const confidence = sanitized.metadata?.confidence ?? 0.7;
          const lowConfNote =
            confidence < 0.5
              ? 'Note: Retrieval confidence is low. Consider inferring from related content or suggesting the user request documentation.\n\n'
              : confidence < 0.7
                ? 'Note: Retrieval confidence is moderate. Light inference from related concepts is acceptable.\n\n'
                : '';
          toolContent = STRICT_RAG_PREAMBLE + lowConfNote + sanitized.summary;
        }

        const execRedacted = redactPII(toolContent.slice(0, 8000));
        toolRedactions.push(...execRedacted.redactions);
        messages.push({ role: 'tool', tool_call_id: callId, content: execRedacted.redactedText });
      }

      const successCount = observations.filter((o) => o.success).length;
      console.log(
        `[Orchestrator] Step ${stepIndex + 1}: ${toolCalls.length} tools called, ` +
        `${successCount} succeeded, ${toolCalls.length - successCount} failed`
      );

      tracker.addStep({
        index: stepIndex,
        thought,
        toolCalls: resolvedCalls,
        observations,
        success: successCount > 0,
        tokensUsed: stepTokens,
        durationMs: Date.now() - stepStartTime,
        startedAt: new Date(stepStartTime).toISOString(),
      });
    }

    // SYNTHESIS: Generate the final answer from all collected data
    console.log(
      `[Orchestrator] Entering synthesis after ${tracker.getStepCount()} steps ` +
      `(${terminationReason}). Tools used: ${tracker.getUniqueToolsUsed().join(', ')}`
    );

    const piiRestoringChunk = piiMappings.size > 0
      ? (chunk: string) => onChunk(restorePII(chunk, piiMappings))
      : onChunk;

    const finalAnswer = await synthesizeAndStream(
      sanitizedQuery, history, ctx, tracker, terminationReason, piiRestoringChunk, cfg, provider, toolRedactions
    );

    const restoredAnswer = piiMappings.size > 0 ? restorePII(finalAnswer, piiMappings) : finalAnswer;
    return buildResult(tracker, terminationReason, restoredAnswer, startTime, undefined, pendingActionEvents, isDynamicToolLoopEnabled);

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown orchestration error';
    console.error(`[Orchestrator] Fatal error:`, message);

    const collectedContext = tracker.buildFullContextForSynthesis();
    if (collectedContext.length > 0) {
      const fallbackMsg =
        `I ran into an issue completing my analysis, but here's what I found so far:\n\n` +
        collectedContext.substring(0, 2000);
      onChunk(fallbackMsg);
      return buildResult(tracker, 'error', fallbackMsg, startTime, message, pendingActionEvents, isDynamicToolLoopEnabled);
    }

    // No context collected (e.g. LiteLLM gateway failed). Rethrow so the route can run the
    // intent-router fallback (direct Groq/Gemini) instead.
    throw error;
  }
}

async function synthesizeAndStream(
  query: string,
  history: Array<{ role: string; content: string }>,
  ctx: DoraRequestContext,
  tracker: StepTracker,
  terminationReason: TerminationReason,
  onChunk: (chunk: string) => void,
  cfg: OrchestratorConfig,
  provider?: string,
  toolRedactions: RedactionMap[] = [],
): Promise<string> {
  const fullContext = tracker.buildFullContextForSynthesis();
  const toolsUsed = tracker.getUniqueToolsUsed();
  const hasKBContext = toolsUsed.some((t) => t.includes('search_knowledge_base'));
  const widgetToolsUsed = toolsUsed.filter(t => WIDGET_TOOL_NAMES.has(t));

  const synthesisPrompt = buildForcedSynthesisPrompt(
    ctx, toolsUsed, fullContext, hasKBContext, terminationReason, tracker.getStepCount(), widgetToolsUsed
  );

  const synthMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: synthesisPrompt },
    ...history.slice(-4)
      .filter((h) => h.role === 'user' || h.role === 'assistant')
      .map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user', content: query },
  ];

  let finalAnswer = '';

  // Use gateway for synthesis (LiteLLM handles routing + fallbacks)
  try {
    const synthTier: ModelTier = provider === 'claude' ? 'complex' : 'balanced';
    const tenantId = ctx.user.organizationId ?? 'no-tenant';

    const stream = streamModelSafe({
      tier: synthTier,
      messages: synthMessages as OpenAI.ChatCompletionMessageParam[],
      tenantId,
      maxTokens: 2000,
      temperature: cfg.synthesisTemperature,
      initialRedactions: toolRedactions,
    });

    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        onChunk(content);
        finalAnswer += content;
      }
    }

    if (finalAnswer.trim()) return finalAnswer;
  } catch (gatewayErr) {
    console.warn('[Orchestrator] Gateway synthesis failed:', gatewayErr);
  }

  // Last resort: raw context dump
  if (!finalAnswer.trim()) {
    const context = tracker.buildFullContextForSynthesis();
    if (context.length === 0) {
      // No tool data (e.g. LiteLLM gateway failed). Throw so the route can run the
      // intent-router fallback (direct Groq/Gemini) instead.
      throw new Error('LITELLM_CASCADE_FAILURE');
    }
    const fallback = buildFallbackAnswer(query, tracker, terminationReason);
    onChunk(fallback);
    finalAnswer = fallback;
  }

  return finalAnswer;
}

function buildFallbackAnswer(
  query: string,
  tracker: StepTracker,
  reason: TerminationReason,
): string {
  const context = tracker.buildFullContextForSynthesis();
  const toolsUsed = tracker.getUniqueToolsUsed();

  if (context.length === 0) {
    return "I wasn't able to retrieve the data needed to answer your question. Please try again in a moment.";
  }

  let prefix = '';
  if (reason === 'max_steps' || reason === 'token_budget') {
    prefix = "Your question required extensive analysis. Here's what I gathered:\n\n";
  } else if (reason === 'timeout') {
    prefix = "I ran out of time for a complete analysis, but here's what I found:\n\n";
  } else {
    prefix = "Here's what I found:\n\n";
  }

  const truncatedContext = context.length > 2000
    ? context.substring(0, 2000) + '\n\n[Data truncated for brevity]'
    : context;

  return `${prefix}${truncatedContext}\n\n*Data sources: ${toolsUsed.join(', ')}*`;
}

function buildResult(
  tracker: StepTracker,
  terminationReason: TerminationReason,
  finalAnswer: string,
  startTime: number,
  error?: string,
  pendingActions?: PendingActionSSEEvent[],
  isDynamicToolLoopEnabled?: boolean,
  cacheHit?: boolean,
  estimatedCostSavingsUsd?: number,
): OrchestrationResult {
  const totalDurationMs = Date.now() - startTime;
  const tokenUsage = tracker.getTokenUsage();
  if (isDynamicToolLoopEnabled !== undefined) {
    console.log(
      `[A/B Test] Dynamic Loop: ${isDynamicToolLoopEnabled ? 'TRUE' : 'FALSE'} | Tokens: ${tokenUsage.totalTokens} | Latency: ${totalDurationMs}ms`,
    );
  }
  return {
    success: terminationReason !== 'error' && terminationReason !== 'cascade_failure',
    finalAnswer,
    steps: tracker.getSteps(),
    stepCount: tracker.getStepCount(),
    terminationReason,
    toolsUsed: tracker.getUniqueToolsUsed(),
    totalDataPoints: tracker.getTotalDataPoints(),
    totalTokens: tokenUsage,
    totalDurationMs,
    error,
    pendingActions: pendingActions && pendingActions.length > 0 ? pendingActions : undefined,
    cacheHit,
    estimatedCostSavingsUsd,
  };
}
