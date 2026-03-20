/**
 * Marketing multi-agent orchestration: routing, Content Strategist + gatekeeper loop,
 * Campaign Manager with HITL pause, and approval-queue handoff.
 *
 * Composes {@link runMarketingRouteDecision} and {@link runMarketingMiniLoop} from
 * `marketingAgentFlow.ts` with explicit validation (Zod), retries, and telemetry.
 */
import { z } from 'zod';
import type { AgentContext, ToolObservation } from '../agents/types.js';
import type { DoraRequestContext } from '../dora/types.js';
import type { ToolContext } from '../types.js';
import type { PendingActionSSEEvent } from '../actions/types.js';
import type { CallerContext } from '../../../dal/types.js';
import * as contentDal from '../../../dal/marketing/content.js';
import { assignApproval } from '../../../controllers/marketingToolsController.js';
import { loadMarketingTruthBrandLayers } from '../../../dal/marketing/truthBrand.js';
import { resolveOrgIdForTool } from '../tools/resolveOrgIdForTool.js';
import { buildMarketingContentStrategistPrompt } from '../../../modules/marketing/prompts/marketingContentStrategistPrompt.js';
import { buildMarketingCampaignManagerPrompt } from '../../../modules/marketing/prompts/marketingCampaignManagerPrompt.js';
import {
  CAMPAIGN_TOOL_NAMES,
  CONTENT_TOOL_NAMES,
  marketingFlowSubagentOrder,
  parseMarketingRouteFromMessage,
  runMarketingMiniLoop,
  runMarketingRouteDecision,
  type MarketingRouteKind,
  type ParsedMarketingRoute,
} from './marketingAgentFlow.js';
import { runProductTruthValidation, type ProductTruthValidationResult } from './productTruthValidator.js';
import { runBrandVoiceCheck, type BrandVoiceCheckResult } from './brandVoiceChecker.js';
import { runComplianceScan, type ComplianceScanResult } from './complianceScanner.js';

const LOG = '[marketingOrchestrator]';

function log(step: string, detail?: Record<string, unknown>): void {
  if (detail) {
    console.log(`${LOG} ${step}`, detail);
  } else {
    console.log(`${LOG} ${step}`);
  }
}

/** Map legacy tool role strings to CallerContext.role for DAL / controllers */
export function legacyToolContextToCallerContext(legacy: ToolContext): CallerContext {
  const ur = (legacy.userRole || 'employee').toLowerCase();
  const role: CallerContext['role'] =
    ur === 'admin' || ur === 'system_admin'
      ? 'system_admin'
      : ur === 'finance' || ur === 'finance_admin'
        ? 'finance_admin'
        : ur === 'manager' || ur === 'dept_head' || ur === 'cpo'
          ? 'manager'
          : 'employee';
  return {
    userId: legacy.userId,
    role,
    organizationId: legacy.organizationId,
  };
}

// ── Zod: gatekeeper outputs (after existing parsers) — fail closed on bad shape ──

const productTruthParsedSchema = z
  .object({
    verdict: z.enum(['PASS', 'FAIL']),
    failed_reasons: z.array(z.string()),
  })
  .passthrough();

const brandVoiceParsedSchema = z
  .object({
    score: z.number(),
    passes: z.boolean(),
  })
  .passthrough();

const complianceParsedSchema = z
  .object({
    verdict: z.enum(['PASS', 'WARNING']),
    warnings: z.array(z.unknown()),
  })
  .passthrough();

function validateGatekeeperResult<T>(
  label: 'product_truth' | 'brand_voice' | 'compliance',
  raw: unknown,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): { ok: true; value: T } | { ok: false; error: string } {
  const r = schema.safeParse(raw);
  if (!r.success) {
    const msg = r.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    log(`zod_reject_${label}`, { error: msg });
    return { ok: false, error: msg };
  }
  return { ok: true, value: r.data };
}

export interface MarketingOrchestrationContext {
  agentContext: AgentContext;
  doraCtx: DoraRequestContext;
  legacyContext: ToolContext;
  priorContext?: string;
  history?: Array<{ role: string; content: string }>;
  forceMarketingContext?: boolean;
  onStreamChunk?: (text: string) => void;
}

export interface ContentWorkflowBrief {
  userQuery: string;
  contentId?: string;
  title?: string;
  contentType?: string;
  channel?: string;
  campaignId?: string;
  /** Max generation attempts when Product Truth fails (default 3) */
  maxTruthRetries?: number;
}

export type ContentWorkflowResult =
  | {
      status: 'completed';
      contentId: string;
      draft: string;
      approvalId: string;
      attempts: number;
      truth: ProductTruthValidationResult;
      brandVoice: BrandVoiceCheckResult;
      compliance: ComplianceScanResult;
      toolObservations: ToolObservation[];
      toolsUsed: string[];
    }
  | {
      status: 'failed';
      reason: string;
      attempts: number;
      lastDraft?: string;
      toolObservations: ToolObservation[];
      toolsUsed: string[];
    };

