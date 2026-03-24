import crypto from 'crypto';
import type { Request, Response } from 'express';
import { interceptWriteAction } from '../actions/actionInterceptor.js';
import type { WriteActionType } from '../actions/types.js';
import { inferActConfirmation } from '../actConfirmation.js';
import type { ActConfirmationPayload } from '../actConfirmation.js';
import { classifyIntent } from './classifier/classifyIntent.js';
import { resolveContext, toLegacyToolContext } from './context/resolveContext.js';
import { DoraPipelineError } from './errors.js';
import { executeTool } from '../toolRegistry.js';
import { runAgenticEngine } from './engine/agenticEngine.js';
import { buildPlan } from './planner/buildPlan.js';
import { executeDirectIntent } from './planner/directIntentExecutor.js';
import { selectTools } from './tools/toolSelector.js';
import { StreamController } from './stream/StreamController.js';
import { streamGreeting } from './stream/streamGreeting.js';
import { streamKBSynthesis } from './stream/streamKBSynthesis.js';
import { streamSynthesis } from './stream/streamSynthesis.js';
import type { ExecutionTrace, PipelineRequest, PipelineTelemetry } from './types.js';
import {
  runMarketingSubOrchestratorFlow,
  buildAgentContextFromV2,
} from '../marketing/marketingAgentFlow.js';

function actOfferToTool(
  offer: ActConfirmationPayload,
): { toolName: WriteActionType; args: Record<string, unknown> } | null {
  const q = String(offer.params.query ?? '');
  switch (offer.action) {
    case 'create_invoice':
      return {
        toolName: 'finance:draft_invoice',
        args: {
          client_name: '',
          amount: 0,
          description: q,
          due_date: '',
        },
      };
    case 'create_task':
      return {
        toolName: 'projects:create_task',
        args: {
          title: 'New task',
          description: q,
          project_name: '',
          assignee: 'me',
          priority: 'medium',
          due_date: '',
          mp_reward: 10,
        },
      };
    case 'assign_task':
      return {
        toolName: 'projects:update_task',
        args: {
          task_id: '',
          title: q,
          description: '',
          priority: '',
          status: '',
        },
      };
    default:
      return null;
  }
}

/** Client follow-up after v1-style `pendingConfirmation` — `confirmation: { action, params }`. */
function confirmationToMappedTool(
  confirmation: NonNullable<PipelineRequest['confirmation']>,
): { toolName: WriteActionType; args: Record<string, unknown> } | null {
  const action = confirmation.action;
  if (!action || typeof action !== 'string') return null;
  const params =
    confirmation.params && typeof confirmation.params === 'object'
      ? (confirmation.params as Record<string, unknown>)
      : {};
  return actOfferToTool({
    type: 'confirmation',
    action,
    params,
    message: '',
  });
}

function bearerFromReq(req: Request): string | null {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7) : null;
}

/** Max time before we forcibly close the SSE stream (keeps within Railway/Vercel proxy limits). */
const PIPELINE_TIMEOUT_MS = 55_000;

