import { getToolsForLLM, executeTool } from '../toolRegistry.js';
import {
  callGroqWithToolsMultiTurnTracked,
  callGeminiWithTools,
  callClaudeWithTools,
  streamGroqCompletion,
  getGroqApiKey,
  type GroqMessage,
} from '../groqToolCalling.js';
import { sanitizeData } from '../dataSanitizer.js';
import { logToolExecution } from '../queryLogger.js';
import { streamWithCascade } from '../aiCascade.js';
import { buildDoraAgenticPrompt, buildForcedSynthesisPrompt } from '../dora/agenticPrompts.js';
import { StepTracker } from './stepTracker.js';
import { selectToolsForQuery } from './toolSelector.js';
import { isWriteTool, interceptWriteAction } from '../actions/actionInterceptor.js';
import { getToolsForRole } from '../tools/writeDefinitions.js';
import { classifyTask, selectModelForTask } from '../taskRouter.js';
import { stripPII, restorePII } from '../piiStripper.js';
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
  'get_system_stats',
  'get_tasks_by_user',
  'get_project_status',
  'get_financial_summary',
  'get_invoice_details',
  'play_dora_dash',
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
 * - Cascade fallback (Groq -> Gemini -> Anthropic)
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
  const { provider, ...restConfig } = config;
  const cfg = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...restConfig };
  const tracker = new StepTracker(cfg);
  const startTime = Date.now();

  console.log(`[Orchestrator] Starting for query: "${query.substring(0, 80)}..." (user: ${ctx.user.userName})`);

  const systemPrompt = buildDoraAgenticPrompt(ctx);
  const allToolsWithWrites = getToolsForRole(ctx.user.userRole, getToolsForLLM());
  const tools = selectToolsForQuery(query, ctx.page.currentModule, allToolsWithWrites);
  const pendingActionEvents: PendingActionSSEEvent[] = [];

  const taskType = classifyTask(tools.length, tools.map(t => t.function.name), query.length);
  const modelSelection = selectModelForTask(taskType);
  console.log(`[Orchestrator] Selected ${tools.length}/${allToolsWithWrites.length} tools for query (task: ${taskType}, provider: ${modelSelection.provider})`);

  const piiResult = stripPII(query);
  const sanitizedQuery = piiResult.sanitizedText;
  const piiMappings = piiResult.mappings;
  if (piiResult.strippedCount > 0) {
    console.log(`[Orchestrator] Stripped ${piiResult.strippedCount} PII field(s) from query`);
  }

  const messages: GroqMessage[] = [
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

      console.log(`[Orchestrator] Step ${stepIndex + 1}/${cfg.maxSteps} — calling LLM (primary: ${modelSelection.provider})...`);

      const providerOrder: ('groq' | 'gemini' | 'anthropic')[] = [
        modelSelection.provider,
        ...(['groq', 'gemini', 'anthropic'] as const).filter((p) => p !== modelSelection.provider),
      ];

      const historyMessages = history.slice(-4).filter((h) => h.role === 'user' || h.role === 'assistant')
        .map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content }));

      type LlmResponseShape = { content?: string | null; toolCalls?: Array<{ name: string; args: Record<string, unknown>; callId?: string }> | null; rawToolCalls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>; usage?: StepTokenUsage };
      let llmResponse: LlmResponseShape | undefined;
      let lastError: Error | null = null;

      for (const provider of providerOrder) {
        try {
          if (provider === 'groq') {
            const groqRes = await callGroqWithToolsMultiTurnTracked(messages, tools, {
              model: cfg.model,
              temperature: cfg.reasoningTemperature,
              maxTokens: 1500,
            });
            llmResponse = { ...groqRes, toolCalls: groqRes.toolCalls ?? undefined };
          } else if (provider === 'gemini') {
            const geminiResult = await callGeminiWithTools(systemPrompt, sanitizedQuery, historyMessages, tools);
            llmResponse = {
              ...geminiResult,
              usage: { promptTokens: 0, completionTokens: 0, totalTokens: 500 },
              rawToolCalls: geminiResult.toolCalls?.map((tc, i) => ({
                id: `gemini_${stepIndex}_${i}_${tc.name}`,
                type: 'function' as const,
                function: { name: tc.name, arguments: JSON.stringify(tc.args) },
              })),
            };
          } else {
            const claudeResult = await callClaudeWithTools(systemPrompt, sanitizedQuery, historyMessages, tools);
            llmResponse = {
              ...claudeResult,
              usage: { promptTokens: 0, completionTokens: 0, totalTokens: 500 },
              rawToolCalls: claudeResult.toolCalls?.map((tc, i) => ({
                id: `claude_${stepIndex}_${i}_${tc.name}`,
                type: 'function' as const,
                function: { name: tc.name, arguments: JSON.stringify(tc.args) },
              })),
            };
          }
          console.log(`[Orchestrator] ${provider} succeeded at step ${stepIndex + 1}`);
          break;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          const errMsg = lastError.message;

          if (errMsg.includes('429') || errMsg.toLowerCase().includes('rate limit') || errMsg.toLowerCase().includes('quota exceeded')) {
            console.warn(`[Orchestrator] ${provider} rate limit hit — informing user`);
            const rateLimitMsg =
              provider === 'groq'
                ? "I'm currently experiencing high demand on my AI processing service. Please wait a few minutes and try again. If this persists, the daily limit may have been reached — it resets at midnight UTC."
                : "AI services are temporarily rate-limited. Please try again in a minute.";
            onChunk(rateLimitMsg);
            return buildResult(tracker, 'error', rateLimitMsg, startTime, 'rate_limit', pendingActionEvents);
          }

          console.warn(`[Orchestrator] ${provider} failed at step ${stepIndex + 1} (${errMsg.substring(0, 80)}...), trying next provider...`);
        }
      }

      if (!llmResponse) {
        console.error(`[Orchestrator] All providers failed at step ${stepIndex + 1}:`, lastError?.message);
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
          return buildResult(tracker, terminationReason, thought, startTime, undefined, pendingActionEvents);
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
          if (toolName === 'search_knowledge_base' && cached.success && cached.summary?.includes('| Content:')) {
            toolContent = STRICT_RAG_PREAMBLE + cached.summary;
          }
          messages.push({
            role: 'tool',
            tool_call_id: callId,
            content: toolContent.slice(0, 8000),
          });
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
          const interceptStart = Date.now();
          const { toolResult, sseEvent } = await interceptWriteAction(toolName, parsedArgs, ctx, query);
          const interceptElapsed = Date.now() - interceptStart;

          pendingActionEvents.push(sseEvent);
          tracker.cacheResult(toolName, parsedArgs, toolResult);
          observations.push({ ...toolResult, toolName, executionTimeMs: interceptElapsed });

          const toolContent = toolResult.summary || JSON.stringify(toolResult.data ?? {});
          messages.push({
            role: 'tool',
            tool_call_id: callId,
            content: toolContent.slice(0, 8000),
          });
          continue;
        }

        const toolStart = Date.now();
        const result = await executeTool(toolName, parsedArgs, legacyContext);
        const toolElapsed = Date.now() - toolStart;

        logToolExecution(null, toolName, toolElapsed, result.success, result.metadata?.count ?? 0).catch(() => {});

        const sanitized: ToolResult = {
          ...result,
          data: result.data ? sanitizeData(result.data, legacyContext.userRole === 'admin') : null,
        };

        tracker.cacheResult(toolName, parsedArgs, sanitized);
        observations.push({ ...sanitized, toolName, executionTimeMs: toolElapsed });

        let toolContent = sanitized.summary || JSON.stringify(sanitized.data ?? {});
        if (toolName === 'search_knowledge_base' && sanitized.success && sanitized.summary?.includes('| Content:')) {
          const confidence = sanitized.metadata?.confidence ?? 0.7;
          const lowConfNote =
            confidence < 0.5
              ? 'Note: Retrieval confidence is low. Consider inferring from related content or suggesting the user request documentation.\n\n'
              : confidence < 0.7
                ? 'Note: Retrieval confidence is moderate. Light inference from related concepts is acceptable.\n\n'
                : '';
          toolContent = STRICT_RAG_PREAMBLE + lowConfNote + sanitized.summary;
        }

        messages.push({
          role: 'tool',
          tool_call_id: callId,
          content: toolContent.slice(0, 8000),
        });
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
      sanitizedQuery, history, ctx, tracker, terminationReason, piiRestoringChunk, cfg, provider
    );

    const restoredAnswer = piiMappings.size > 0 ? restorePII(finalAnswer, piiMappings) : finalAnswer;
    return buildResult(tracker, terminationReason, restoredAnswer, startTime, undefined, pendingActionEvents);

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown orchestration error';
    console.error(`[Orchestrator] Fatal error:`, message);

    const collectedContext = tracker.buildFullContextForSynthesis();
    if (collectedContext.length > 0) {
      const fallbackMsg =
        `I ran into an issue completing my analysis, but here's what I found so far:\n\n` +
        collectedContext.substring(0, 2000);
      onChunk(fallbackMsg);
      return buildResult(tracker, 'error', fallbackMsg, startTime, message, pendingActionEvents);
    }

    const errorMsg = `I'm having trouble accessing the data right now. Please try again in a moment.`;
    onChunk(errorMsg);
    return buildResult(tracker, 'error', errorMsg, startTime, message, pendingActionEvents);
  }
}