export type CampaignWorkflowResult =
  | {
      status: 'completed';
      message: string;
      pendingActions: PendingActionSSEEvent[];
      toolObservations: ToolObservation[];
      toolsUsed: string[];
    }
  | {
      status: 'awaiting_confirmation';
      message: string;
      pendingActions: PendingActionSSEEvent[];
      toolObservations: ToolObservation[];
      toolsUsed: string[];
    };

export type MarketingOrchestrationRunResult =
  | { kind: 'clarify'; question: string }
  | { kind: 'not_marketing'; message: string }
  | { kind: 'content'; result: ContentWorkflowResult }
  | { kind: 'campaign'; result: CampaignWorkflowResult }
  | {
      kind: 'both';
      campaign: CampaignWorkflowResult;
      /** Only when campaign completed with no pending confirmations */
      content?: ContentWorkflowResult;
      deferredReason?: string;
    };

/**
 * Entry: run Sub-Orchestrator routing (complex tier) on the user message.
 * Re-exported for tests that already use `parseMarketingRouteFromMessage` on raw messages.
 */
export async function routeMarketingRequest(
  userMessage: string,
  ctx: MarketingOrchestrationContext,
): Promise<ParsedMarketingRoute> {
  return runMarketingRouteDecision(
    userMessage,
    ctx.history ?? [],
    ctx.priorContext,
    ctx.agentContext.tenantId,
    ctx.forceMarketingContext ?? false,
  );
}

async function buildContentStrategistLoopArgs(
  ctx: MarketingOrchestrationContext,
  userQuery: string,
  priorBlock?: string,
) {
  const mergedCtx: ToolContext = {
    ...ctx.legacyContext,
    organizationId: ctx.legacyContext.organizationId ?? ctx.agentContext.organizationId ?? undefined,
  };
  const orgId = await resolveOrgIdForTool(mergedCtx);
  const { productTruthMd, brandVoiceMd } = await loadMarketingTruthBrandLayers(orgId);
  const systemPrompt = buildMarketingContentStrategistPrompt({
    userRole: ctx.agentContext.userRole,
    productTruthMd,
    brandVoiceMd,
  });
  return {
    role: 'content' as const,
    systemPrompt,
    toolNames: CONTENT_TOOL_NAMES,
    query: userQuery,
    agentContext: ctx.agentContext,
    doraCtx: ctx.doraCtx,
    legacyContext: ctx.legacyContext,
    priorBlock,
    contentStrategist: true,
  };
}

async function buildCampaignManagerLoopArgs(ctx: MarketingOrchestrationContext, userQuery: string, priorBlock?: string) {
  const systemPrompt = buildMarketingCampaignManagerPrompt({ userRole: ctx.agentContext.userRole });
  return {
    role: 'campaign' as const,
    systemPrompt,
    toolNames: CAMPAIGN_TOOL_NAMES,
    query: userQuery,
    agentContext: ctx.agentContext,
    doraCtx: ctx.doraCtx,
    legacyContext: ctx.legacyContext,
    priorBlock,
    campaignManager: true,
  };
}

/**
 * Content Strategist draft → parallel Groq gatekeepers (fast tier via gateway) →
 * Product Truth retry loop → `assignApproval` when truth passes.
 */
