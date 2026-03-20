/**
 * Marketing V2 Strategy Planner — complex-tier plan emission before sub-orchestrator routing.
 * Internal-only: plan JSON is not streamed to the client in this phase.
 */
import type OpenAI from 'openai';
import { callModelSafe } from '../gateway.js';
import type { AgentContext } from '../agents/types.js';
import type { DoraRequestContext } from '../dora/types.js';
import type { ToolContext } from '../types.js';
import {
  buildMarketingStrategyPlannerSystemPrompt,
} from '../../../modules/marketing/prompts/v2/marketingStrategyPlannerPrompt.js';
import {
  parseMarketingStrategyExecutionPlan,
  type MarketingStrategyExecutionPlan,
} from '../../../modules/marketing/prompts/v2/strategyExecutionPlan.js';
import type { MarketingRouteKind, ParsedMarketingRoute } from './marketingRouteTypes.js';

export const EMIT_STRATEGY_PLAN_TOOL_NAME = 'emit_marketing_strategy_plan';

const STRATEGY_PLAN_ROUTING_ENUM = [
  'CONTENT_STRATEGIST',
  'CAMPAIGN_MANAGER',
  'CREATIVE_DIRECTOR',
  'ANALYTICS_AGENT',
  'BOTH_CAMPAIGN_THEN_CONTENT',
  'CLARIFY',
  'NOT_MARKETING',
] as const;

/** OpenAI tool: single structured plan (matches Zod marketingStrategyExecutionPlanSchema). */
export const emitMarketingStrategyPlanTool: OpenAI.ChatCompletionTool = {
  type: 'function',
  function: {
    name: EMIT_STRATEGY_PLAN_TOOL_NAME,
    description:
      'Emit exactly one structured marketing execution plan. Call once. Do not draft user-facing copy in free text.',
    parameters: {
      type: 'object',
      properties: {
        routing: {
          type: 'string',
          enum: [...STRATEGY_PLAN_ROUTING_ENUM],
          description: 'Which specialist pipeline(s) to run.',
        },
        confidence: { type: 'integer', minimum: 0, maximum: 100, description: 'Plan confidence 0-100.' },
        steps: {
          type: 'array',
          description: 'Ordered execution steps with goals and constraints.',
            items: {
            type: 'object',
            properties: {
              step_kind: {
                type: 'string',
                enum: ['research', 'draft', 'measure'],
                description: 'research = gather data before copy; draft = create assets; measure = analyze results',
              },
              agent: { type: 'string', description: 'agent key e.g. content_strategist' },
              goal: { type: 'string' },
              constraints: { type: 'array', items: { type: 'string' } },
              tools_allowed: { type: 'array', items: { type: 'string' } },
              memory_refs: { type: 'array', items: { type: 'string' } },
            },
            required: ['agent', 'goal'],
          },
        },
        estimated_impact: { type: 'string' },
        hitl_required: { type: 'boolean', description: 'Whether writes need human approval.' },
        clarification_question: {
          type: 'string',
          description: 'If routing is CLARIFY: one specific question.',
        },
        not_marketing_message: {
          type: 'string',
          description: 'If routing is NOT_MARKETING: brief redirect to general Dora.',
        },
      },
      required: ['routing', 'confidence', 'hitl_required'],
    },
  },
};

const PLANNER_STEP_MS = 14_000;

/** If true, caller should use legacy runMarketingRouteDecision instead. */
export function plannerShouldFallbackToLegacyRouter(plan: MarketingStrategyExecutionPlan): boolean {
  return plan.confidence < 60 && plan.routing !== 'CLARIFY';
}

function formatPlannerStepsNote(plan: MarketingStrategyExecutionPlan): string | undefined {
  if (!plan.steps.length) return undefined;
  const lines = plan.steps.map((s, i) => {
    const c = s.constraints?.length ? ` Constraints: ${s.constraints.join('; ')}` : '';
    return `${i + 1}. [${s.agent}] ${s.goal}${c}`;
  });
  return `Strategy plan:\n${lines.join('\n')}`;
}

/**
 * Maps V2 planner routing to existing sub-orchestrator routes.
 * CREATIVE_DIRECTOR → CONTENT_STRATEGIST; ANALYTICS_AGENT → CAMPAIGN_MANAGER.
 */
