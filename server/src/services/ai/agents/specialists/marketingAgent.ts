/**
 * Marketing Specialist Agent — Sub-orchestrator → content strategist / campaign manager
 */

import type { SpecialistAgent, AgentContext, AgentResult } from '../types.js';
import { runMarketingSubOrchestratorFlow } from '../../marketing/marketingAgentFlow.js';

export const marketingAgent: SpecialistAgent = {
  namespace: 'marketing',

  async execute(
    query: string,
    context: AgentContext,
    priorContext?: string,
  ): Promise<AgentResult> {
    const doraCtx = context.doraCtx!;
    const legacyContext = context.legacyContext!;

    const path = doraCtx.page.currentPath ?? '';
    const forceMarketingContext =
      typeof path === 'string' && path.startsWith('/marketing/agent');

    const result = await runMarketingSubOrchestratorFlow({
      query,
      agentContext: context,
      doraCtx,
      legacyContext,
      priorContext,
      history: [],
      forceMarketingContext,
    });

    return {
      type: 'final_answer',
      content: result.content,
      pendingActions: result.pendingActions.length > 0 ? result.pendingActions : undefined,
      toolObservations: result.toolObservations,
    };
  },
};
