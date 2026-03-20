import type OpenAI from 'openai';
import { selectModelTier, streamWithFallback } from '../gateway/modelRouter.js';
import { assemblePrompt, buildGreetingPrompt } from '../prompts/assemble.js';
import type { DoraContext } from '../types.js';
import type { StreamController } from './StreamController.js';

export async function streamGreeting(params: {
  controller: StreamController;
  context: DoraContext;
  startedAt: number;
}): Promise<void> {
  const { controller, context, startedAt } = params;
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    ...assemblePrompt(buildGreetingPrompt(context), context),
    {
      role: 'user',
      content: `Give a short friendly reply (2–3 sentences). User name: ${context.userName}.`,
    },
  ];

  const tiers = selectModelTier('greeting', '', 0);

  try {
    for await (const chunk of streamWithFallback(
      {
        messages,
        tenantId: context.organizationId,
        maxTokens: 256,
        temperature: 0.5,
      },
      tiers.primary,
      tiers.fallback,
    )) {
      const piece = chunk.choices?.[0]?.delta?.content;
      if (piece) controller.emit('text', piece);
    }
  } catch (e) {
    controller.emit('error', {
      code: 'greeting_failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }

  controller.emit('metadata', {
    toolsUsed: [],
    dataPoints: 0,
    responseTimeMs: Date.now() - startedAt,
    steps: 0,
    terminationReason: 'complete',
  });
  controller.emit('done', null);
}
