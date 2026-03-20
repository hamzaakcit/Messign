/**
 * Legacy JSON-router marketing orchestrator (tests + experiments only).
 *
 * Uses complex-tier LLM JSON output ({@link generateResponse}) then stub
 * campaign/content workflows. **Production** marketing chat uses
 * {@link runMarketingSubOrchestratorFlow} in `marketingAgentFlow.ts` and
 * {@link runMarketingOrchestration} / {@link executeContentWorkflow} in
 * `marketingAgentOrchestrator.ts` — not this module.
 */
import { z } from 'zod';
import { generateResponse, LLMGatewayError, LLM_TIER } from '../llmGateway.js';
import { MARKETING_SUB_ORCHESTRATOR_JSON_SYSTEM_PROMPT } from '../../../modules/marketing/prompts/marketingSubOrchestratorJsonPrompt.js';

const LOG = '[marketingJsonRouter]';

/** Routes returned by the sub-orchestrator LLM (Zod + switchboard). */
export const marketingRouteEnum = z.enum(['CONTENT_STRATEGIST', 'CAMPAIGN_MANAGER', 'BOTH', 'NONE']);
export type MarketingRouteEnum = z.infer<typeof marketingRouteEnum>;

/**
 * Strict schema for the Sub-Orchestrator JSON output (programmatic routing).
 */
export const marketingRouteOutputSchema = z.object({
  route: marketingRouteEnum,
  reasoning: z.string(),
  extracted_parameters: z.record(z.unknown()).default({}),
});

export type MarketingRouteOutput = z.infer<typeof marketingRouteOutputSchema>;

export interface CampaignWorkflowStubResult {
  campaignId: string;
  /** Passed into the content step when route is BOTH */
  contextSummary: string;
}

export interface ContentWorkflowStubResult {
  status: 'stub_completed';
  receivedCampaignId?: string;
  extractedSnapshot: Record<string, unknown>;
}

export interface MarketingOrchestratorResult {
  success: boolean;
  route: MarketingRouteEnum;
  reasoning: string;
  extracted_parameters: Record<string, unknown>;
  /** When route is NONE, or on safe fallback */
  assistantMessage?: string;
  campaign?: CampaignWorkflowStubResult;
  content?: ContentWorkflowStubResult;
  /** Set when success is false (timeout, malformed JSON, validation) */
  error?: string;
}

const NONE_FALLBACK_MESSAGE =
  'That request is outside the marketing specialists. Open the main **Dora** assistant from the sidebar for HR, finance, projects, and other workspace help.';

function buildSystemPrompt(workspaceId: string, sessionId: string): string {
  return `${MARKETING_SUB_ORCHESTRATOR_JSON_SYSTEM_PROMPT}

Correlation (do not echo): workspace_id=${workspaceId}, session_id=${sessionId}`;
}

/** Strip optional markdown fences and isolate JSON object text */
function extractJsonObject(text: string): string {
  const t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m;
  const m = t.match(fence);
  if (m?.[1]) return m[1].trim();
  return t;
}

function parseRoutingJson(raw: string): unknown {
  const trimmed = extractJsonObject(raw);
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error('No valid JSON object in model output');
  }
}

/** Stub — real workflows live in {@link marketingAgentOrchestrator.executeCampaignWorkflow}. */
export async function executeCampaignWorkflow(
  extractedParameters: Record<string, unknown>,
): Promise<CampaignWorkflowStubResult> {
  const name =
    typeof extractedParameters.campaign_name === 'string'
      ? extractedParameters.campaign_name
      : 'campaign';
  return {
    campaignId: `stub-${name.replace(/\s+/g, '-').slice(0, 40)}-${Date.now().toString(36)}`,
    contextSummary: 'Stub: campaign planning context for downstream content (use marketingAgentOrchestrator in prod).',
  };
}

