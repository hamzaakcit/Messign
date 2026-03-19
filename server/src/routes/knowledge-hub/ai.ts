import { Router, Request, Response } from 'express';
import { generateGroqCompletion, streamGroqAnswer } from '../../services/knowledgeGroq.js';
import { generateGeminiAnswer, streamGeminiAnswer } from '../../services/knowledgeGemini.js';
import { buildPptxBuffer } from '../../services/presentationPptx.js';
import { routeQuery } from '../../services/ai/intentRouter.js';
import '../../services/ai/tools/index.js';
import { getToolCount } from '../../services/ai/tools/index.js';
import { aiAnswerRateLimit, aiPresentationRateLimit } from '../../middleware/aiRateLimit.js';
import { claudeRateLimit, incrementClaudeUsage, getClaudeUsageStatus } from '../../middleware/claudeRateLimit.js';
import { validateAIAnswerInput, validateAIPresentationInput } from '../../middleware/aiInputValidation.js';
import { logQuery } from '../../services/ai/queryLogger.js';
import { recordTiming } from '../../services/ai/performanceMonitor.js';
import { trimHistory } from '../../services/ai/contextLimiter.js';
import { buildDoraContext, toLegacyToolContext } from '../../services/ai/dora/context.js';
import { orchestrate, WIDGET_TOOL_NAMES } from '../../services/ai/orchestrator/agenticLoop.js';
import { runOrchestrator, buildAgentContextFromDora } from '../../services/ai/agents/orchestrator.js';
import { streamGroqWebSearch } from '../../services/ai/groqToolCalling.js';
import { logTelemetry, attachFeedback, insertRequestTelemetry, getUserAiStats } from '../../services/ai/telemetry/service.js';
import { query } from '../../db/index.js';
import type { SourceDocument } from '../../services/ai/types.js';
import type { OrchestrationResult, AgentStep } from '../../services/ai/orchestrator/types.js';

console.log(`[AI Route] Loaded with ${getToolCount()} AI tools available.`);

/**
 * A/B Test Phase 1.1: Route ~10% of requests to dynamic tool loop (5-tool payload).
 * Uses deterministic hash of userId + organizationId for consistent per-user assignment.
 */
