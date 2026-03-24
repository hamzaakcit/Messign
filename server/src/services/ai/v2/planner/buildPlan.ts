import type OpenAI from 'openai';
import { callWithFallback, selectModelTier } from '../gateway/modelRouter.js';
import { assemblePrompt, buildPlanningPrompt } from '../prompts/assemble.js';
import type { ClassifiedRequest, Domain, ExecutionPlan, DoraContext } from '../types.js';
import { getToolIndex } from '../tools/toolSelector.js';

const CONFIDENCE_THRESHOLD = 0.45;

function parsePlanningJson(raw: string): { tools: string[] } {
  const trimmed = raw.trim();
  try {
    const m = trimmed.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(m ? m[0]! : trimmed) as { tools?: string[] };
    if (Array.isArray(parsed.tools)) return { tools: parsed.tools.filter((t) => typeof t === 'string') };
  } catch {
    /* ignore */
  }
  return { tools: [] };
}

export async function buildPlan(
  message: string,
  classified: ClassifiedRequest,
  ctx: DoraContext,
): Promise<ExecutionPlan> {
  if (classified.directIntent) {
    return { outcome: { type: 'direct', intentId: classified.directIntent } };
  }
  if (classified.flags.isKbOnly) {
    return { outcome: { type: 'kb_search' } };
  }
  if (classified.flags.isGreeting) {
    return { outcome: { type: 'greeting' } };
  }
  if (classified.flags.isWebSearch) {
    return { outcome: { type: 'web_search' } };
  }

  const needsPlanning =
    classified.domain === 'unknown' ||
    classified.confidence < CONFIDENCE_THRESHOLD ||
    classified.domain === 'conversation';

  if (!needsPlanning) {
    return {
      outcome: {
        type: 'engine',
        domain: classified.domain as Domain,
        toolNames: [],
        usedPlanning: false,
      },
    };
  }

  const index = getToolIndex();
  const indexBlock = index
    .slice(0, 120)
    .map((e) => `- ${e.name}: ${e.descriptionShort}`)
    .join('\n');

  const base = assemblePrompt(buildPlanningPrompt(ctx), ctx);
  const messages: OpenAI.ChatCompletionMessageParam[] = base.map((m) => {
    if (m.role === 'system' && typeof m.content === 'string') {
      return {
        ...m,
        content: `${m.content}\n\nReturn JSON only: {"tools":["namespace:tool",...]} using exact names from the index.`,
      };
    }
    return m;
  });
  messages.push({
    role: 'user',
    content: `User question: ${message}\n\nTool index (pick 3–5):\n${indexBlock}`,
  });

  const tiers = selectModelTier('planning', message, 0);
  let tools: string[] = [];
  try {
    const normalized = await callWithFallback(
      {
        messages,
        tenantId: ctx.organizationId,
        maxTokens: 400,
        temperature: 0.1,
        userQuery: message,
      },
      tiers.primary,
      tiers.fallback,
    );
    tools = parsePlanningJson(normalized.content ?? '{}').tools;
  } catch (e) {
    console.warn('[buildPlan] planning LLM failed — falling back to domain default tools', {
      message: e instanceof Error ? e.message : String(e),
    });
  }

  return {
    outcome: {
      type: 'engine',
      domain: classified.domain === 'unknown' ? 'analytics' : (classified.domain as Domain),
      toolNames: tools.slice(0, 5),
      usedPlanning: true,
    },
  };
}
