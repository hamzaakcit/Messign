/**
 * Marketing Sub-Orchestrator flow: complex-tier routing → content strategist / campaign manager mini-loops.
 */
import type OpenAI from 'openai';
import { callModelSafe } from '../gateway.js';
import {
  executeTool,
  getLLMToolsForExactNames,
  resolveRegisteredToolName,
} from '../toolRegistry.js';
import { validateToolArgsForExecution } from '../toolArgSchemas.js';
import { isWriteTool, interceptWriteAction } from '../actions/actionInterceptor.js';
import { classifyActionRisk } from '../agents/governance.js';
import { redactPII } from '../safety/piiRedactor.js';
import { sanitizeData } from '../dataSanitizer.js';
import type { AgentContext, ToolObservation } from '../agents/types.js';
import type { DoraRequestContext } from '../dora/types.js';
import type { ToolContext, ToolResult } from '../types.js';
import type { PendingActionSSEEvent } from '../actions/types.js';
import type { DoraContext, ProgressStep } from '../v2/types.js';
import { getMarketingSubOrchestratorSystemPrompt } from '../../../modules/marketing/prompts/marketingSubOrchestratorPrompt.js';
import { buildMarketingContentStrategistPrompt } from '../../../modules/marketing/prompts/marketingContentStrategistPrompt.js';
import { buildMarketingCampaignManagerPrompt } from '../../../modules/marketing/prompts/marketingCampaignManagerPrompt.js';
import {
  buildLucyOrchestratorPrompt,
  wrapSpecialistSystemPromptWithLucy,
} from '../../../modules/marketing/prompts/lucyPersona.js';
import { isLucyPersonaEnabled } from '../../../modules/marketing/prompts/lucyEnabled.js';
import { loadMarketingTruthBrandLayers } from '../../../dal/marketing/truthBrand.js';
import { resolveOrgIdForTool } from '../tools/resolveOrgIdForTool.js';
import { resolveCalibrationPrompt } from '../../marketing/calibrationResolver.js';
import { getBrandProfile, formatBrandProfileAsMd } from '../../marketing/brandProfileService.js';
import { query as dbQuery } from '../../../db/index.js';
import {
  mapStrategyPlanToParsedRoute,
  plannerShouldFallbackToLegacyRouter,
  runMarketingStrategyPlannerStep,
} from './marketingStrategyPlanner.js';
import type { MarketingStrategyExecutionPlan } from '../../../modules/marketing/prompts/v2/strategyExecutionPlan.js';
import { planRequiresResearchPhase } from '../../../modules/marketing/prompts/v2/strategyExecutionPlan.js';
import type { MarketingRouteKind, ParsedMarketingRoute } from './marketingRouteTypes.js';
import type { ContentWorkflowResult, MarketingOrchestrationContext } from './marketingAgentOrchestrator.js';
import * as contentDal from '../../../dal/marketing/content.js';
import { parseToolCallArgumentsJson } from '../parseToolArguments.js';

export type { MarketingRouteKind, ParsedMarketingRoute } from './marketingRouteTypes.js';

const ROUTE_TOOL_NAME = 'route_marketing_subagent';

const STRICT_RAG_PREAMBLE = `STRICT RAG (knowledge tool): Answer using ONLY the CONTEXT below for factual claims about internal docs. If context is insufficient, say so.

CONTEXT:
`;

/** Exported for marketingAgentOrchestrator — Content Strategist tool allowlist */
export const CONTENT_TOOL_NAMES = [
  'marketing:product_truth_lookup',
  'marketing:brand_voice_check',
  'marketing:validate_product_truth',
  'marketing:compliance_scan',
  'marketing:competitor_content_scan',
  'marketing:suggest_content_topics',
  'knowledge:search_knowledge_base',
  'creative:generate_image_brief',
  'creative:check_brand_compliance',
  'creative:repurpose_content',
  'seo:keyword_optimizer',
  'marketing:competitor_social_listen',
  'marketing:list_saved_email_designs',
  'marketing:get_saved_email_design',
] as const;

/** Strategy-first research phase: read-only tools only (subset of content + campaign analytics). */
export const RESEARCH_TOOL_NAMES = [
  'knowledge:search_knowledge_base',
  'marketing:product_truth_lookup',
  'marketing:competitor_content_scan',
  'marketing:suggest_content_topics',
  'marketing:get_campaign_performance',
  'marketing:get_marketing_roi',
  'analytics:funnel_analysis',
  'seo:keyword_optimizer',
  'marketing:competitor_social_listen',
] as const;

const RESEARCH_PHASE_SYSTEM = `You are the Marketing Research phase (strategy-first). You do NOT draft final user-facing marketing copy.
Use read-only tools to gather: ICP/product truth, competitor or topic signals, and relevant metrics or funnel context.
After tools return, you will be asked to summarize findings in crisp bullets for the Content Strategist / Campaign Manager — no fluff.`;

