/**
 * Support Specialist Agent
 *
 * Isolated context window with ONLY support tools.
 * Escalates to complex tier for multi-step reasoning.
 */
import type OpenAI from 'openai';
import { callModelSafe } from '../../gateway.js';
import { getModulePrompt } from '../../../../modules/registry.js';
import { getFullToolDefinition, executeTool } from '../../toolRegistry.js';
import { toolIndex } from '../../tools/toolIndex.js';
import { classifyActionRisk } from '../governance.js';
import type { AgentContext, AgentResult, SpecialistAgent } from '../types.js';
import type { ToolContext } from '../../types.js';

const MAX_SPECIALIST_STEPS = 4;

function buildToolContext(context: AgentContext): ToolContext {
  return {
    userId: context.userId,
    userRole: context.userRoles[0] ?? 'employee',
    organizationId: context.tenantId,
  };
}

export const supportAgent: SpecialistAgent = {
  namespace: 'support',

  async execute(query: string, context: AgentContext, priorContext?: string): Promise<AgentResult> {
    const supportTools: object[] = [];
    for (const [name, meta] of toolIndex) {
      if (meta.namespace !== 'support') continue;
      if (meta.requiredRoles && meta.requiredRoles.length > 0 && !meta.requiredRoles.some((r) => context.userRoles.includes(r))) {
        continue;
      }
      const fullDef = getFullToolDefinition(name);
      if (fullDef) supportTools.push(fullDef.llmSchema);
    }

    const systemPrompt = getModulePrompt('support', context.userRoles[0] ?? 'user') ?? '';

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ];

    if (priorContext) {
      messages.push({ role: 'system', content: `Context from prior analysis:\n${priorContext}` });
    }

    messages.push({ role: 'user', content: query });

    let tokensUsed = { input: 0, output: 0 };
    let toolCallsUsed = 0;
    const toolCtx = buildToolContext(context);

    for (let step = 0; step < MAX_SPECIALIST_STEPS; step++) {
      const tier = step === 0 ? 'balanced' : 'complex';

      const response = await callModelSafe({
        tier,
        tenantId: context.tenantId,
        messages,
        tools: supportTools.length > 0 ? (supportTools as OpenAI.ChatCompletionTool[]) : undefined,
      });

      tokensUsed.input += response.usage?.prompt_tokens ?? 0;
      tokensUsed.output += response.usage?.completion_tokens ?? 0;

      const choice = response.choices?.[0];
      if (!choice?.message) {
        return {
          type: 'final_answer',
          content: 'I encountered an error processing your request. Please try again.',
          toolCallsUsed,
          tokensUsed,
        };
      }

      const toolCalls = choice.message.tool_calls;
      if (choice.finish_reason === 'tool_calls' && toolCalls && toolCalls.length > 0) {
        const standardCalls = toolCalls.filter(
          (tc): tc is typeof tc & { type: 'function'; function: { name: string; arguments: string } } =>
            tc.type === 'function' && 'function' in tc && tc.function != null,
        );

        messages.push(choice.message);

        for (const tc of standardCalls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
          } catch {
            args = {};
          }
          toolCallsUsed++;

          const risk = classifyActionRisk(tc.function.name, args);

          if (risk === 'irreversible' || risk === 'cross_module') {
            return {
              type: 'needs_approval',
              approvalRequest: {
                actionType: tc.function.name,
                riskLevel: risk,
                description: `${tc.function.name}(${JSON.stringify(args)})`,
                payload: args,
                expiresAt: new Date(Date.now() + 30 * 60 * 1000),
              },
              toolCallsUsed,
              tokensUsed,
            };
          }

          const result = await executeTool(tc.function.name, args, toolCtx);

          const toolContent = result.summary || JSON.stringify(result.data ?? {});
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: toolContent.slice(0, 8000),
          });
        }
      } else {
        return {
          type: 'final_answer',
          content: choice.message.content ?? '',
          toolCallsUsed,
          tokensUsed,
        };
      }
    }

    return {
      type: 'final_answer',
      content: 'I reached the maximum analysis steps. Here is what I found so far based on the data above.',
      toolCallsUsed,
      tokensUsed,
    };
  },
};
