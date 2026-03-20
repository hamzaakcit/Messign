/**
 * JSON shape for Marketing V2 Strategy Planner output (Deliverable 3 §3.1).
 * Used when wiring `emit_marketing_strategy_plan` (or equivalent) before the Sub-Orchestrator dispatches.
 */
import { z } from 'zod';

export const strategyRoutingEnum = z.enum([
  'CONTENT_STRATEGIST',
  'CAMPAIGN_MANAGER',
  'CREATIVE_DIRECTOR',
  'ANALYTICS_AGENT',
  'BOTH_CAMPAIGN_THEN_CONTENT',
  'CLARIFY',
  'NOT_MARKETING',
]);

export type StrategyRouting = z.infer<typeof strategyRoutingEnum>;

export const strategyStepKindEnum = z.enum(['research', 'draft', 'measure']);

export type StrategyStepKind = z.infer<typeof strategyStepKindEnum>;

export const strategyPlanStepSchema = z.object({
  /** research = gather ICP/competitor/metrics before draft; draft = produce assets; measure = evaluate or report */
  step_kind: strategyStepKindEnum.default('draft'),
  agent: z.string().min(1),
  goal: z.string().min(1),
  constraints: z.array(z.string()).default([]),
  tools_allowed: z.array(z.string()).default([]),
  memory_refs: z.array(z.string()).optional(),
});

export type StrategyPlanStep = z.infer<typeof strategyPlanStepSchema>;

export const marketingStrategyExecutionPlanSchema = z.object({
  routing: strategyRoutingEnum,
  confidence: z.number().int().min(0).max(100),
  steps: z.array(strategyPlanStepSchema).default([]),
  estimated_impact: z.string().optional(),
  hitl_required: z.boolean(),
  clarification_question: z.string().optional(),
  /** When routing is NOT_MARKETING; aligns with ParsedMarketingRoute.notMarketingMessage. */
  not_marketing_message: z.string().optional(),
});

export type MarketingStrategyExecutionPlan = z.infer<typeof marketingStrategyExecutionPlanSchema>;

/** True when any step is explicitly marked research (triggers strategy-first research mini-loop). */
export function planRequiresResearchPhase(plan: MarketingStrategyExecutionPlan): boolean {
  return plan.steps.some((s) => s.step_kind === 'research');
}

/** Parse planner JSON; throws ZodError on invalid payloads. */
export function parseMarketingStrategyExecutionPlan(
  value: unknown,
): MarketingStrategyExecutionPlan {
  return marketingStrategyExecutionPlanSchema.parse(value);
}