/** Exported for marketingAgentOrchestrator — Campaign Manager tool allowlist */
export const CAMPAIGN_TOOL_NAMES = [
  'marketing:get_campaign_performance',
  'marketing:get_marketing_roi',
  'marketing:suggest_content_topics',
  'marketing:create_campaign',
  'analytics:funnel_analysis',
  'analytics:experiment_design',
  'conversion:rate_simulator',
  'automation:manage_trigger',
  'marketing:propose_brand_voice_patch',
] as const;

const MAX_SUB_STEPS = 4;
const CONTENT_STRATEGIST_MAX_STEPS = 6;
const CAMPAIGN_MANAGER_MAX_STEPS = 6;
const STEP_MS = 12_000;
const CONTENT_STRATEGIST_STEP_MS = 15_000;
const CAMPAIGN_MANAGER_STEP_MS = 15_000;

/** Successful tool calls only to these → fast-tier synthesis for campaign manager. */
const CAMPAIGN_METRICS_ONLY_TOOLS = new Set([
  'marketing:get_campaign_performance',
  'marketing:get_marketing_roi',
]);
/** Routing + campaign + content can exceed 40s when tools run; content loop uses more rounds. */
const TOTAL_MS = 90_000;

const ROUTE_MARKETING_TOOL: OpenAI.ChatCompletionTool = {
  type: 'function',
  function: {
    name: ROUTE_TOOL_NAME,
    description:
      'Classify the user marketing request and route to the correct sub-agent. Call exactly once.',
    parameters: {
      type: 'object',
      properties: {
        route: {
          type: 'string',
          enum: [
            'CONTENT_STRATEGIST',
            'CAMPAIGN_MANAGER',
            'BOTH_CAMPAIGN_THEN_CONTENT',
            'CLARIFY',
            'NOT_MARKETING',
          ],
          description: 'Routing decision.',
        },
        clarify_question: {
          type: 'string',
          description: 'If route is CLARIFY: one short question only.',
        },
        not_marketing_message: {
          type: 'string',
          description: 'If route is NOT_MARKETING: brief redirect to Dora for non-marketing tasks.',
        },
        campaign_context_note: {
          type: 'string',
          description: 'Optional note for sub-agents (e.g. campaign name).',
        },
      },
      required: ['route'],
    },
  },
};

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout`)), ms)),
  ]);
}

/** Exported for unit tests — parse first route_marketing_subagent tool call. */
/** Document execution order for tests and tooling (CLARIFY / NOT_MARKETING run no sub-loop). */
export function marketingFlowSubagentOrder(route: MarketingRouteKind): Array<'campaign' | 'content'> {
  if (route === 'CONTENT_STRATEGIST') return ['content'];
  if (route === 'CAMPAIGN_MANAGER') return ['campaign'];
  if (route === 'BOTH_CAMPAIGN_THEN_CONTENT') return ['campaign', 'content'];
  return [];
}

export function parseMarketingRouteFromMessage(message: OpenAI.ChatCompletionMessage | null | undefined): ParsedMarketingRoute | null {
  const toolCalls = message?.tool_calls;
  if (!toolCalls?.length) return null;
  const tc = toolCalls.find(
    (t): t is OpenAI.ChatCompletionMessageToolCall & { type: 'function'; function: { name: string; arguments: string } } =>
      t.type === 'function' && 'function' in t && t.function?.name === ROUTE_TOOL_NAME,
  );
  if (!tc) return null;
  let args: Record<string, unknown> = {};
  args = parseToolCallArgumentsJson(tc.function.arguments);
  const route = args.route as MarketingRouteKind | undefined;
  if (
    !route ||
    !['CONTENT_STRATEGIST', 'CAMPAIGN_MANAGER', 'BOTH_CAMPAIGN_THEN_CONTENT', 'CLARIFY', 'NOT_MARKETING'].includes(route)
  ) {
    return null;
  }
  return {
    route,
    clarifyQuestion: typeof args.clarify_question === 'string' ? args.clarify_question.trim() : undefined,
    notMarketingMessage: typeof args.not_marketing_message === 'string' ? args.not_marketing_message.trim() : undefined,
    campaignContextNote: typeof args.campaign_context_note === 'string' ? args.campaign_context_note.trim() : undefined,
  };
}

/** Sub-orchestrator routing (Claude Sonnet / complex tier). Exported for marketingAgentOrchestrator. */
export async function runMarketingRouteDecision(
  query: string,
  history: Array<{ role: string; content: string }>,
  priorContext: string | undefined,
  tenantId: string,
  forceMarketingContext: boolean,
  applyLucyPersona = false,
): Promise<ParsedMarketingRoute> {
  let system = getMarketingSubOrchestratorSystemPrompt(forceMarketingContext);
  if (applyLucyPersona && isLucyPersonaEnabled()) {
    system = buildLucyOrchestratorPrompt(system);
  }
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: system },
    ...history
      .slice(-6)
      .filter((h) => h.role === 'user' || h.role === 'assistant')
      .map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
  ];
  if (priorContext) {
    messages.push({ role: 'user', content: `Prior compressed context: ${priorContext}` });
  }
  messages.push({
    role: 'user',
    content: `User request (verbatim):\n${query}\n\nCall route_marketing_subagent once with your routing decision.`,
  });

  try {
    const response = await withTimeout(
      callModelSafe({
        tier: 'complex',
        messages,
        tools: [ROUTE_MARKETING_TOOL],
        toolChoice: { type: 'function', function: { name: ROUTE_TOOL_NAME } },
        tenantId,
        maxTokens: 500,
        temperature: 0.1,
        userQuery: query,
      }),
      STEP_MS,
      'Marketing routing',
    );

    const parsed = parseMarketingRouteFromMessage(response.choices?.[0]?.message);
    if (parsed) return parsed;
  } catch (e) {
    console.warn('[marketing routing] fallback to CONTENT_STRATEGIST', e instanceof Error ? e.message : e);
  }

  return { route: 'CONTENT_STRATEGIST' };
}

/**
 * Strategy Planner (complex) → parsed route, with legacy sub-orchestrator fallback on failure
 * or low confidence (under 60, unless routing is CLARIFY).
 */
async function resolveMarketingRouteWithPlanner(
  query: string,
  history: Array<{ role: string; content: string }>,
  priorContext: string | undefined,
  agentContext: AgentContext,
  doraCtx: DoraRequestContext,
  legacyContext: ToolContext,
  forceMarketingContext: boolean,
  applyLucyPersona: boolean,
): Promise<{ route: ParsedMarketingRoute; plan: MarketingStrategyExecutionPlan | null }> {
  const step = await runMarketingStrategyPlannerStep(
    query,
    history,
    priorContext,
    agentContext,
    doraCtx,
    legacyContext,
  );
  if (!step.ok) {
    const route = await runMarketingRouteDecision(
      query,
      history,
      priorContext,
      agentContext.tenantId,
      forceMarketingContext,
      applyLucyPersona,
    );
    return { route, plan: null };
  }
  if (plannerShouldFallbackToLegacyRouter(step.plan)) {
    const route = await runMarketingRouteDecision(
      query,
      history,
      priorContext,
      agentContext.tenantId,
      forceMarketingContext,
      applyLucyPersona,
    );
    return { route, plan: null };
  }
  return { route: mapStrategyPlanToParsedRoute(step.plan), plan: step.plan };
}

/** Mini agent loop with tool execution + optional synthesis. Exported for marketingAgentOrchestrator. */
export async function runMarketingMiniLoop(options: {
  role: 'content' | 'campaign';
  systemPrompt: string;
  toolNames: readonly string[];
  query: string;
  agentContext: AgentContext;
  doraCtx: DoraRequestContext;
  legacyContext: ToolContext;
  priorBlock?: string;
  /** Content Strategist v2: Sonnet/complex-class routing, more tool rounds, higher token budget. */
  contentStrategist?: boolean;
  /** Campaign Manager v1: complex-first planning; fast synthesis when only metrics tools ran. */
  campaignManager?: boolean;
  /** Strategy-first: tool-only research summary, no final copy; caps rounds at 3 unless maxSteps set. */
  researchMode?: boolean;
  /** Override max tool-calling rounds (e.g. research phase = 3). */
  maxSteps?: number;
}): Promise<{
  content: string;
  pendingActions: PendingActionSSEEvent[];
  toolObservations: ToolObservation[];
  toolsUsed: string[];
}> {
  const {
    role,
    systemPrompt,
    toolNames,
    query,
    agentContext,
    doraCtx,
    legacyContext,
    priorBlock,
    contentStrategist,
    campaignManager,
    researchMode,
    maxSteps,
  } = options;
  const maxSubSteps =
    maxSteps ??
    (researchMode
      ? 3
      : contentStrategist
        ? CONTENT_STRATEGIST_MAX_STEPS
        : campaignManager
          ? CAMPAIGN_MANAGER_MAX_STEPS
          : MAX_SUB_STEPS);
  const stepTimeoutMs = researchMode
    ? CONTENT_STRATEGIST_STEP_MS
    : contentStrategist
      ? CONTENT_STRATEGIST_STEP_MS
      : campaignManager
        ? CAMPAIGN_MANAGER_STEP_MS
        : STEP_MS;
  const tools = getLLMToolsForExactNames([...toolNames], agentContext.userRoles);
  const fullSystem = `${systemPrompt}