function routeToDynamicToolLoop(userId: string, organizationId: string | null): boolean {
  const seed = `${userId}:${organizationId ?? 'no-org'}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash; // Keep 32-bit
  }
  const bucket = Math.abs(hash) % 100;
  return bucket < 10; // 10% to dynamic
}

export const aiRouter = Router();
type AuthReq = Request & { userId: string; role?: string };

function extractSources(routerResult: { toolResults: { success: boolean; data: unknown }[] }): SourceDocument[] {
  const sources: SourceDocument[] = [];
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();

  for (const result of routerResult.toolResults) {
    if (!result.success || !result.data || !Array.isArray(result.data)) continue;
    for (const item of result.data as Record<string, unknown>[]) {
      if (item.title && item.id && (item.slug != null || item.document_type != null)) {
        const id = String(item.id);
        const titleKey = String(item.title).toLowerCase().trim();
        if (seenIds.has(id)) continue;
        if (seenTitles.has(titleKey)) continue;
        seenIds.add(id);
        seenTitles.add(titleKey);
        sources.push({
          id,
          title: String(item.title),
          slug: item.slug != null ? String(item.slug) : undefined,
          document_type: item.document_type != null ? String(item.document_type) : undefined,
        });
      }
    }
  }
  return sources;
}

// ============================================================
// FEEDBACK
// ============================================================

aiRouter.post('/feedback', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthReq).userId;
    await query(
      `INSERT INTO knowledge_ai_feedback (user_id, query, answer, source_document_ids, is_helpful) VALUES ($1,$2,$3,$4,$5)`,
      [userId, req.body.query, req.body.answer, req.body.sourceDocumentIds ?? [], req.body.isHelpful]
    );

    attachFeedback(
      req.body.telemetryId || null,
      req.body.isHelpful ? 'up' : 'down',
      req.body.comment || null,
      userId,
      req.body.query,
    ).catch((err) => console.error('[kh-ai] attachFeedback failed', { error: err instanceof Error ? err.message : String(err) }));

    res.json({ ok: true });
  } catch (e) {
    console.error('[kh-ai] feedback:', e);
    res.status(500).json({ error: 'Failed to save feedback' });
  }
});

// ============================================================
// PRESENTATION
// ============================================================

interface PresentationSlide { title: string; bullets: string[]; }
interface Presentation { title: string; slides: PresentationSlide[]; }

aiRouter.post('/presentation', validateAIPresentationInput, aiPresentationRateLimit, async (req: Request, res: Response) => {
  try {
    const topic = req.body.topic as string;
    const slideCount = req.body.slideCount as number;

    const authReq = req as AuthReq;
    const doraCtx = await buildDoraContext(authReq.userId, authReq.role, '', false);
    const context = toLegacyToolContext(doraCtx);
    const routerResult = await routeQuery(topic, [], context);

    const systemPrompt = `You are creating a professional presentation for Messign Workspace based on REAL company data.

RULES:
- Use ONLY the provided data. Every number and fact must come from the context below.
- Output ONLY valid JSON in this exact format, with no extra text, no markdown, no backticks:
{"title": "Presentation Title", "slides": [{"title": "Slide Title", "bullets": ["Point 1", "Point 2", "Point 3"]}]}
- Create exactly ${slideCount} content slides (not counting title slide).
- Structure: Start with overview/key metrics, then details by topic, end with summary/next steps.
- If the data includes comparisons or rankings, dedicate a slide to them.
- Be specific — use real names, exact numbers, real project names from the data.
- Data sources queried: ${routerResult.toolsUsed.join(', ')}`;

    const userMessage = `Data:\n${routerResult.combinedContext}\n\nCreate a ${slideCount}-slide presentation about: ${topic}`;

    const tenantId = doraCtx.user.organizationId ?? 'system';
    let presentationJson: string | null = null;

    try {
      presentationJson = await generateGroqCompletion(
        [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
        { maxTokens: 2048, tenantId },
      );
    } catch (e) {
      console.warn('[kh-ai] presentation Groq failed:', e);
    }

    if (!presentationJson) {
      try {
        presentationJson = await generateGeminiAnswer(userMessage, systemPrompt, { tenantId });
      } catch (e) {
        console.warn('[kh-ai] presentation Gemini failed:', e);
      }
    }

    if (!presentationJson) {
      res.status(500).json({ error: 'Failed to generate presentation. All AI providers failed.' });
      return;
    }

    let cleanJson = presentationJson.trim();
    if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }

    const parsed = JSON.parse(cleanJson) as { title?: string; slides?: { title?: string; bullets?: unknown[] }[] };
    if (!parsed.title || !Array.isArray(parsed.slides)) {
      res.status(500).json({ error: 'Invalid presentation format returned by AI.' });
      return;
    }

    const presentation = {
      title: String(parsed.title),
      slides: parsed.slides.map((s) => ({
        title: String(s?.title || 'Untitled Slide'),
        bullets: Array.isArray(s?.bullets) ? s.bullets.map((b) => String(b)) : [],
      })),
    };

    res.json(presentation);
  } catch (e) {
    console.error('[kh-ai] presentation:', e);
    res.status(500).json({ error: 'Failed to generate presentation' });
  }
});

aiRouter.post('/presentation/export', async (req: Request, res: Response) => {
  try {
    const { title, slides } = req.body as { title?: string; slides?: { title: string; bullets: string[] }[] };
    if (!title || typeof title !== 'string' || !Array.isArray(slides) || slides.length === 0) {
      res.status(400).json({ error: 'Invalid payload: title and slides array required' });
      return;
    }
    const sanitized: Presentation = {
      title: title.trim(),
      slides: slides.map((s) => ({
        title: typeof s?.title === 'string' ? s.title.trim() : 'Slide',
        bullets: Array.isArray(s?.bullets) ? s.bullets.map((b) => String(b)) : [],
      })),
    };
    const buffer = await buildPptxBuffer(sanitized);
    const filename = `presentation-${Date.now()}.pptx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (e) {
    console.error('[kh-ai] presentation/export:', e);
    res.status(500).json({ error: 'Failed to export presentation' });
  }
});

