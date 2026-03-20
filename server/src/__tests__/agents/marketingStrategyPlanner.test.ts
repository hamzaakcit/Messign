import { describe, expect, it } from 'vitest';
import type OpenAI from 'openai';
import {
  mapStrategyPlanToParsedRoute,
  parseEmitStrategyPlanFromMessage,
  plannerShouldFallbackToLegacyRouter,
} from '../../services/ai/marketing/marketingStrategyPlanner.js';
import type { MarketingStrategyExecutionPlan } from '../../modules/marketing/prompts/v2/strategyExecutionPlan.js';

function basePlan(overrides: Partial<MarketingStrategyExecutionPlan>): MarketingStrategyExecutionPlan {
  return {
    routing: 'CONTENT_STRATEGIST',
    confidence: 80,
    steps: [],
    hitl_required: false,
    ...overrides,
  };
}

describe('plannerShouldFallbackToLegacyRouter', () => {
  it('returns true when confidence is low and routing is not CLARIFY', () => {
    expect(plannerShouldFallbackToLegacyRouter(basePlan({ confidence: 45, routing: 'CAMPAIGN_MANAGER' }))).toBe(true);
  });

  it('returns false when routing is CLARIFY even if confidence is low', () => {
    expect(
      plannerShouldFallbackToLegacyRouter(
        basePlan({ confidence: 40, routing: 'CLARIFY', clarification_question: 'Which channel?' }),
      ),
    ).toBe(false);
  });

  it('returns false when confidence is sufficient', () => {
    expect(plannerShouldFallbackToLegacyRouter(basePlan({ confidence: 72, routing: 'CONTENT_STRATEGIST' }))).toBe(false);
  });
});

describe('mapStrategyPlanToParsedRoute', () => {
  it('maps CREATIVE_DIRECTOR to CONTENT_STRATEGIST with prefix', () => {
    const p = mapStrategyPlanToParsedRoute(
      basePlan({
        routing: 'CREATIVE_DIRECTOR',
        steps: [
          { step_kind: 'draft', agent: 'creative', goal: 'Image brief for launch', constraints: [], tools_allowed: [] },
        ],
      }),
    );
    expect(p.route).toBe('CONTENT_STRATEGIST');
    expect(p.campaignContextNote).toContain('Creative Director');
    expect(p.campaignContextNote).toContain('Image brief');
  });

  it('maps ANALYTICS_AGENT to CAMPAIGN_MANAGER', () => {
    const p = mapStrategyPlanToParsedRoute(basePlan({ routing: 'ANALYTICS_AGENT' }));
    expect(p.route).toBe('CAMPAIGN_MANAGER');
    expect(p.campaignContextNote).toContain('Analytics');
  });

  it('passes NOT_MARKETING message through', () => {
    const p = mapStrategyPlanToParsedRoute(
      basePlan({ routing: 'NOT_MARKETING', not_marketing_message: 'Use Dora for HR.' }),
    );
    expect(p.route).toBe('NOT_MARKETING');
    expect(p.notMarketingMessage).toBe('Use Dora for HR.');
  });
});

describe('parseEmitStrategyPlanFromMessage', () => {
  it('parses emit_marketing_strategy_plan tool arguments', () => {
    const msg: OpenAI.ChatCompletionMessage = {
      role: 'assistant',
      refusal: null,
      content: null,
      tool_calls: [
        {
          id: 'c1',
          type: 'function',
          function: {
            name: 'emit_marketing_strategy_plan',
            arguments: JSON.stringify({
              routing: 'BOTH_CAMPAIGN_THEN_CONTENT',
              confidence: 85,
              hitl_required: true,
              steps: [{ agent: 'campaign', goal: 'Review ROI', constraints: [], tools_allowed: [] }],
            }),
          },
        },
      ],
    };
    const plan = parseEmitStrategyPlanFromMessage(msg);
    expect(plan?.routing).toBe('BOTH_CAMPAIGN_THEN_CONTENT');
    expect(plan?.confidence).toBe(85);
  });

  it('returns null for wrong tool name', () => {
    const msg: OpenAI.ChatCompletionMessage = {
      role: 'assistant',
      refusal: null,
      content: null,
      tool_calls: [{ id: 'x', type: 'function', function: { name: 'other', arguments: '{}' } }],
    };
    expect(parseEmitStrategyPlanFromMessage(msg)).toBeNull();
  });
});