export async function runDoraPipeline(
  req: Request,
  res: Response,
  body: PipelineRequest,
  auth: { userId: string; role?: string; organizationId: string },
): Promise<void> {
  const controller = new StreamController(res);
  const telemetry: PipelineTelemetry = { startedAt: Date.now(), stages: [] };
  const startedAt = telemetry.startedAt;
  controller.emit('progress', { phase: 'starting', step: 1, maxSteps: 4 });

  let pipelineSettled = false;
  const safetyTimer = setTimeout(() => {
    if (pipelineSettled) return;
    pipelineSettled = true;
    console.warn('[v2 pipeline] safety timeout — forcing done event', { elapsedMs: Date.now() - startedAt });
    controller.emit('error', {
      code: 'timeout',
      message: 'The AI backend took too long to respond. Please try again.',
    });
    controller.emit('done', null);
    controller.end();
  }, PIPELINE_TIMEOUT_MS);

  try {
    const sessionId = body.sessionId || `s_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const mode = body.mode;
    const intent = body.intent?.trim() ?? '';

    telemetry.stages.push('resolve_context');
    const ctx = await resolveContext({
      userId: auth.userId,
      role: auth.role,
      organizationId: auth.organizationId,
      sessionId,
      pagePath: body.currentPath,
      mode,
      concise: body.concise,
      bearerToken: bearerFromReq(req),
      activeViewState: body.activeViewState ?? null,
      traceId: body.traceId ?? req.agentTraceId,
      idempotencyKey: body.idempotencyKey,
    });

    try {
      const { buildHydrationRetrievalBlock } = await import('../agent/hydrationRetrieval.js');
      const block = await buildHydrationRetrievalBlock(
        body.query,
        auth.organizationId,
        auth.role ?? 'employee',
      );
      if (block) {
        ctx.doraRequest = {
          ...ctx.doraRequest,
          page: { ...ctx.doraRequest.page, retrievalCitations: block },
        };
      }
    } catch (e) {
      console.warn('[v2 pipeline] hydration retrieval skipped', e instanceof Error ? e.message : e);
    }

    if (mode === 'act' && !body.confirmed && !body.searchMode) {
      const offer = inferActConfirmation(body.query, intent);
      const mapped = offer ? actOfferToTool(offer) : null;
      if (offer && mapped) {
        try {
          telemetry.stages.push('act_confirmation');
          const { sseEvent } = await interceptWriteAction(
            mapped.toolName,
            mapped.args,
            ctx.doraRequest,
            body.query,
            'write',
          );
          controller.emit('pending_action', sseEvent.content);
          controller.emit('text', offer.message);
          controller.emit('metadata', {
            toolsUsed: [],
            dataPoints: 0,
            responseTimeMs: Date.now() - startedAt,
            steps: 0,
            terminationReason: 'pending_action',
          });
          controller.emit('done', null);
          pipelineSettled = true;
          clearTimeout(safetyTimer);
          controller.end();
          return;
        } catch (e) {
          console.error('[v2 pipeline] act gate createPendingAction failed', e);
        }
      }
    }

    if (body.searchMode) {
      telemetry.stages.push('kb_only');
      await streamKBSynthesis({ controller, context: ctx, userQuery: body.query, startedAt });
      pipelineSettled = true;
      clearTimeout(safetyTimer);
      controller.end();
      return;
    }

    if (mode === 'act' && body.confirmed === true && body.confirmation && !body.searchMode) {
      const mapped = confirmationToMappedTool(body.confirmation);
      if (mapped) {
        telemetry.stages.push('act_confirmed_execute');
        const legacy = toLegacyToolContext(ctx);
        try {
          const toolResult = await executeTool(mapped.toolName, mapped.args, legacy);
          const dataPoints = Array.isArray(toolResult.data)
            ? toolResult.data.length
            : toolResult.data != null
              ? 1
              : 0;
          const trace: ExecutionTrace = {
            steps: [
              {
                step: 0,
                toolCalls: [{ name: mapped.toolName, args: mapped.args }],
                results: [toolResult],
              },
            ],
            toolResults: [toolResult],
            toolsUsed: [mapped.toolName],
            finalAssistantContent: null,
            dataPoints,
            sources: [],
          };
          await streamSynthesis({
            controller,
            context: ctx,
            userQuery: body.query,
            trace,
            startedAt,
          });
          pipelineSettled = true;
          clearTimeout(safetyTimer);
          controller.end();
          return;
        } catch (e) {
          console.error('[v2 pipeline] act confirmed execute failed', e);
          controller.emit('error', {
            code: 'act_execute_failed',
            message: e instanceof Error ? e.message : String(e),
          });
          controller.emit('done', null);
          pipelineSettled = true;
          clearTimeout(safetyTimer);
          controller.end();
          return;
        }
      }
    }

    telemetry.stages.push('classify');
    const classified = intent
      ? {
          domain: 'conversation' as const,
          confidence: 0.95,
          directIntent: intent,
          flags: {
            isKbOnly: false,
            isGreeting: false,
            isWebSearch: false,
            requiresAct: mode === 'act',
            isPresentation: false,
          },
        }
      : classifyIntent(body.query, ctx);

    telemetry.stages.push('plan');
    const plan = await buildPlan(body.query, classified, ctx);

    if (plan.outcome.type === 'web_search') {
      telemetry.stages.push('web_search_fallback_kb');
      await streamKBSynthesis({ controller, context: ctx, userQuery: body.query, startedAt });
      pipelineSettled = true;
      clearTimeout(safetyTimer);
      controller.end();
      return;
    }

    if (plan.outcome.type === 'greeting') {
      telemetry.stages.push('greeting');
      await streamGreeting({ controller, context: ctx, startedAt });
      pipelineSettled = true;
      clearTimeout(safetyTimer);
      controller.end();
      return;
    }

    if (plan.outcome.type === 'kb_search') {
      telemetry.stages.push('kb_search');
      await streamKBSynthesis({ controller, context: ctx, userQuery: body.query, startedAt });
      pipelineSettled = true;
      clearTimeout(safetyTimer);
      controller.end();
      return;
    }

    if (plan.outcome.type === 'direct') {
      telemetry.stages.push('direct_intent');
      const legacy = toLegacyToolContext(ctx);
      const direct = await executeDirectIntent(plan.outcome.intentId, legacy);
      if (direct) {
        controller.emit('text', direct.text);
        if (direct.widgets?.length) {
          controller.emit('widget_data', { widgets: direct.widgets });
        }
        if (direct.sources?.length) {
          controller.emit('sources', direct.sources);
        }
        controller.emit('metadata', {
          toolsUsed: direct.toolsUsed,
          dataPoints: direct.dataPoints,
          responseTimeMs: Date.now() - startedAt,
          steps: 1,
          terminationReason: 'complete',
          intentId: plan.outcome.intentId,
        });
        controller.emit('done', null);
        pipelineSettled = true;
        clearTimeout(safetyTimer);
        controller.end();
        return;
      }
    }

    const pathForMarketing = typeof body.currentPath === 'string' ? body.currentPath : '';
    const marketingHubAgent =
      body.marketingAgentMode === true || pathForMarketing.startsWith('/marketing/agent');
    const useMarketingSubOrchestrator =
      !classified.directIntent &&
      (marketingHubAgent || classified.domain === 'marketing');

    if (useMarketingSubOrchestrator) {
      telemetry.stages.push('marketing_sub_orchestrator');
      const legacy = toLegacyToolContext(ctx);
      const agentCtx = buildAgentContextFromV2(ctx, legacy);
      const result = await runMarketingSubOrchestratorFlow({
        query: body.query,
        agentContext: agentCtx,
        doraCtx: ctx.doraRequest,
        legacyContext: legacy,
        history: body.history,
        forceMarketingContext: marketingHubAgent,
        marketingAgentMode: body.marketingAgentMode === true,
        onStreamChunk: (t) => controller.emit('text', t),
      });

      for (const pa of result.pendingActions) {
        controller.emit('pending_action', pa.content);
      }

      const dataPoints = result.toolObservations.filter((o) => o.success && o.data != null).length;
      console.log('[DIAG] SSE metadata emitting:', {
        marketingContentId: result.marketingContentId,
        marketingContentStatus: result.marketingContentStatus,
        marketingContentError: result.marketingContentError ?? undefined,
      });
      controller.emit('metadata', {
        toolsUsed: result.toolsUsed,
        dataPoints,
        responseTimeMs: Date.now() - startedAt,
        steps: 1,
        terminationReason: 'complete',
        specialist: 'marketing',
        specialistDisplayName: 'Marketing',
        specialistIcon: '📣',
        marketingContentId: result.marketingContentId ?? null,
        ...(result.marketingContentStatus != null && result.marketingContentStatus !== ''
          ? { marketingContentStatus: result.marketingContentStatus }
          : {}),
        ...(result.marketingContentError != null && result.marketingContentError !== ''
          ? { marketingContentError: result.marketingContentError }
          : {}),
        ...(result.marketingImageUrl != null && result.marketingImageUrl !== ''
          ? { marketingImageUrl: result.marketingImageUrl }
          : {}),
        ...(result.marketingValidation != null && Object.keys(result.marketingValidation).length > 0
          ? { marketingValidation: result.marketingValidation }
          : {}),
      });
      controller.emit('done', null);
      pipelineSettled = true;
      clearTimeout(safetyTimer);
      controller.end();
      return;
    }

    telemetry.stages.push('engine');
    const domain = plan.outcome.type === 'engine' ? plan.outcome.domain : classified.domain;
    const overrides = plan.outcome.type === 'engine' && plan.outcome.toolNames.length ? plan.outcome.toolNames : undefined;
    const tools = selectTools(domain, overrides);

    const trace = await runAgenticEngine({
      userMessage: body.query,
      history: body.history,
      tools,
      context: ctx,
      streamController: controller,
    });

    telemetry.stages.push('synthesis');
    await streamSynthesis({
      controller,
      context: ctx,
      userQuery: body.query,
      trace,
      startedAt,
    });
    pipelineSettled = true;
    clearTimeout(safetyTimer);
    controller.end();
  } catch (err) {
    if (pipelineSettled) return;
    pipelineSettled = true;
    clearTimeout(safetyTimer);
    if (err instanceof DoraPipelineError) {
      controller.emit('error', { code: err.code, message: err.message, details: err.details });
    } else {
      controller.emit('error', {
        code: 'internal',
        message: err instanceof Error ? err.message : String(err),
      });
    }
    controller.emit('done', null);
    controller.end();
  }
}

/**
 * Express adapter: body already validated; sets SSE headers via StreamController.
 */
export async function runPipelineHandler(req: Request, res: Response): Promise<void> {
  const userId = (req as Request & { userId?: string }).userId;
  const organizationId = (req as Request & { organizationId?: string }).organizationId;
  const role = (req as Request & { role?: string }).role;
  if (!userId || !organizationId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const body = req.body as PipelineRequest;
  try {
    await runDoraPipeline(req, res, body, { userId, role, organizationId });
  } catch (err) {
    console.error('[runPipelineHandler] Unhandled pipeline error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'AI pipeline failed' });
      return;
    }
    if (!res.writableEnded) {
      try {
        res.end();
      } catch {
        /* ignore */
      }
    }
  }
}