/** Stub — real workflows live in {@link marketingAgentOrchestrator.executeContentWorkflow}. */
export async function executeContentWorkflow(
  extractedParameters: Record<string, unknown>,
  options?: { campaign?: CampaignWorkflowStubResult },
): Promise<ContentWorkflowStubResult> {
  return {
    status: 'stub_completed',
    receivedCampaignId: options?.campaign?.campaignId,
    extractedSnapshot: { ...extractedParameters },
  };
}

/** Optional overrides for tests or future DI (defaults to stub exports above). */
export interface MarketingOrchestratorDeps {
  executeCampaignWorkflow?: typeof executeCampaignWorkflow;
  executeContentWorkflow?: typeof executeContentWorkflow;
}

function safeFailure(
  reasoning: string,
  cause: string,
  err?: unknown,
): MarketingOrchestratorResult {
  const msg = err instanceof LLMGatewayError ? err.message : err instanceof Error ? err.message : String(err ?? '');
  console.warn(`${LOG} safe_fallback`, { cause, message: msg });
  return {
    success: false,
    route: 'NONE',
    reasoning,
    extracted_parameters: {},
    assistantMessage: NONE_FALLBACK_MESSAGE,
    error: msg || cause,
  };
}

/**
 * Route a user message via Claude (complex tier) JSON output, then run the switchboard (stub workflows).
 * For production routing, use {@link marketingAgentFlow.runMarketingRouteDecision} / sub-orchestrator flow.
 *
 * @param deps - Optional workflow implementations (e.g. unit tests verifying BOTH ordering).
 */
export async function routeMarketingRequest(
  userMessage: string,
  workspaceId: string,
  sessionId: string,
  deps?: MarketingOrchestratorDeps,
): Promise<MarketingOrchestratorResult> {
  const runCampaign = deps?.executeCampaignWorkflow ?? executeCampaignWorkflow;
  const runContent = deps?.executeContentWorkflow ?? executeContentWorkflow;

  let rawContent: string;
  try {
    const result = await generateResponse({
      tier: LLM_TIER.COMPLEX,
      jsonMode: true,
      tenantId: workspaceId,
      systemPrompt: buildSystemPrompt(workspaceId, sessionId),
      userMessage,
      temperature: 0.2,
      maxTokens: 2048,
    });
    rawContent = result.content;
  } catch (e) {
    if (e instanceof LLMGatewayError && e.code === 'timeout') {
      return safeFailure('LLM request timed out', 'timeout', e);
    }
    return safeFailure('LLM request failed', 'llm_error', e);
  }

  let parsed: unknown;
  try {
    parsed = parseRoutingJson(rawContent);
  } catch (e) {
    return safeFailure('Malformed JSON from router', 'parse_error', e);
  }

  const validated = marketingRouteOutputSchema.safeParse(parsed);
  if (!validated.success) {
    const detail = validated.error.errors.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ');
    return safeFailure('Router output failed validation', 'validation_error', new Error(detail));
  }

  const { route, reasoning, extracted_parameters } = validated.data;

  switch (route) {
    case 'NONE':
      return {
        success: true,
        route: 'NONE',
        reasoning,
        extracted_parameters,
        assistantMessage: NONE_FALLBACK_MESSAGE,
      };

    case 'CONTENT_STRATEGIST': {
      const content = await runContent(extracted_parameters);
      return {
        success: true,
        route: 'CONTENT_STRATEGIST',
        reasoning,
        extracted_parameters,
        content,
      };
    }

    case 'CAMPAIGN_MANAGER': {
      const campaign = await runCampaign(extracted_parameters);
      return {
        success: true,
        route: 'CAMPAIGN_MANAGER',
        reasoning,
        extracted_parameters,
        campaign,
      };
    }

    case 'BOTH': {
      const campaign = await runCampaign(extracted_parameters);
      const content = await runContent(extracted_parameters, { campaign });
      return {
        success: true,
        route: 'BOTH',
        reasoning,
        extracted_parameters,
        campaign,
        content,
      };
    }

    default: {
      const _exhaustive: never = route;
      return safeFailure('Unexpected route', 'validation_error', new Error(String(_exhaustive)));
    }
  }
}
