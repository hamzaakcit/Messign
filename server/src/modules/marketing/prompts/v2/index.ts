/**
 * Marketing Module V2 — Deliverable 3 prompts (revised system prompts).
 *
 * §3.1 Strategy Planner is implemented here; §3.2–3.7 remain in the architecture doc
 * until wired (some overlap with existing `marketingSubOrchestratorPrompt` / specialist prompts).
 */
export {
  buildMarketingStrategyPlannerSystemPrompt,
  STRATEGY_PLANNER_ROUTING_VALUES,
} from './marketingStrategyPlannerPrompt.js';
export type { MarketingStrategyPlannerPromptInput } from './marketingStrategyPlannerPrompt.js';
export {
  marketingStrategyExecutionPlanSchema,
  parseMarketingStrategyExecutionPlan,
  strategyPlanStepSchema,
  strategyRoutingEnum,
} from './strategyExecutionPlan.js';
export type {
  MarketingStrategyExecutionPlan,
  StrategyPlanStep,
  StrategyRouting,
} from './strategyExecutionPlan.js';
