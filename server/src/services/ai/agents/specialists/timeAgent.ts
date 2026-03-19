/**
 * Time Specialist Agent — Time entries, utilization, allocation
 */

import type { SpecialistAgent, AgentContext, AgentResult } from '../types.js';
import { runSpecialistLoop } from './baseSpecialist.js';

export const timeAgent: SpecialistAgent = {
  namespace: 'time',

  async execute(query: string, context: AgentContext, priorContext?: string): Promise<AgentResult> {
    const doraCtx = context.doraCtx!;
    const legacyContext = context.legacyContext!;
    const result = await runSpecialistLoop('time', query, context, doraCtx, legacyContext, priorContext);
    return {
      type: 'final_answer',
      content: result.content,
      pendingActions: result.pendingActions.length > 0 ? result.pendingActions : undefined,
      toolObservations: result.toolObservations,
    };
  },
};