You have ONLY the tools listed in this session. Max ${maxSubSteps} tool-calling rounds; then answer.
${priorBlock ? `\nContext from prior step:\n${priorBlock}\n` : ''}`;

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: fullSystem },
    { role: 'user', content: query },
  ];

  const pendingActions: PendingActionSSEEvent[] = [];
  const toolObservations: ToolObservation[] = [];
  const toolsUsed: string[] = [];
  let tier: 'balanced' | 'complex' = researchMode || contentStrategist || campaignManager ? 'complex' : 'balanced';

  for (let step = 0; step < maxSubSteps; step++) {
    const maxTokensThisStep = researchMode
      ? 2000
      : role === 'content'
        ? contentStrategist
          ? 2200
          : 1800
        : campaignManager
          ? 2000
          : 1500;
    const response = await withTimeout(
      callModelSafe({
        tier,
        messages,
        tools: tools.length ? (tools as unknown as OpenAI.ChatCompletionTool[]) : undefined,
        tenantId: agentContext.tenantId,
        maxTokens: maxTokensThisStep,
        temperature: 0.25,
        userQuery: query,
      }),
      stepTimeoutMs,
      `Marketing ${role} step`,
    );

    const message = response.choices?.[0]?.message;
    if (!message) throw new Error(`No message in marketing ${role} response`);

    const thought = message.content?.trim() || null;
    const toolCalls = message.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      const answer =
        thought ||
        (researchMode
          ? 'No research tools were invoked; say what data is missing.'
          : "I couldn't complete that with the available data. Try rephrasing or check the Marketing hub.");
      return { content: answer, pendingActions, toolObservations, toolsUsed };
    }

    if (step > 0) tier = 'complex';

    messages.push({
      role: 'assistant',
      content: thought || null,
      tool_calls: toolCalls
        .filter(
          (tc): tc is OpenAI.ChatCompletionMessageToolCall & { type: 'function'; function: { name: string; arguments?: string } } =>
            tc.type === 'function' && 'function' in tc && tc.function != null,
        )
        .map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.function.name, arguments: tc.function.arguments ?? '' },
        })),
    });

    const validCalls = toolCalls.filter(
      (tc): tc is OpenAI.ChatCompletionMessageToolCall & { type: 'function'; function: { name: string; arguments?: string } } =>
        tc.type === 'function' && 'function' in tc && tc.function != null,
    );

    const readOnlyCalls = validCalls.filter((tc) => {
      const rn = resolveRegisteredToolName(tc.function.name) ?? tc.function.name;
      const args = parseToolCallArgumentsJson(tc.function.arguments);
      const argVal = validateToolArgsForExecution(rn, args);
      const risk = classifyActionRisk(rn, argVal.ok ? argVal.args : args);
      return !(risk === 'irreversible' || isWriteTool(rn)) && argVal.ok;
    });
    const canParallelize = readOnlyCalls.length === validCalls.length && validCalls.length > 1;

    if (canParallelize) {
      const results = await Promise.all(
        validCalls.map(async (tc) => {
          const toolName = tc.function.name;
          const args = parseToolCallArgumentsJson(tc.function.arguments);
          const resolvedTn = resolveRegisteredToolName(toolName) ?? toolName;
          const argVal = validateToolArgsForExecution(resolvedTn, args);
          const toolResult = await executeTool(resolvedTn, argVal.ok ? argVal.args : args, legacyContext);
          return { tc, toolName, toolResult: {
            ...toolResult,
            data: toolResult.data ? sanitizeData(toolResult.data, legacyContext.userRole === 'admin') : null,
          }};
        }),
      );
      for (const { tc, toolName, toolResult } of results) {
        toolsUsed.push(toolName);
        toolObservations.push({
          toolName,
          success: toolResult.success,
          data: toolResult.data ?? toolResult,
          summary: toolResult.summary,
        });
        let toolContent = toolResult.summary || JSON.stringify(toolResult.data ?? {});
        if (
          (toolName === 'knowledge:search_knowledge_base' || toolName.endsWith('search_knowledge_base')) &&
          toolResult.success &&
          toolContent.includes('| Content:')
        ) {
          toolContent = STRICT_RAG_PREAMBLE + toolContent;
        }
        const redacted = redactPII(toolContent.slice(0, 8000));
        messages.push({ role: 'tool', tool_call_id: tc.id!, content: redacted.redactedText });
      }
    } else {
      for (const tc of validCalls) {
        const toolName = tc.function.name;
        const args = parseToolCallArgumentsJson(tc.function.arguments);

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

        let toolContent = toolResult.summary || JSON.stringify(toolResult.data ?? {});
        if (
          (toolName === 'knowledge:search_knowledge_base' || toolName.endsWith('search_knowledge_base')) &&
          toolResult.success &&
          toolContent.includes('| Content:')
        ) {
          toolContent = STRICT_RAG_PREAMBLE + toolContent;
        }
        const redacted = redactPII(toolContent.slice(0, 8000));
        messages.push({ role: 'tool', tool_call_id: tc.id!, content: redacted.redactedText });
      }
    }
  }

  const outcomeHints = toolObservations
    .map((o) => {
      if (!o.success) return `- ${o.toolName}: FAILED`;
      return `- ${o.toolName}: OK`;
    })
    .join('\n');

  const synthesisPrompt = researchMode
    ? `Research phase only. User request: "${query}"