export async function executeContentWorkflow(
  brief: ContentWorkflowBrief,
  ctx: MarketingOrchestrationContext,
): Promise<ContentWorkflowResult> {
  const caller = legacyToolContextToCallerContext(ctx.legacyContext);
  const orgId = caller.organizationId;
  if (!orgId) {
    return {
      status: 'failed',
      reason: 'Missing organization context',
      attempts: 0,
      toolObservations: [],
      toolsUsed: [],
    };
  }

  const maxAttempts = Math.max(1, Math.min(5, brief.maxTruthRetries ?? 3));
  let contentRow =
    brief.contentId != null
      ? await contentDal.getContentById(caller, brief.contentId)
      : null;

  if (!contentRow && brief.contentId) {
    return {
      status: 'failed',
      reason: 'Content not found',
      attempts: 0,
      toolObservations: [],
      toolsUsed: [],
    };
  }

  if (!contentRow) {
    log('content_create', { title: brief.title ?? 'AI draft' });
    contentRow = await contentDal.createContent(caller, {
      title: (brief.title ?? 'AI draft').slice(0, 500),
      content_type: brief.contentType ?? 'social_post',
      channel: brief.channel ?? 'email',
      campaign_id: brief.campaignId,
      status: 'draft',
      body: '',
    });
  }

  const contentId = contentRow.id;
  const tenantId = ctx.agentContext.tenantId;
  const combinedToolObs: ToolObservation[] = [];
  const combinedTools: string[] = [];

  let lastDraft = '';
  let lastTruth: ProductTruthValidationResult | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const revisionPrefix =
      attempt > 0 && lastTruth?.verdict === 'FAIL'
        ? `Your previous draft failed product truth validation. Reasons:\n${lastTruth.failed_reasons.map((r) => `- ${r}`).join('\n')}\n\nRevise the draft to fix these issues. Stay factual and aligned with product truth.\n\n---\n\n`
        : '';

    const userQuery = revisionPrefix + brief.userQuery;

    log('content_generation_attempt', { attempt: attempt + 1, maxAttempts, contentId });

    const loopArgs = await buildContentStrategistLoopArgs(ctx, userQuery);
    const mini = await runMarketingMiniLoop(loopArgs);
    combinedToolObs.push(...mini.toolObservations);
    combinedTools.push(...mini.toolsUsed);

    const draft = mini.content.trim();
    lastDraft = draft;
    if (!draft) {
      log('content_generation_empty', { attempt });
      return {
        status: 'failed',
        reason: 'Content Strategist returned an empty draft',
        attempts: attempt + 1,
        lastDraft,
        toolObservations: combinedToolObs,
        toolsUsed: combinedTools,
      };
    }

    await contentDal.updateContent(caller, contentId, {
      body: draft,
      title: brief.title ?? contentRow.title,
      channel: brief.channel ?? contentRow.channel ?? undefined,
    });

    log('run_gatekeepers_parallel', { contentId, attempt: attempt + 1 });
    const [truthRaw, brandRaw, compRaw] = await Promise.all([
      runProductTruthValidation({
        organizationId: orgId,
        contentText: draft,
        tenantId,
        userQuery: `orchestrator_product_truth_${contentId}`,
      }),
      runBrandVoiceCheck({
        organizationId: orgId,
        contentText: draft,
        tenantId,
        userQuery: `orchestrator_brand_${contentId}`,
      }),
      runComplianceScan({
        organizationId: orgId,
        contentText: draft,
        tenantId,
        contentType: brief.contentType ?? contentRow.content_type ?? 'social_post',
        targetChannel: brief.channel ?? contentRow.channel ?? 'email',
        userQuery: `orchestrator_compliance_${contentId}`,
      }),
    ]);

    const tv = validateGatekeeperResult('product_truth', truthRaw, productTruthParsedSchema);
    const bv = validateGatekeeperResult('brand_voice', brandRaw, brandVoiceParsedSchema);
    const cv = validateGatekeeperResult('compliance', compRaw, complianceParsedSchema);

    if (!tv.ok || !bv.ok || !cv.ok) {
      const err = [!tv.ok ? tv.error : '', !bv.ok ? bv.error : '', !cv.ok ? cv.error : ''].filter(Boolean).join(' | ');
      log('gatekeeper_zod_failed', { err });
      return {
        status: 'failed',
        reason: `Validator output failed schema check: ${err}`,
        attempts: attempt + 1,
        lastDraft,
        toolObservations: combinedToolObs,
        toolsUsed: combinedTools,
      };
    }

    lastTruth = truthRaw;

    if (truthRaw.verdict === 'FAIL') {
      log('product_truth_fail', {
        attempt: attempt + 1,
        failed_reasons: truthRaw.failed_reasons,
      });
      if (attempt + 1 >= maxAttempts) {
        return {
          status: 'failed',
          reason: `Product truth still failing after ${maxAttempts} attempts: ${truthRaw.failed_reasons.join('; ')}`,
          attempts: attempt + 1,
          lastDraft,
          toolObservations: combinedToolObs,
          toolsUsed: combinedTools,
        };
      }
      continue;
    }

    log('product_truth_pass', { attempt: attempt + 1 });
    const approvalPayload = {
      content_id: contentId,
      validation_scores: {
        truth_validation: truthRaw as unknown as Record<string, unknown>,
        brand_voice_check: brandRaw as unknown as Record<string, unknown>,
        compliance_scan: compRaw as unknown as Record<string, unknown>,
      },
    };

    const assigned = await assignApproval(caller, approvalPayload);
    if (!assigned.ok) {
      log('assign_approval_failed', { error: assigned.error });
      return {
        status: 'failed',
        reason: assigned.error,
        attempts: attempt + 1,
        lastDraft,
        toolObservations: combinedToolObs,
        toolsUsed: combinedTools,
      };
    }

    log('assign_approval_ok', { approvalId: assigned.data.approval_id, contentId });
    return {
      status: 'completed',
      contentId,
      draft,
      approvalId: assigned.data.approval_id,
      attempts: attempt + 1,
      truth: truthRaw,
      brandVoice: brandRaw,
      compliance: compRaw,
      toolObservations: combinedToolObs,
      toolsUsed: combinedTools,
    };
  }

  throw new Error(`${LOG} content workflow exited without result (bug)`);
}

