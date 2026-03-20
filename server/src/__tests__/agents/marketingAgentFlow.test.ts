import { describe, it, expect } from 'vitest';
import type OpenAI from 'openai';
import {
  parseMarketingRouteFromMessage,
  marketingFlowSubagentOrder,
} from '../../services/ai/marketing/marketingAgentFlow.js';

function routeMessage(args: Record<string, unknown>): OpenAI.ChatCompletionMessage {
  return {
    role: 'assistant',
    refusal: null,
    content: null,
    tool_calls: [
      {
        id: 'call_1',
        type: 'function',
        function: {
          name: 'route_marketing_subagent',
          arguments: JSON.stringify(args),
        },
      },
    ],
  };
}

describe('parseMarketingRouteFromMessage', () => {
  it('parses CLARIFY with question', () => {
    const p = parseMarketingRouteFromMessage(
      routeMessage({ route: 'CLARIFY', clarify_question: 'Which channel?' }),
    );
    expect(p?.route).toBe('CLARIFY');
    expect(p?.clarifyQuestion).toBe('Which channel?');
  });

  it('parses BOTH_CAMPAIGN_THEN_CONTENT', () => {
    const p = parseMarketingRouteFromMessage(routeMessage({ route: 'BOTH_CAMPAIGN_THEN_CONTENT' }));
    expect(p?.route).toBe('BOTH_CAMPAIGN_THEN_CONTENT');
  });

  it('returns null for wrong tool', () => {
    const m: OpenAI.ChatCompletionMessage = {
      role: 'assistant',
      refusal: null,
      content: null,
      tool_calls: [
        {
          id: 'x',
          type: 'function',
          function: { name: 'other', arguments: '{}' },
        },
      ],
    };
    expect(parseMarketingRouteFromMessage(m)).toBeNull();
  });

  it('returns null for invalid JSON arguments', () => {
    const m: OpenAI.ChatCompletionMessage = {
      role: 'assistant',
      refusal: null,
      content: null,
      tool_calls: [
        {
          id: 'x',
          type: 'function',
          function: { name: 'route_marketing_subagent', arguments: 'not-json' },
        },
      ],
    };
    expect(parseMarketingRouteFromMessage(m)).toBeNull();
  });
});

describe('marketingFlowSubagentOrder', () => {
  it('runs campaign then content for BOTH', () => {
    expect(marketingFlowSubagentOrder('BOTH_CAMPAIGN_THEN_CONTENT')).toEqual(['campaign', 'content']);
  });

  it('single-agent routes', () => {
    expect(marketingFlowSubagentOrder('CAMPAIGN_MANAGER')).toEqual(['campaign']);
    expect(marketingFlowSubagentOrder('CONTENT_STRATEGIST')).toEqual(['content']);
    expect(marketingFlowSubagentOrder('CLARIFY')).toEqual([]);
    expect(marketingFlowSubagentOrder('NOT_MARKETING')).toEqual([]);
  });
});
