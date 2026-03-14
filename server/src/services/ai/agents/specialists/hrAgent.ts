/**
 * HR Specialist Agent — Recruitment pipeline, candidates, jobs, employees
 */

import type { SpecialistAgent, AgentContext, AgentResult } from '../types.js';
import { runSpecialistLoop } from './baseSpecialist.js';

export const hrAgent: SpecialistAgent = {
  namespace: 'hr',

  async execute(
    query: string,
    context: AgentContext,
    priorContext?: string,
  ): Promise<AgentResult> {
    const doraCtx = context.doraCtx!;
    const legacyContext = context.legacyContext!;

    const result = await runSpecialistLoop(
      'hr',
      query,
      context,
      doraCtx,
      legacyContext,
      priorContext,
    );

    return {
      type: 'final_answer',
      content: result.content,
      pendingActions: result.pendingActions.length > 0 ? result.pendingActions : undefined,
    };
  },
};