export function mapStrategyPlanToParsedRoute(plan: MarketingStrategyExecutionPlan): ParsedMarketingRoute {
  let route: MarketingRouteKind;
  let prefix = '';

  if (plan.routing === 'CREATIVE_DIRECTOR') {
    route = 'CONTENT_STRATEGIST';
    prefix = '(Planner: Creative Director) ';
  } else if (plan.routing === 'ANALYTICS_AGENT') {
    route = 'CAMPAIGN_MANAGER';
    prefix = '(Planner: Analytics) ';
  } else {
    route = plan.routing;
  }

  const stepNote = formatPlannerStepsNote(plan);
  const mergedNote = [prefix.trim() || undefined, stepNote].filter(Boolean).join('\n\n');

  return {
    route,
    clarifyQuestion: plan.clarification_question?.trim(),
    notMarketingMessage: plan.not_marketing_message?.trim(),
    campaignContextNote: mergedNote || undefined,
  };
}

export function parseEmitStrategyPlanFromMessage(
  message: OpenAI.ChatCompletionMessage | null | undefined,
): MarketingStrategyExecutionPlan | null {
  const toolCalls = message?.tool_calls;
  if (!toolCalls?.length) return null;
  const tc = toolCalls.find(
    (t): t is OpenAI.ChatCompletionMessageToolCall & { type: 'function'; function: { name: string; arguments: string } } =>
      t.type === 'function' && 'function' in t && t.function?.name === EMIT_STRATEGY_PLAN_TOOL_NAME,
  );
  if (!tc) return null;
  let args: unknown = {};
  try {
    args = JSON.parse(tc.function.arguments || '{}');
  } catch {
    return null;
  }
  try {
    return parseMarketingStrategyExecutionPlan(args);
  } catch {
    return null;
  }
}

function buildPlannerPromptInput(
  agentContext: AgentContext,
  doraCtx: DoraRequestContext,
  legacyContext: ToolContext,
): Parameters<typeof buildMarketingStrategyPlannerSystemPrompt>[0] {
  const orgId =
    legacyContext.organizationId ?? agentContext.organizationId ?? doraCtx.user.organizationId ?? '(unknown)';
  const path = doraCtx.page?.currentPath ?? agentContext.currentPage ?? '';
  const campaignId =
    doraCtx.page.activeFilters?.campaignId ??
    (doraCtx.page.activeView?.entityType === 'campaign' ? doraCtx.page.activeView?.entityId : undefined);

  const classifiedIntent = {
    domain: 'marketing' as const,
    action_type: 'user_chat',
    entities: [] as string[],
    urgency: 'normal' as const,
  };

  const context = {
    org_id: orgId,
    user_role: agentContext.userRole,
    current_path: path,
    ...(campaignId ? { selected_campaign_id: campaignId } : {}),
  };

  return {
    classifiedIntentSummary: JSON.stringify(classifiedIntent),
    contextSummary: JSON.stringify(context),
    memoryContext: '',
    dashboardSnapshot: '',
  };
}

export type MarketingStrategyPlannerStepResult =
  | { ok: true; plan: MarketingStrategyExecutionPlan }
  | { ok: false; reason: 'parse' | 'timeout' | 'error' };

/**
 * Single complex-tier call with forced tool; returns parsed plan or failure (caller falls back to legacy router).
 */
export async function runMarketingStrategyPlannerStep(
  query: string,
  history: Array<{ role: string; content: string }>,
  priorContext: string | undefined,
  agentContext: AgentContext,
  doraCtx: DoraRequestContext,
  legacyContext: ToolContext,
): Promise<MarketingStrategyPlannerStepResult> {
  const promptInput = buildPlannerPromptInput(agentContext, doraCtx, legacyContext);
  const system = buildMarketingStrategyPlannerSystemPrompt(promptInput);

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
    content: `User request (verbatim):\n${query}\n\nCall ${EMIT_STRATEGY_PLAN_TOOL_NAME} once with your execution plan JSON.`,
  });

  try {
    const response = await Promise.race([
      callModelSafe({
        tier: 'complex',
        messages,
        tools: [emitMarketingStrategyPlanTool],
        toolChoice: { type: 'function', function: { name: EMIT_STRATEGY_PLAN_TOOL_NAME } },
        tenantId: agentContext.tenantId,
        maxTokens: 1200,
        temperature: 0.1,
        userQuery: query,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Marketing strategy planner timeout')), PLANNER_STEP_MS),
      ),
    ]);

    const parsed = parseEmitStrategyPlanFromMessage(response.choices?.[0]?.message);
    if (parsed) return { ok: true, plan: parsed };
    return { ok: false, reason: 'parse' };
  } catch (e) {
    console.warn('[marketing strategy planner]', e instanceof Error ? e.message : e);
    return { ok: false, reason: 'error' };
  }
}