/**
 * Campaign Manager: tool loop with synthesis; if any write is intercepted for HITL,
 * returns `awaiting_confirmation` so the client can show approval cards before continuing.
 */
export async function executeCampaignWorkflow(
  request: string,
  ctx: MarketingOrchestrationContext,
): Promise<CampaignWorkflowResult> {
  log('campaign_workflow_start', {});
  const loopArgs = await buildCampaignManagerLoopArgs(ctx, request);
  const mini = await runMarketingMiniLoop(loopArgs);
  const pending = mini.pendingActions ?? [];

  if (pending.length > 0) {
    log('campaign_hitl_pause', { pendingCount: pending.length });
    return {
      status: 'awaiting_confirmation',
      message: mini.content,
      pendingActions: pending,
      toolObservations: mini.toolObservations,
      toolsUsed: mini.toolsUsed,
    };
  }

  log('campaign_workflow_complete', { tools: mini.toolsUsed.length });
  return {
    status: 'completed',
    message: mini.content,
    pendingActions: [],
    toolObservations: mini.toolObservations,
    toolsUsed: mini.toolsUsed,
  };
}

/**
 * Full lifecycle: route → campaign / content / both with campaign-first ordering and
 * optional content step after campaign when no pending confirmations block it.
 */
export async function runMarketingOrchestration(
  userMessage: string,
  ctx: MarketingOrchestrationContext,
): Promise<MarketingOrchestrationRunResult> {
  const route = await routeMarketingRequest(userMessage, ctx);
  log('route_decision', { route: route.route });

  if (route.route === 'CLARIFY') {
    const q = route.clarifyQuestion?.trim() || 'Could you share a bit more about what you want to achieve?';
    ctx.onStreamChunk?.(q);
    return { kind: 'clarify', question: q };
  }

  if (route.route === 'NOT_MARKETING') {
    const msg =
      route.notMarketingMessage?.trim() ||
      'That sounds outside marketing. Open **Dora** from the sidebar for finance, HR, projects, and other workspace help.';
    ctx.onStreamChunk?.(msg);
    return { kind: 'not_marketing', message: msg };
  }

  const note = route.campaignContextNote ? `Note: ${route.campaignContextNote}\n\n` : '';
  const brief: ContentWorkflowBrief = {
    userQuery: note + userMessage,
    title: undefined,
  };

  const order = marketingFlowSubagentOrder(route.route as MarketingRouteKind);

  if (order.length === 0) {
    return { kind: 'not_marketing', message: 'Unexpected route — no sub-agent to run.' };
  }

  let campaignResult: CampaignWorkflowResult | undefined;
  let contentResult: ContentWorkflowResult | undefined;
  let deferredReason: string | undefined;

  for (const step of order) {
    if (step === 'campaign') {
      campaignResult = await executeCampaignWorkflow(note + userMessage, ctx);
      ctx.onStreamChunk?.(campaignResult.message);
      if (campaignResult.status === 'awaiting_confirmation') {
        deferredReason =
          'Campaign step proposed actions that need user confirmation; content generation was not started.';
        log('orchestration_defer_content', { reason: deferredReason });
        return {
          kind: 'both',
          campaign: campaignResult,
          ...(contentResult ? { content: contentResult } : {}),
          deferredReason,
        };
      }
    }
    if (step === 'content') {
      const prior =
        campaignResult?.status === 'completed'
          ? campaignResult.message
          : campaignResult?.message;
      const briefWithPrior: ContentWorkflowBrief = {
        ...brief,
        userQuery: prior ? `${brief.userQuery}\n\nContext from campaign planning:\n${prior}` : brief.userQuery,
      };
      contentResult = await executeContentWorkflow(briefWithPrior, ctx);
      if (contentResult.status === 'completed') {
        ctx.onStreamChunk?.(`\n\n${contentResult.draft.slice(0, 2000)}`);
      }
    }
  }

  if (route.route === 'CONTENT_STRATEGIST' && contentResult) {
    return { kind: 'content', result: contentResult };
  }
  if (route.route === 'CAMPAIGN_MANAGER' && campaignResult) {
    return { kind: 'campaign', result: campaignResult };
  }

  if (route.route === 'BOTH_CAMPAIGN_THEN_CONTENT' && campaignResult) {
    return {
      kind: 'both',
      campaign: campaignResult,
      ...(contentResult ? { content: contentResult } : {}),
      ...(deferredReason ? { deferredReason } : {}),
    };
  }

  return { kind: 'not_marketing', message: 'Orchestration finished without a result.' };
}

export { parseMarketingRouteFromMessage, marketingFlowSubagentOrder };