// ============================================================
// AI ANSWER — Phase 3 Agentic Orchestrator
// ============================================================

const sendSSE = (res: Response) => (event: Record<string, unknown>) => {
  try {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  } catch { /* client disconnected */ }
};

const MODULE_DISPLAY_NAMES: Record<string, string> = {
  crm: 'Sales & CRM',
  support: 'Customer Support',
  finance: 'Finance',
  hr: 'People & HR',
  marketing: 'Marketing',
  knowledge: 'Knowledge',
  time: 'Time & Projects',
  okr: 'OKRs & Goals',
  heart: 'Culture & Heart',
  executive: 'Executive',
  assets: 'Assets',
  contracts: 'Contracts',
};

const MODULE_ICONS: Record<string, string> = {
  crm: '📊',
  support: '🎧',
  finance: '💰',
  hr: '👥',
  marketing: '📣',
  knowledge: '📚',
  time: '⏱️',
  okr: '🎯',
  heart: '❤️',
  executive: '📈',
  assets: '🏢',
  contracts: '📄',
};

const WIDGET_TOOL_MAP: Record<string, string> = {
  // System
  'analytics:get_system_stats': 'system_overview',

  // Projects & Tasks
  'projects:get_tasks_by_user': 'task_table',
  'projects:get_project_status': 'project_status',

  // Finance
  'finance:get_financial_summary': 'financial_summary',
  'finance:get_invoice_details': 'data_table',
  'analytics:get_approval_queue': 'data_table',
  'finance:get_reimbursement_details': 'data_table',

  // People & HR
  'people:get_employee_performance': 'performance_overview',
  'people:get_team_overview': 'team_overview',
  'hr:compare_employees': 'data_table',
  'hr:get_hiring_pipeline': 'data_table',
  'hr:get_recruitment_metrics': 'data_table',

  // Support
  'support:get_ticket_overview': 'data_table',
  'support:get_support_metrics': 'data_table',
  'support:get_customer_health': 'data_table',

  // Time
  'time:get_time_summary': 'data_table',
  'time:get_utilization_report': 'data_table',

  // OKR
  'okr:get_okr_metrics': 'data_table',
  'okr:list_goals': 'data_table',

  // Fun
  'fun:play_dora_dash': 'dora_dash',
};

type ToolResultForWidget = { toolName: string; success: boolean; data: unknown; summary?: string };

function emitWidgetsFromToolResults(
  send: (event: Record<string, unknown>) => void,
  toolResultsForWidgets: ToolResultForWidget[],
  path: string,
): void {
  const failures = toolResultsForWidgets.filter((o) => !o.success);
  if (failures.length > 0) {
    const names = failures.map((f) => f.toolName).join(', ');
    const allFailed = failures.length === toolResultsForWidgets.length;
    send({
      type: 'notice',
      content: allFailed
        ? `Couldn't load data (${names}). Please try again in a moment.`
        : `Note: ${names} did not return data; other results may still appear below.`,
    });
  }

  console.log('[Dora] Widget emission', {
    path,
    toolResultCount: toolResultsForWidgets.length,
    toolNames: toolResultsForWidgets.map((o) => o.toolName),
  });
  const emittedWidgetTypes = new Set<string>();
  for (const obs of toolResultsForWidgets) {
    const widgetType = WIDGET_TOOL_MAP[obs.toolName];
    if (widgetType && !emittedWidgetTypes.has(widgetType) && obs.success && obs.data) {
      emittedWidgetTypes.add(widgetType);
      console.log('[WIDGET DEBUG] Emitting widget_data SSE:', { widgetType, toolName: obs.toolName });
      send({ type: 'widget_data', content: { widgetType, data: obs.data, title: obs.summary ?? '' } });
    }
  }
}

