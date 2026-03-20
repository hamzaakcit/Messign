/**
 * Express augmentation (module — uses export {}).
 */

declare global {
  namespace Express {
    interface Request {
      agentTraceId?: string;
      /** Zod-validated client view state (attached by validateAIAnswerInput). */
      activeViewState?: import('../services/ai/agent/activeViewState.js').ActiveViewStateV1;
    }
  }
}

export {};
