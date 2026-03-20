import { describe, expect, it } from 'vitest';
import {
  parseMarketingStrategyExecutionPlan,
  planRequiresResearchPhase,
} from '../../../modules/marketing/prompts/v2/strategyExecutionPlan.js';

describe('marketingStrategyExecutionPlanSchema', () => {
  it('parses a minimal valid plan', () => {
    const plan = parseMarketingStrategyExecutionPlan({
      routing: 'CONTENT_STRATEGIST',
      confidence: 72,
      steps: [
        {
          agent: 'content_strategist',
          goal: 'Draft LinkedIn post',
          constraints: ['Max 3000 chars'],
          tools_allowed: ['knowledge:search_knowledge_base'],
          memory_refs: ['golden_ex_001'],
        },
      ],
      estimated_impact: 'Higher engagement on launch announcement',
      hitl_required: true,
    });
    expect(plan.routing).toBe('CONTENT_STRATEGIST');
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].step_kind).toBe('draft');
  });

  it('parses step_kind research', () => {
    const plan = parseMarketingStrategyExecutionPlan({
      routing: 'CONTENT_STRATEGIST',
      confidence: 80,
      steps: [
        {
          step_kind: 'research',
          agent: 'content_strategist',
          goal: 'Gather competitor context',
          constraints: [],
          tools_allowed: ['knowledge:search_knowledge_base'],
        },
      ],
      hitl_required: true,
    });
    expect(plan.steps[0].step_kind).toBe('research');
    expect(planRequiresResearchPhase(plan)).toBe(true);
  });

  it('planRequiresResearchPhase is false when no research step', () => {
    const plan = parseMarketingStrategyExecutionPlan({
      routing: 'CONTENT_STRATEGIST',
      confidence: 80,
      steps: [{ agent: 'x', goal: 'y', constraints: [], tools_allowed: [] }],
      hitl_required: false,
    });
    expect(planRequiresResearchPhase(plan)).toBe(false);
  });

  it('rejects invalid routing', () => {
    expect(() =>
      parseMarketingStrategyExecutionPlan({
        routing: 'INVALID',
        confidence: 50,
        hitl_required: false,
      }),
    ).toThrow();
  });

  it('parses NOT_MARKETING with optional redirect message', () => {
    const plan = parseMarketingStrategyExecutionPlan({
      routing: 'NOT_MARKETING',
      confidence: 90,
      hitl_required: false,
      not_marketing_message: 'Try Dora from the sidebar for HR.',
    });
    expect(plan.not_marketing_message).toBe('Try Dora from the sidebar for HR.');
  });
});
