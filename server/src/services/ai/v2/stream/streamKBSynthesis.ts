import type OpenAI from 'openai';
import { executeTool } from '../../toolRegistry.js';
import { formatForLLM, FORMAT_PRESETS } from '../context/formatForLLM.js';
import { toLegacyToolContext } from '../context/resolveContext.js';
import { selectModelTier, streamWithFallback } from '../gateway/modelRouter.js';
import { assemblePrompt, buildKBSynthesisPrompt } from '../prompts/assemble.js';
import type { DoraContext } from '../types.js';
import type { StreamController } from './StreamController.js';
import { documentsFromKnowledgeSearchData } from '../../tools/knowledgeSearchAggregates.js';

export async function streamKBSynthesis(params: {
  controller: StreamController;
  context: DoraContext;
  userQuery: string;
  startedAt: number;
}): Promise<void> {
  const { controller, context, userQuery, startedAt } = params;
  const legacy = toLegacyToolContext(context);
  const kb = await executeTool('knowledge:search_knowledge_base', { query: userQuery }, legacy);
  const kbText = formatForLLM(kb, FORMAT_PRESETS.kbContext);

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    ...assemblePrompt(buildKBSynthesisPrompt(context), context),
    {
      role: 'user',
      content: `Question:\n${userQuery}\n\nKnowledge retrieval:\n${kbText}`,
    },
  ];

  const tiers = selectModelTier('kb', userQuery, 0);

  try {
    for await (const chunk of streamWithFallback(
      {
        messages,
        tenantId: context.organizationId,
        maxTokens: 2048,
        temperature: 0.25,
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
      code: 'kb_synthesis_failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }

  controller.emit('metadata', {
    toolsUsed: ['knowledge:search_knowledge_base'],
    dataPoints: kb.success && kb.data != null ? documentsFromKnowledgeSearchData(kb.data).length : 0,
    responseTimeMs: Date.now() - startedAt,
    steps: 1,
    terminationReason: 'complete',
  });
  controller.emit('done', null);
}