Tool outcomes:
${outcomeHints}

Output a tight bullet summary (max 6 bullets) of findings **from tools only**. No draft copy, no invented metrics. If a tool failed, say what is missing.`
    : role === 'content'
      ? `Using the tool results above, fulfill the user's content request: "${query}"

Tool outcomes:
${outcomeHints}

Produce **final copy or short guidance** (chat-first: tight, scannable). **Do not** repeat tool names, restate this outcome list, or paste tool output verbatim unless the user asked for raw data. **Do not invent** product facts. One line on publishing/review if relevant.`
      : campaignManager
        ? `Based on the tool results, answer clearly: "${query}"

Tool outcomes:
${outcomeHints}

Follow your system instructions: headline insight → short bullets → one next step. **Do not** repeat tool names or dump the outcome list. Do not invent metrics.
If the user needed long-form copy, the Content Strategist handles drafts — say so in one sentence.
For calendar / approval / budget flows not in your tool list, direct them to the Marketing hub in one line.`
        : `Based on the tool results, answer clearly: "${query}"

Tool outcomes:
${outcomeHints}

Stay under ~200 words. **Do not** repeat tool names or restate the outcome list. Do not invent metrics. Calendar: Marketing hub UI — no AI tool for drag/drop scheduling.`;

  const metricsOnlySynthesis =
    !researchMode &&
    role === 'campaign' &&
    campaignManager &&
    toolObservations.length > 0 &&
    toolObservations.every((o) => {
      const name = resolveRegisteredToolName(o.toolName) ?? o.toolName;
      return o.success && CAMPAIGN_METRICS_ONLY_TOOLS.has(name);
    });

  let synthTier: 'balanced' | 'complex' | 'fast' = 'balanced';
  let synthMaxTokens = 1200;
  if (researchMode) {
    synthTier = 'complex';
    synthMaxTokens = 1200;
  } else if (contentStrategist) {
    synthTier = 'complex';
    synthMaxTokens = 1000;
  } else if (role === 'campaign' && campaignManager) {
    synthTier = metricsOnlySynthesis ? 'fast' : 'complex';
    synthMaxTokens = metricsOnlySynthesis ? 900 : 1100;
  }
  const synth = await withTimeout(
    callModelSafe({
      tier: synthTier,
      messages: [...messages, { role: 'user', content: synthesisPrompt }],
      tenantId: agentContext.tenantId,
      maxTokens: synthMaxTokens,
      temperature: 0.3,
      userQuery: query,
    }),
    stepTimeoutMs,
    'Marketing synthesis',
  );

  const synthContent =
    synth.choices?.[0]?.message?.content?.trim() ||
    "I've gathered marketing data — see above. Let me know if you want a different breakdown.";

  return {
    content: synthContent,
    pendingActions,
    toolObservations,
    toolsUsed,
  };
}

export interface MarketingFlowOptions {
  query: string;
  agentContext: AgentContext;
  doraCtx: DoraRequestContext;
  legacyContext: ToolContext;
  /** Compressed history from orchestrator */
  priorContext?: string;
  /** Recent chat turns for routing */
  history?: Array<{ role: string; content: string }>;
  /** /marketing/agent or client flag */
  forceMarketingContext?: boolean;
  /** Set by v2 pipeline when `body.marketingAgentMode` is true */
  marketingAgentMode?: boolean;
  onStreamChunk?: (text: string) => void;
  onProgress?: (step: ProgressStep) => void;
}

async function loadMarketingContentSnapshot(
  legacyContext: ToolContext,
  contentId: string,
): Promise<{ image_url: string | null; status: string } | null> {
  try {
    const { legacyToolContextToCallerContext } = await import('./marketingAgentOrchestrator.js');
    const caller = legacyToolContextToCallerContext(legacyContext);
    const row = await contentDal.getContentById(caller, contentId);
    if (!row) return null;
    return { image_url: row.image_url ?? null, status: row.status };
  } catch {
    return null;
  }
}

async function loadMarketingImageUrl(
  legacyContext: ToolContext,
  contentId: string | null | undefined,
): Promise<string | null> {
  if (!contentId) return null;
  const snap = await loadMarketingContentSnapshot(legacyContext, contentId);
  return snap?.image_url ?? null;
}

async function persistedContentExtras(
  legacyContext: ToolContext,
  contentResult: ContentWorkflowResult,
): Promise<{
  marketingContentId?: string | null;
  marketingImageUrl?: string | null;
  marketingContentStatus?: string | null;
  marketingContentError?: string | null;
  marketingValidation?: Record<string, unknown>;
}> {
  if (contentResult.status === 'failed' && contentResult.creationError != null) {
    return {
      marketingContentId: null,
      marketingContentStatus: 'error',
      marketingContentError: contentResult.creationError,
    };
  }
  const id =
    contentResult.status === 'completed'
      ? contentResult.contentId
      : contentResult.status === 'failed' && contentResult.contentId
        ? contentResult.contentId
        : null;
  if (!id) return {};
  const snap = await loadMarketingContentSnapshot(legacyContext, id);
  let marketingValidation: Record<string, unknown> | undefined;
  if (contentResult.status === 'completed') {
    marketingValidation = {
      productTruth: {
        passed: contentResult.truth.verdict === 'PASS',
        verdict: contentResult.truth.verdict,
      },
      brandVoice: {
        passed: contentResult.brandVoice.passes,
        score: contentResult.brandVoice.score,
      },
      compliance: {
        passed: contentResult.compliance.verdict === 'PASS',
        verdict: contentResult.compliance.verdict,
      },
    };
  }
  return {
    marketingContentId: id,
    marketingImageUrl: snap?.image_url ?? null,
    marketingContentStatus: snap?.status ?? null,
    marketingValidation,
  };
}

export async function runMarketingSubOrchestratorFlow(opts: MarketingFlowOptions): Promise<{
  content: string;
  pendingActions: PendingActionSSEEvent[];
  toolObservations: ToolObservation[];
  toolsUsed: string[];
  /** Set when persisted content workflow creates/updates a `marketing_content` row */
  marketingContentId?: string | null;
  marketingImageUrl?: string | null;
  /** DB status after workflow (e.g. `in_review`, `draft`) or `error` when creation failed (e.g. RLS) */
  marketingContentStatus?: string | null;
  /** When creation failed (e.g. RLS), short message for the UI */
  marketingContentError?: string | null;
  /** Compact gatekeeper summary when workflow completed */
  marketingValidation?: Record<string, unknown>;
}> {
  const {
    query,
    agentContext,
    doraCtx,
    legacyContext,
    priorContext,
    history = [],
    forceMarketingContext = false,
    onStreamChunk,
    onProgress,
  } = opts;

  const applyLucyPersona =
    isLucyPersonaEnabled() &&
    (forceMarketingContext === true || opts.marketingAgentMode === true);

  return withTimeout(
    (async () => {
      console.log('[DIAG] runMarketingSubOrchestratorFlow called', {
        marketingAgentMode: opts.marketingAgentMode ?? false,
        route: '(pending)',
      });

      onProgress?.({ phase: 'routing', label: 'Routing your request…', step: 1, maxSteps: 5, status: 'active' });

      const { route, plan } = await resolveMarketingRouteWithPlanner(
        query,
        history,
        priorContext,
        agentContext,
        doraCtx,
        legacyContext,
        forceMarketingContext,
        applyLucyPersona,
      );

      onProgress?.({ phase: 'routing', label: 'Routing your request…', step: 1, maxSteps: 5, status: 'completed' });

      const { inferMarketingContentChannel } = await import('./marketingAgentOrchestrator.js');
      const channelInferred = inferMarketingContentChannel(query);
      console.log('[DIAG] Sub-orchestrator routing result:', { route: route.route, channel: channelInferred });

      if (route.route === 'CLARIFY') {
        const q = route.clarifyQuestion?.trim() || 'Could you share a bit more about what you want to achieve?';
        onStreamChunk?.(q);
        return { content: q, pendingActions: [], toolObservations: [], toolsUsed: [] };
      }

      if (route.route === 'NOT_MARKETING') {
        const msg =
          route.notMarketingMessage?.trim() ||
          'That sounds outside marketing. Open **Dora** from the sidebar for finance, HR, projects, and other workspace help.';
        onStreamChunk?.(msg);
        return { content: msg, pendingActions: [], toolObservations: [], toolsUsed: [] };
      }

      let note = route.campaignContextNote ? `Note: ${route.campaignContextNote}\n\n` : '';
      const allPending: PendingActionSSEEvent[] = [];
      const allObs: ToolObservation[] = [];
      const allTools: string[] = [];
      let combined = '';

      onProgress?.({ phase: 'brand_context', label: 'Loading brand context…', step: 2, maxSteps: 5, status: 'active' });

      if (plan && planRequiresResearchPhase(plan)) {
        const mergedCtx: ToolContext = {
          ...legacyContext,
          organizationId: legacyContext.organizationId ?? agentContext.organizationId ?? undefined,
        };
        const researchSystem = applyLucyPersona
          ? wrapSpecialistSystemPromptWithLucy(RESEARCH_PHASE_SYSTEM, {
              route: route.route,
              channelInferred,
              query: note + query,
            })
          : RESEARCH_PHASE_SYSTEM;
        const research = await runMarketingMiniLoop({
          role: 'content',
          systemPrompt: researchSystem,
          toolNames: RESEARCH_TOOL_NAMES,
          query: note + query,
          agentContext,
          doraCtx,
          legacyContext: mergedCtx,
          researchMode: true,
        });
        allPending.push(...research.pendingActions);
        allObs.push(...research.toolObservations);
        allTools.push(...research.toolsUsed);
        note += `Research phase (strategy-first):\n${research.content}\n\n`;
      }

      const runContent = async (userQuery: string, priorBlock?: string) => {
        const mergedCtx: ToolContext = {
          ...legacyContext,
          organizationId: legacyContext.organizationId ?? agentContext.organizationId ?? undefined,
        };
        const orgId = await resolveOrgIdForTool(mergedCtx);
        const { productTruthMd, brandVoiceMd } = await loadMarketingTruthBrandLayers(orgId);

        let calibrationText = '';
        if (orgId) {
          try {
            const calibration = await resolveCalibrationPrompt(orgId, channelInferred, undefined);
            calibrationText = calibration.text;
          } catch (err) {
            console.warn('[marketingAgentFlow] Calibration resolve failed, continuing without:', err);
          }
        }

        // CONTENT_STRATEGIST rules (Messign positioning, Instagram hashtags / pattern interrupt): `marketingContentStrategistPrompt.ts`
        const contentBase = buildMarketingContentStrategistPrompt({
          userRole: agentContext.userRole,
          productTruthMd,
          brandVoiceMd,
          channel: channelInferred,
          calibrationText,
        });
        const systemPrompt = applyLucyPersona
          ? wrapSpecialistSystemPromptWithLucy(contentBase, {
              route: route.route,
              channelInferred,
              query: note + userQuery,
            })
          : contentBase;
        const r = await runMarketingMiniLoop({
          role: 'content',
          systemPrompt,
          toolNames: CONTENT_TOOL_NAMES,
          query: note + userQuery,
          agentContext,
          doraCtx,
          legacyContext,
          priorBlock,
          contentStrategist: true,
        });
        allPending.push(...r.pendingActions);
        allObs.push(...r.toolObservations);
        allTools.push(...r.toolsUsed);
        return r.content;
      };

      const runCampaign = async (userQuery: string, priorBlock?: string) => {
        const campaignBase = buildMarketingCampaignManagerPrompt({ userRole: agentContext.userRole });
        const systemPrompt = applyLucyPersona
          ? wrapSpecialistSystemPromptWithLucy(campaignBase, {
              route: route.route,
              channelInferred,
              query: note + userQuery,
            })
          : campaignBase;
        const r = await runMarketingMiniLoop({
          role: 'campaign',
          systemPrompt,
          toolNames: CAMPAIGN_TOOL_NAMES,
          query: note + userQuery,
          agentContext,
          doraCtx,
          legacyContext,
          priorBlock,
          campaignManager: true,
        });
        allPending.push(...r.pendingActions);
        allObs.push(...r.toolObservations);
        allTools.push(...r.toolsUsed);
        return r.content;
      };

      onProgress?.({ phase: 'brand_context', label: 'Loading brand context…', step: 2, maxSteps: 5, status: 'completed' });

      if (route.route === 'CONTENT_STRATEGIST') {
        console.log('[DIAG] CONTENT_STRATEGIST route entered');
        const mo = await import('./marketingAgentOrchestrator.js');
        const orchCtx: MarketingOrchestrationContext = {
          agentContext,
          doraCtx,
          legacyContext,
          priorContext,
          history,
          forceMarketingContext,
          applyLucyPersona,
          marketingRoute: route.route,
          onStreamChunk,
          onProgress,
        };
        const ch = mo.inferMarketingContentChannel(note + query);
        const ct = mo.contentTypeForMarketingChannel(ch);
        console.log('[DIAG] executeContentWorkflow called', { contentId: undefined, channel: ch });
        const contentResult = await mo.executeContentWorkflow(
          {
            userQuery: note + query,
            title: undefined,
            channel: ch,
            contentType: ct,
          },
          orchCtx,
        );
        allObs.push(...contentResult.toolObservations);
        allTools.push(...contentResult.toolsUsed);
        const extras = await persistedContentExtras(legacyContext, contentResult);
        if (contentResult.status === 'completed') {
          combined = contentResult.draft;
          onStreamChunk?.(combined);
          return {
            content: combined,
            pendingActions: allPending,
            toolObservations: allObs,
            toolsUsed: allTools,
            ...extras,
          };
        }
        combined = (contentResult.lastDraft?.trim() || contentResult.reason).trim();
        onStreamChunk?.(combined);
        return {
          content: combined,
          pendingActions: allPending,
          toolObservations: allObs,
          toolsUsed: allTools,
          ...extras,
        };
      }

      if (route.route === 'CAMPAIGN_MANAGER') {
        console.log('[DIAG] Skipping executeContentWorkflow — path:', {
          route: route.route,
          channel: inferMarketingContentChannel(note + query),
        });
        combined = await runCampaign(query);
        onStreamChunk?.(combined);
        return { content: combined, pendingActions: allPending, toolObservations: allObs, toolsUsed: allTools };
      }

      // BOTH_CAMPAIGN_THEN_CONTENT — campaign step is informational; failure must not block content creation.
      let campaignContext =
        '(Campaign analysis was unavailable. Proceed with content creation using available context.)';
      let campaignPartForCombined = campaignContext;
      try {
        const campaignPart = await runCampaign(query);
        onStreamChunk?.(campaignPart);
        campaignPartForCombined =
          typeof campaignPart === 'string' ? campaignPart : JSON.stringify(campaignPart ?? {});
        campaignContext = campaignPartForCombined;
        console.log('[BOTH] Campaign analysis succeeded');
      } catch (campaignErr: unknown) {
        const msg = campaignErr instanceof Error ? campaignErr.message : String(campaignErr);
        console.warn('[BOTH] Campaign analysis failed (non-blocking):', msg);
      }

      const moBoth = await import('./marketingAgentOrchestrator.js');
      const orchCtxBoth: MarketingOrchestrationContext = {
        agentContext,
        doraCtx,
        legacyContext,
        priorContext,
        history,
        forceMarketingContext,
        applyLucyPersona,
        marketingRoute: route.route,
        onStreamChunk,
        onProgress,
      };
      const chBoth = moBoth.inferMarketingContentChannel(note + query);
      const ctBoth = moBoth.contentTypeForMarketingChannel(chBoth);
      console.log('[DIAG] executeContentWorkflow called', { contentId: undefined, channel: chBoth });
      const contentResult = await moBoth.executeContentWorkflow(
        {
          userQuery: `${note + query}\n\nContext from campaign planning:\n${campaignContext}`,
          title: undefined,
          channel: chBoth,
          contentType: ctBoth,
        },
        orchCtxBoth,
      );
      allObs.push(...contentResult.toolObservations);
      allTools.push(...contentResult.toolsUsed);
      const extrasBoth = await persistedContentExtras(legacyContext, contentResult);
      if (contentResult.status === 'completed') {
        combined = `${campaignPartForCombined}\n\n${contentResult.draft}`;
        onStreamChunk?.(`\n\n${contentResult.draft}`);
        return {
          content: combined,
          pendingActions: allPending,
          toolObservations: allObs,
          toolsUsed: allTools,
          ...extrasBoth,
        };
      }
      const failPart = (contentResult.lastDraft?.trim() || contentResult.reason).trim();
      combined = `${campaignPartForCombined}\n\n${failPart}`;
      onStreamChunk?.(`\n\n${failPart}`);
      return {
        content: combined,
        pendingActions: allPending,
        toolObservations: allObs,
        toolsUsed: allTools,
        ...extrasBoth,
      };
    })(),
    TOTAL_MS,
    'Marketing flow',
  ).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[marketingAgentFlow]', msg);
    if (err instanceof Error && err.stack) {
      console.error('[marketingAgentFlow] stack:', err.stack);
    }
    return {
      content:
        'The marketing assistant timed out or hit an error. Please try again with a shorter question, or check LiteLLM and API keys.',
      pendingActions: [] as PendingActionSSEEvent[],
      toolObservations: [] as ToolObservation[],
      toolsUsed: [] as string[],
      marketingContentId: null,
      marketingContentStatus: 'error',
      marketingContentError: msg.slice(0, 200),
    };
  });
}

/** Build v1-style AgentContext from Dora v2 pipeline context (for shared marketing flow). */
export function buildAgentContextFromV2(ctx: DoraContext, legacy: ToolContext): AgentContext {
  const roles = [
    ctx.userRole,
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
    tenantId: ctx.organizationId,
    userId: ctx.userId,
    userRoles: roles,
    userName: ctx.userName,
    userRole: ctx.userRole,
    conversationId: ctx.sessionId,
    currentPage: ctx.pagePath,
    currentModule: ctx.doraRequest.page.currentModule,
    todayDate: ctx.today,
    conciseMode: ctx.concise,
    organizationId: ctx.organizationId,
    department: ctx.department ?? '',
    teamId: ctx.teamId ?? null,
    doraCtx: ctx.doraRequest,
    legacyContext: legacy,
  };
}