aiRouter.get('/user-stats', async (req: Request, res: Response) => {
  const authReq = req as AuthReq;
  if (!authReq.userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  try {
    const range = (req.query.range as string) || '7d';
    const rangeDays = range === '24h' ? 1 : parseInt(range.replace(/[^0-9]/g, ''), 10) || 7;
    const stats = await getUserAiStats(authReq.userId, Math.min(90, Math.max(1, rangeDays)));
    res.json(stats);
  } catch (e) {
    console.error('[kh-ai] user-stats:', e);
    res.status(500).json({ error: 'Failed to load user stats.' });
  }
});

aiRouter.get('/answer/claude-status', async (req: Request, res: Response) => {
  const authReq = req as AuthReq;
  if (!authReq.userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  try {
    const status = await getClaudeUsageStatus(authReq.userId, authReq.role ?? 'employee');
    res.json(status);
  } catch (e) {
    console.error('[kh-ai] claude-status:', e);
    res.status(500).json({ error: 'Failed to get Claude usage status.' });
  }
});

aiRouter.post('/answer', validateAIAnswerInput, aiAnswerRateLimit, async (req: Request, res: Response) => {
  const userQuery = req.body.query as string;
  const history: { role: string; content: string }[] = req.body.history ?? [];
  const concise = req.body.concise !== false;
  const currentPath = (req.body.currentPath as string) || '';
  const sessionId = (req.body.sessionId as string) || `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const searchMode = req.body.searchMode === true;
  const provider = (req.body.provider as string) || 'auto';

  const authReq = req as AuthReq;

  // Claude provider: enforce daily limit before opening SSE stream
  if (provider === 'claude') {
    try {
      const status = await getClaudeUsageStatus(authReq.userId, authReq.role ?? 'employee');
      if (status.remaining <= 0) {
        res.status(429).json({
          error: `Daily Claude limit reached (${status.limit}/day). Resets at midnight UTC.`,
          used: status.used,
          limit: status.limit,
          remaining: 0,
        });
        return;
      }
    } catch { /* allow through on DB error */ }
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const send = sendSSE(res);
  const startTime = Date.now();

  // Web Search mode: use Groq compound-beta for internet search
  if (searchMode) {
    try {
      const doraCtx = await buildDoraContext(authReq.userId, authReq.role, currentPath, concise);
      const systemContext =
        `You are Dora, an AI assistant for ${doraCtx.user.userName} (${doraCtx.user.userRole}) at Messign Workspace. ` +
        `Today is ${doraCtx.todayDate}. ` +
        `The user has activated Web Search mode. Search the internet and provide accurate, up-to-date information. ` +
        `Cite your sources with URLs when available. ` +
        (concise ? 'Be concise: 2-4 sentences plus key links.' : 'Provide thorough detail with sources.');

      const chatHistory = trimHistory(history, 800).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content || '',
      }));

      const stream = streamGroqWebSearch(userQuery, systemContext, chatHistory as Parameters<typeof streamGroqWebSearch>[2]);

      for await (const chunk of stream) {
        send({ type: 'text', content: chunk });
      }

      const totalMs = Date.now() - startTime;
      send({ type: 'metadata', content: { toolsUsed: ['web_search'], dataPoints: 0, responseTimeMs: totalMs, steps: 1, terminationReason: 'complete' } });
      send({ type: 'done' });
      res.end();

      logQuery({
        userId: authReq.userId, query: userQuery, toolsUsed: ['web_search'],
        dataPointsReturned: 0, responseTimeMs: totalMs, success: true,
        usedFallback: false, toolCallCount: 0, conciseMode: concise, synthesisProvider: 'groq-compound',
      }).catch((err) => console.error('[kh-ai] logQuery failed', { error: err instanceof Error ? err.message : String(err) }));
      insertRequestTelemetry({
        tenantId: doraCtx.user.organizationId,
        userId: authReq.userId,
        query: userQuery,
        path: 'web_search',
        specialist: null,
        toolCallsUsed: 0,
        durationMs: totalMs,
        success: true,
      });
      return;
    } catch (e) {
      console.error('[kh-ai] web search error:', e);
      send({ type: 'error', message: 'Web search failed. Please try again.' });
      send({ type: 'done' });
      res.end();
      return;
    }
  }

  try {
    const doraCtx = await buildDoraContext(authReq.userId, authReq.role, currentPath, concise);
    const legacyContext = toLegacyToolContext(doraCtx);
    const chatHistory = trimHistory(history, 1000).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const isDynamicToolLoopEnabled = routeToDynamicToolLoop(
      authReq.userId,
      doraCtx.user.organizationId,
    );

    let result: Awaited<ReturnType<typeof runOrchestrator>> | Awaited<ReturnType<typeof orchestrate>>;
    let pathTaken: 'orchestrator' | 'agenticLoop' | 'intentRouter' = 'orchestrator';
    const agentContext = buildAgentContextFromDora(doraCtx, legacyContext, sessionId, currentPath);

    try {
      result = await runOrchestrator(
        userQuery,
        chatHistory,
        agentContext,
        (chunk) => { send({ type: 'text', content: chunk }); },
        (routing) => {
          const module = routing.module?.toLowerCase() ?? '';
          send({
            type: 'specialist',
            module,
            displayName: MODULE_DISPLAY_NAMES[module] ?? module,
            icon: MODULE_ICONS[module] ?? '✨',
          });
        },
      );
    } catch (orchErr) {
      const errMsg = orchErr instanceof Error ? orchErr.message : String(orchErr);
      const errStack = orchErr instanceof Error ? orchErr.stack?.split('\n').slice(0, 3).join('\n') : undefined;
      console.error('[Dora] Orchestrator failed', {
        error: errMsg,
        stack: errStack,
        userId: legacyContext.userId,
        query: userQuery.substring(0, 100),
        fallbackTo: 'agenticLoop',
      });
      try {
        pathTaken = 'agenticLoop';
        result = await orchestrate(
          userQuery,
          chatHistory,
          doraCtx,
          legacyContext,
          (chunk) => { send({ type: 'text', content: chunk }); },
          {
            ...(provider !== 'auto' ? { provider } : {}),
            isDynamicToolLoopEnabled,
          },
        );
      } catch (fallbackErr) {
        const errMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        const errStack = fallbackErr instanceof Error ? fallbackErr.stack?.split('\n').slice(0, 3).join('\n') : undefined;
        console.error('[Dora] Agentic loop failed', {
          error: errMsg,
          stack: errStack,
          userId: legacyContext.userId,
          query: userQuery.substring(0, 100),
          fallbackTo: 'intentRouter',
        });
        pathTaken = 'intentRouter';
        const routerResult = await routeQuery(userQuery, chatHistory, legacyContext, doraCtx);
        const context = routerResult.combinedContext || 'No data was retrieved.';
        const tenantId = doraCtx.user.organizationId ?? 'system';
        try {
          try {
            await streamGroqAnswer(userQuery, context, (chunk) => send({ type: 'text', content: chunk }), chatHistory, { concise, tenantId });
          } catch {
            await streamGeminiAnswer(userQuery, context, (chunk) => send({ type: 'text', content: chunk }), { tenantId });
          }
        } catch (synErr) {
          console.error('[kh-ai] Fallback synthesis also failed:', synErr);
          send({ type: 'text', content: "I'm having trouble connecting to AI services. Please ensure LiteLLM is running (npm run litellm) and API keys are set." });
        }
        const totalMs = Date.now() - startTime;
        const sources = extractSources({ toolResults: routerResult.toolResults });
        if (sources.length > 0) send({ type: 'sources', documents: sources });
        const intentRouterToolResults1: ToolResultForWidget[] = routerResult.toolResults.map((r, i) => ({
          toolName: routerResult.toolsUsed[i] ?? 'unknown',
          success: r.success,
          data: r.data,
          summary: r.summary,
        }));
        emitWidgetsFromToolResults(send, intentRouterToolResults1, 'intentRouter');
        send({ type: 'metadata', content: { toolsUsed: routerResult.toolsUsed, dataPoints: routerResult.toolResults.filter((r) => r.success && r.data).length, responseTimeMs: totalMs, steps: 1, terminationReason: 'complete' } });
        send({ type: 'done' });
        res.end();
        console.log('[Dora] Request completed', {
          path: 'intentRouter',
          duration: totalMs,
          userId: legacyContext.userId,
          specialist: 'none',
          toolCalls: routerResult.toolsUsed.length,
        });
        logQuery({ userId: legacyContext.userId, query: userQuery, toolsUsed: routerResult.toolsUsed, dataPointsReturned: routerResult.toolResults.filter((r) => r.success).length, responseTimeMs: totalMs, success: true, usedFallback: true, toolCallCount: routerResult.toolsUsed.length, conciseMode: concise, synthesisProvider: 'fallback' }).catch((err) => console.error('[kh-ai] logQuery failed', { error: err instanceof Error ? err.message : String(err) }));
        insertRequestTelemetry({
          tenantId: doraCtx.user.organizationId,
          userId: legacyContext.userId,
          query: userQuery,
          path: 'intentRouter',
          specialist: null,
          toolCallsUsed: routerResult.toolsUsed.length,
          durationMs: totalMs,
          success: true,
        });
        return;
      }
    }

    if (result && 'type' in result && result.type === 'no_specialist') {
      console.log('[Dora] No specialist, using agentic loop', { module: result.module });
      pathTaken = 'agenticLoop';
      try {
        result = await orchestrate(
          userQuery,
          chatHistory,
          doraCtx,
          legacyContext,
          (chunk) => { send({ type: 'text', content: chunk }); },
          {
            ...(provider !== 'auto' ? { provider } : {}),
            isDynamicToolLoopEnabled,
          },
        );
      } catch (fallbackErr) {
        const errMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        const errStack = fallbackErr instanceof Error ? fallbackErr.stack?.split('\n').slice(0, 3).join('\n') : undefined;
        console.error('[Dora] Agentic loop failed', {
          error: errMsg,
          stack: errStack,
          userId: legacyContext.userId,
          query: userQuery.substring(0, 100),
          fallbackTo: 'intentRouter',
        });
        pathTaken = 'intentRouter';
        const routerResult = await routeQuery(userQuery, chatHistory, legacyContext, doraCtx);
        const context = routerResult.combinedContext || 'No data was retrieved.';
        const tenantId = doraCtx.user.organizationId ?? 'system';
        try {
          try {
            await streamGroqAnswer(userQuery, context, (chunk) => send({ type: 'text', content: chunk }), chatHistory, { concise, tenantId });
          } catch {
            await streamGeminiAnswer(userQuery, context, (chunk) => send({ type: 'text', content: chunk }), { tenantId });
          }
        } catch (synErr) {
          console.error('[kh-ai] Fallback synthesis also failed:', synErr);
          send({ type: 'text', content: "I'm having trouble connecting to AI services. Please ensure LiteLLM is running (npm run litellm) and API keys are set." });
        }
        const totalMs = Date.now() - startTime;
        const sources = extractSources({ toolResults: routerResult.toolResults });
        if (sources.length > 0) send({ type: 'sources', documents: sources });
        const intentRouterToolResults2: ToolResultForWidget[] = routerResult.toolResults.map((r, i) => ({
          toolName: routerResult.toolsUsed[i] ?? 'unknown',
          success: r.success,
          data: r.data,
          summary: r.summary,
        }));
        emitWidgetsFromToolResults(send, intentRouterToolResults2, 'intentRouter');
        send({ type: 'metadata', content: { toolsUsed: routerResult.toolsUsed, dataPoints: routerResult.toolResults.filter((r) => r.success && r.data).length, responseTimeMs: totalMs, steps: 1, terminationReason: 'complete' } });
        send({ type: 'done' });
        res.end();
        console.log('[Dora] Request completed', {
          path: 'intentRouter',
          duration: totalMs,
          userId: legacyContext.userId,
          specialist: 'none',
          toolCalls: routerResult.toolsUsed.length,
        });
        logQuery({ userId: legacyContext.userId, query: userQuery, toolsUsed: routerResult.toolsUsed, dataPointsReturned: routerResult.toolResults.filter((r) => r.success).length, responseTimeMs: totalMs, success: true, usedFallback: true, toolCallCount: routerResult.toolsUsed.length, conciseMode: concise, synthesisProvider: 'fallback' }).catch((err) => console.error('[kh-ai] logQuery failed', { error: err instanceof Error ? err.message : String(err) }));
        insertRequestTelemetry({
          tenantId: doraCtx.user.organizationId,
          userId: legacyContext.userId,
          query: userQuery,
          path: 'intentRouter',
          specialist: null,
          toolCallsUsed: routerResult.toolsUsed.length,
          durationMs: totalMs,
          success: true,
        });
        return;
      }
    }

    const orchResult: OrchestrationResult = result as OrchestrationResult;
    const allToolResults = orchResult.steps.flatMap((s: AgentStep) => s.observations);
    // Specialist path returns toolObservations instead of steps.observations
    const toolResultsForWidgets =
      allToolResults.length > 0
        ? allToolResults
        : (orchResult.toolObservations ?? []).map((o) => ({
            toolName: o.toolName,
            success: o.success,
            data: o.data,
            summary: o.summary,
          }));
    const sources = extractSources({ toolResults: allToolResults as { success: boolean; data: unknown }[] });
    if (sources.length > 0) {
      send({ type: 'sources', documents: sources });
    }

    // Verify consistency with orchestrator's WIDGET_TOOL_NAMES at startup
    for (const key of Object.keys(WIDGET_TOOL_MAP)) {
      if (!WIDGET_TOOL_NAMES.has(key)) {
        console.warn(`[AI Route] WIDGET_TOOL_MAP key "${key}" not in WIDGET_TOOL_NAMES`);
      }
    }
    const mainPathToolResults: ToolResultForWidget[] = toolResultsForWidgets as ToolResultForWidget[];
    console.log('[WIDGET DEBUG] Tool results available (orchestrator/agentic path):', {
      hasToolObservations: !!(orchResult.toolObservations && orchResult.toolObservations.length > 0),
      toolObservationsCount: orchResult.toolObservations?.length ?? 0,
      toolNamesFromObservations: orchResult.toolObservations?.map((o) => o.toolName) ?? [],
      path: pathTaken,
      stepsObservationsCount: allToolResults.length,
      mergedForWidgetsCount: mainPathToolResults.length,
      mergedToolNames: mainPathToolResults.map((o) => o.toolName),
    });
    emitWidgetsFromToolResults(send, mainPathToolResults, pathTaken);

    // Phase 4: emit pending action events for HITL confirmation cards
    if (orchResult.pendingActions && orchResult.pendingActions.length > 0) {
      for (const actionEvent of orchResult.pendingActions) {
        send(actionEvent as unknown as Record<string, unknown>);
      }
    }

    const totalMs = Date.now() - startTime;
    const toolCallsUsed = orchResult.steps.reduce((s: number, step: { toolCalls?: unknown[] }) => s + (step.toolCalls?.length ?? 0), 0);

    console.log('[Dora] Request completed', {
      path: pathTaken,
      duration: totalMs,
      userId: legacyContext.userId,
      specialist: orchResult.toolsUsed[0] ?? 'none',
      toolCalls: toolCallsUsed,
    });
    console.log(
      `[A/B Test] Dynamic Loop: ${isDynamicToolLoopEnabled ? 'TRUE' : 'FALSE'} | Tokens: ${orchResult.totalTokens.totalTokens} | Latency: ${totalMs}ms`,
    );

    let telemetryId: string | null = null;
    try {
      telemetryId = await logTelemetry(orchResult, doraCtx, userQuery, sessionId);
    } catch { /* never block */ }

    const primaryTool = orchResult.toolsUsed[0];
    const specialistModule = primaryTool?.split(':')[0] ?? null;
    send({
      type: 'metadata',
      content: {
        toolsUsed: orchResult.toolsUsed,
        dataPoints: orchResult.totalDataPoints,
        responseTimeMs: totalMs,
        steps: orchResult.stepCount,
        terminationReason: orchResult.terminationReason,
        telemetryId: telemetryId || undefined,
        specialist: specialistModule,
        specialistDisplayName: specialistModule ? MODULE_DISPLAY_NAMES[specialistModule] ?? specialistModule : null,
        specialistIcon: specialistModule ? MODULE_ICONS[specialistModule] ?? '✨' : null,
      },
    });

    send({ type: 'done' });
    res.end();

    if (provider === 'claude' && orchResult.success) {
      incrementClaudeUsage(authReq.userId).catch((err) => console.error('[kh-ai] incrementClaudeUsage failed', { error: err instanceof Error ? err.message : String(err) }));
    }

    recordTiming({
      routerMs: totalMs,
      toolsMs: totalMs,
      synthesisMs: 0,
      totalMs,
      toolCount: orchResult.toolsUsed.length,
    });

    logQuery({
      userId: legacyContext.userId,
      query: userQuery,
      toolsUsed: orchResult.toolsUsed,
      dataPointsReturned: orchResult.totalDataPoints,
      responseTimeMs: totalMs,
      success: orchResult.success,
      usedFallback: orchResult.toolsUsed.length === 1 && orchResult.toolsUsed[0]?.includes('search_knowledge_base'),
      toolCallCount: orchResult.steps.reduce((s: number, step: { toolCalls?: unknown[] }) => s + (step.toolCalls?.length ?? 0), 0),
      conciseMode: concise,
      synthesisProvider: 'orchestrator',
    }).catch((err) => console.error('[kh-ai] logQuery failed', { error: err instanceof Error ? err.message : String(err) }));

    insertRequestTelemetry({
      tenantId: doraCtx.user.organizationId,
      userId: legacyContext.userId,
      query: userQuery,
      path: pathTaken,
      specialist: orchResult.toolsUsed[0] ?? null,
      toolCallsUsed: orchResult.steps.reduce((s: number, step: { toolCalls?: unknown[] }) => s + (step.toolCalls?.length ?? 0), 0),
      durationMs: totalMs,
      success: orchResult.success,
      errorMessage: orchResult.error ?? null,
      tokensInput: orchResult.totalTokens.promptTokens,
      tokensOutput: orchResult.totalTokens.completionTokens,
      cacheHit: orchResult.cacheHit,
      estimatedCostSavingsUsd: orchResult.estimatedCostSavingsUsd,
    });
  } catch (error) {
    console.error('[kh-ai] answer route error:', error);

    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    const isConnectionError = /ECONNREFUSED|fetch failed|ENOTFOUND|network|timeout/i.test(errMsg);

    const totalMs = Date.now() - startTime;

    // 1. Check if we already started sending a stream to the client
    if (res.headersSent) {
      // If yes, we cannot change the status code to 500 anymore.
      // Instead, send an SSE error event so the frontend knows it failed, then close the connection cleanly.
      const userMessage = isConnectionError
        ? 'AI services are unreachable. Ensure LiteLLM is running (npm run litellm) and the server can reach it.'
        : 'An error occurred while processing your question. Please try again.';
      res.write(
        `event: error\ndata: ${JSON.stringify({
          message: userMessage,
          details: errMsg,
        })}\n\n`,
      );
      logQuery({
        userId: authReq.userId,
        query: userQuery,
        toolsUsed: [],
        dataPointsReturned: 0,
        responseTimeMs: totalMs,
        success: false,
        errorMessage: errMsg,
        usedFallback: false,
        toolCallCount: 0,
        conciseMode: concise,
      }).catch((err) => console.error('[kh-ai] logQuery failed', { error: err instanceof Error ? err.message : String(err) }));
      insertRequestTelemetry({
        tenantId: (authReq as { organizationId?: string }).organizationId ?? null,
        userId: authReq.userId,
        query: userQuery,
        path: 'error',
        specialist: null,
        toolCallsUsed: 0,
        durationMs: totalMs,
        success: false,
        errorMessage: errMsg,
      });
      return res.end();
    }

    // 2. If headers haven't been sent yet, it's safe to return a standard 500 JSON response
    logQuery({
      userId: authReq.userId,
      query: userQuery,
      toolsUsed: [],
      dataPointsReturned: 0,
      responseTimeMs: totalMs,
      success: false,
      errorMessage: errMsg,
      usedFallback: false,
      toolCallCount: 0,
      conciseMode: concise,
    }).catch((err) => console.error('[kh-ai] logQuery failed', { error: err instanceof Error ? err.message : String(err) }));
    insertRequestTelemetry({
      tenantId: (authReq as { organizationId?: string }).organizationId ?? null,
      userId: authReq.userId,
      query: userQuery,
      path: 'error',
      specialist: null,
      toolCallsUsed: 0,
      durationMs: totalMs,
      success: false,
      errorMessage: errMsg,
    });
    return res.status(500).json({
      error: 'An error occurred while processing the request',
      details: errMsg,
    });
  }
});