async function streamClaudeSynthesis(
  synthesisPrompt: string,
  query: string,
  history: Array<{ role: string; content: string }>,
  fullContext: string,
  onChunk: (chunk: string) => void,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const userMessage =
    `Context:\n${fullContext.substring(0, 4000)}\n\nQuestion: ${query}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 2048,
      stream: true,
      system: synthesisPrompt,
      messages: [
        ...history.slice(-4)
          .filter((h) => h.role === 'user' || h.role === 'assistant')
          .map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
        { role: 'user', content: userMessage },
      ],
    }),
  });

  if (!res.ok || !res.body) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Anthropic API error ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalAnswer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event = JSON.parse(line.slice(6)) as { type?: string; delta?: { text?: string } };
          if (event.type === 'content_block_delta' && event.delta?.text) {
            onChunk(event.delta.text);
            finalAnswer += event.delta.text;
          }
        } catch { /* skip parse errors */ }
      }
    }
  }
  return finalAnswer;
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
): Promise<string> {
  const fullContext = tracker.buildFullContextForSynthesis();
  const toolsUsed = tracker.getUniqueToolsUsed();
  const hasKBContext = toolsUsed.includes('search_knowledge_base');
  const widgetToolsUsed = toolsUsed.filter(t => WIDGET_TOOL_NAMES.has(t));

  const synthesisPrompt = buildForcedSynthesisPrompt(
    ctx, toolsUsed, fullContext, hasKBContext, terminationReason, tracker.getStepCount(), widgetToolsUsed
  );

  const synthMessages: GroqMessage[] = [
    { role: 'system', content: synthesisPrompt },
    ...history.slice(-4)
      .filter((h) => h.role === 'user' || h.role === 'assistant')
      .map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user', content: query },
  ];

  let finalAnswer = '';

  // Use Claude for synthesis if explicitly requested
  if (provider === 'claude') {
    try {
      console.log('[Orchestrator] Using Claude for synthesis (provider=claude)');
      finalAnswer = await streamClaudeSynthesis(synthesisPrompt, query, history, fullContext, onChunk);
      if (finalAnswer.trim()) return finalAnswer;
    } catch (claudeErr) {
      console.warn('[Orchestrator] Claude synthesis failed, falling back to Groq:', claudeErr);
    }
  }

  // Try streaming with Groq first (default path)
  if (!finalAnswer.trim() && getGroqApiKey()) {
    try {
      const stream = streamGroqCompletion(synthMessages, {
        model: cfg.model,
        temperature: cfg.synthesisTemperature,
        maxTokens: 2000,
      });

      for await (const chunk of stream) {
        onChunk(chunk);
        finalAnswer += chunk;
      }

      if (finalAnswer.trim()) return finalAnswer;
    } catch (synthError) {
      console.warn('[Orchestrator] Groq synthesis streaming failed:', synthError);
    }
  }

  // Fallback to the existing cascade (Groq non-tracked -> Gemini -> Anthropic)
  if (!finalAnswer.trim()) {
    try {
      const cascadeResult = await streamWithCascade(
        (chunk) => {
          onChunk(chunk);
          finalAnswer += chunk;
        },
        {
          userQuery: query,
          trimmedContext: fullContext,
          systemPrompt: synthesisPrompt,
          userMessage: query,
          chatHistory: history.slice(-4)
            .filter((h) => h.role === 'user' || h.role === 'assistant')
            .map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
          concise: ctx.conciseMode,
          maxTokens: 2000,
        }
      );

      if (cascadeResult && finalAnswer.trim()) return finalAnswer;
    } catch (cascadeErr) {
      console.warn('[Orchestrator] Cascade synthesis failed:', cascadeErr);
    }
  }

  // Last resort: raw context dump
  if (!finalAnswer.trim()) {
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
): OrchestrationResult {
  return {
    success: terminationReason !== 'error' && terminationReason !== 'cascade_failure',
    finalAnswer,
    steps: tracker.getSteps(),
    stepCount: tracker.getStepCount(),
    terminationReason,
    toolsUsed: tracker.getUniqueToolsUsed(),
    totalDataPoints: tracker.getTotalDataPoints(),
    totalTokens: tracker.getTokenUsage(),
    totalDurationMs: Date.now() - startTime,
    error,
    pendingActions: pendingActions && pendingActions.length > 0 ? pendingActions : undefined,
  };
}
