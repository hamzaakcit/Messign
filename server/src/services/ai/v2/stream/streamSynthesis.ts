import type OpenAI from 'openai';
import { buildSynthesisContext, FORMAT_PRESETS } from '../context/formatForLLM.js';
import { selectModelTier, streamWithFallback } from '../gateway/modelRouter.js';
import { assemblePrompt, buildSynthesisPrompt, buildSynthesisVisualPrompt } from '../prompts/assemble.js';
import type { DoraContext, ExecutionTrace, ToolResult } from '../types.js';
import type { WidgetPayload } from '../../widgetResolve.js';
import { buildWidgetsFromTrace } from './buildWidgetsFromTrace.js';
import type { StreamController } from './StreamController.js';

/**
 * When widgets will render, do not pass full tool summaries into synthesis — they are the main
 * source of duplicated prose (model repeats the markdown summary next to the table).
 */
function buildToolContextForSynthesis(trace: ExecutionTrace, willShowWidgets: boolean): string {
  if (!trace.toolResults.length) return '';
  if (!willShowWidgets) {
    return buildSynthesisContext(
      trace.toolResults.map((r) => (r.success ? r.summary : `Failed: ${r.summary}`)),
      FORMAT_PRESETS.synthesis.maxChars,
    );
  }
  const failures = trace.toolResults.filter((r: ToolResult) => !r.success);
  const successes = trace.toolResults.filter((r: ToolResult) => r.success);
  if (failures.length === 0) {
    return [
      `All ${successes.length} data source(s) succeeded.`,
      'Full rows, metrics, and fields are shown only in the interactive widget(s) below this message.',
      'Your text reply must not repeat, summarize, or enumerate that content.',
    ].join('\n');
  }
  const failBlock = failures.map((r) => `Issue: ${r.summary}`).join('\n');
  if (successes.length === 0) return failBlock;
  return [
    failBlock,
    `${successes.length} other source(s) succeeded — details appear in the widget(s) below; do not duplicate them in prose.`,
  ].join('\n\n');
}

/**
 * When the client will render structured widgets (tables/cards), tell synthesis not to
 * duplicate the same rows/lists in prose — reduces noise next to the interactive report.
 *
 * @param widgets - Payloads that will be emitted as `widget_data` after synthesis
 * @returns Extra user-message instructions for the synthesis model, or null if no widgets
 */
export function buildWidgetDedupInstruction(widgets: WidgetPayload[]): string | null {
  if (!widgets.length) return null;
  const labels = widgets.map((w) => (w.title?.trim() ? w.title : w.widgetType)).join('; ');
  return [
    'MANDATORY OUTPUT SHAPE: At most 2 short sentences in plain text.',
    'FORBIDDEN in your reply: markdown headings (##), bullet lists, numbered lists, tables, or copying field values from the tool.',
    'UI: Interactive widget(s) below show the full data.',
    labels ? `Widget(s): ${labels}.` : '',
    'If the widget answers the question, reply with one brief line only (e.g. acknowledgment or one suggested next step).',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function streamSynthesis(params: {
  controller: StreamController;
  context: DoraContext;
  userQuery: string;
  trace: ExecutionTrace;
  startedAt: number;
}): Promise<void> {
  const { controller, context, userQuery, trace, startedAt } = params;

  const widgets = buildWidgetsFromTrace(trace.toolsUsed, trace.toolResults, context.userRole);
  const widgetDedupHint = buildWidgetDedupInstruction(widgets);
  const willShowWidgets = widgets.length > 0;

  const toolNarrative = buildToolContextForSynthesis(trace, willShowWidgets);

  /** Model draft often repeats the same bullets as the widget — omit when a widget carries the dataset. */
  const includeModelDraft = Boolean(
    trace.finalAssistantContent?.trim() && !willShowWidgets,
  );

  const userBlock = [
    `User question: ${userQuery}`,
    includeModelDraft ? `Model draft (may be incomplete):\n${trace.finalAssistantContent}` : '',
    trace.toolResults.length ? `Tool context for you (synthesis):\n${toolNarrative}` : '',
    widgetDedupHint,
  ]
    .filter(Boolean)
    .join('\n\n');

  const basePrompt = assemblePrompt(
    willShowWidgets ? buildSynthesisVisualPrompt(context) : buildSynthesisPrompt(context),
    context,
  );
  /** General system prompt encourages GFM lists; this overrides when widgets carry the dataset. */
  const widgetModeSystem: OpenAI.ChatCompletionMessageParam | null = willShowWidgets
    ? {
        role: 'system',
        content:
          'Widget mode (critical): If the user message contains MANDATORY OUTPUT SHAPE or FORBIDDEN, ignore any earlier instruction to use ## headings or bullet lists. Reply in at most two plain sentences with no markdown list syntax.',
      }
    : null;

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    ...basePrompt,
    ...(widgetModeSystem ? [widgetModeSystem] : []),
    { role: 'user', content: userBlock },
  ];

  const tiers = selectModelTier('synthesis', userQuery, 0);

  const maxTokens = willShowWidgets ? 120 : 2048;
  const temperature = willShowWidgets ? 0.12 : 0.35;

  try {
    for await (const chunk of streamWithFallback(
      {
        messages,
        tenantId: context.organizationId,
        maxTokens,
        temperature,
        userQuery,
      },
      tiers.primary,
      tiers.fallback,
    )) {
      const piece = chunk.choices?.[0]?.delta?.content;
      if (piece) controller.emit('text', piece);
    }
  } catch (e) {
    controller.emit('error', {
      code: 'synthesis_failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }

  if (widgets.length) {
    controller.emit('widget_data', { widgets });
  }
  if (trace.sources.length) {
    controller.emit('sources', trace.sources);
  }

  controller.emit('metadata', {
    toolsUsed: trace.toolsUsed,
    dataPoints: trace.dataPoints,
    responseTimeMs: Date.now() - startedAt,
    steps: trace.steps.length,
    terminationReason: 'complete',
  });
  controller.emit('done', null);
}
