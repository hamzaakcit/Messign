import type OpenAI from 'openai';
import { buildSynthesisContext, FORMAT_PRESETS } from '../context/formatForLLM.js';
import { selectModelTier, streamWithFallback } from '../gateway/modelRouter.js';
import { assemblePrompt, buildSynthesisPrompt } from '../prompts/assemble.js';
import type { DoraContext, ExecutionTrace } from '../types.js';
import { buildWidgetsFromTrace } from './buildWidgetsFromTrace.js';
import type { StreamController } from './StreamController.js';

export async function streamSynthesis(params: {
  controller: StreamController;
  context: DoraContext;
  userQuery: string;
  trace: ExecutionTrace;
  startedAt: number;
}): Promise<void> {
  const { controller, context, userQuery, trace, startedAt } = params;

  const toolNarrative = buildSynthesisContext(
    trace.toolResults.map((r) => (r.success ? r.summary : `Failed: ${r.summary}`)),
    FORMAT_PRESETS.synthesis.maxChars,
  );

  const userBlock = [
    `User question: ${userQuery}`,
    trace.finalAssistantContent ? `Model draft (may be incomplete):\n${trace.finalAssistantContent}` : '',
    trace.toolResults.length ? `Structured tool output:\n${toolNarrative}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    ...assemblePrompt(buildSynthesisPrompt(context), context),
    { role: 'user', content: userBlock },
  ];

  const tiers = selectModelTier('synthesis', userQuery, 0);

  try {
    for await (const chunk of streamWithFallback(
      {
        messages,
        tenantId: context.organizationId,
        maxTokens: 2048,
        temperature: 0.35,
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

  const widgets = buildWidgetsFromTrace(trace.toolsUsed, trace.toolResults, context.userRole);
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
