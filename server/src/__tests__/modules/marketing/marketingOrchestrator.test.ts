import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../services/ai/llmGateway.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/ai/llmGateway.js')>();
  return {
    ...actual,
    generateResponse: vi.fn(),
  };
});

import { generateResponse, LLMGatewayError } from '../../../services/ai/llmGateway.js';
import * as orchestrator from '../../../services/ai/marketing/marketingOrchestrator.js';

const ws = 'workspace-ws-1';
const session = 'session-s1';

describe('marketingRouteOutputSchema', () => {
  it('accepts minimal valid router output', () => {
    const r = orchestrator.marketingRouteOutputSchema.safeParse({
      route: 'NONE',
      reasoning: 'Not marketing.',
      extracted_parameters: {},
    });
    expect(r.success).toBe(true);
  });
});

describe('routeMarketingRequest (Phase 1 matrix)', () => {
  beforeEach(() => {
    vi.mocked(generateResponse).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('RT-01 (Content Only): routes to CONTENT_STRATEGIST', async () => {
    vi.mocked(generateResponse).mockResolvedValue({
      content: JSON.stringify({
        route: 'CONTENT_STRATEGIST',
        reasoning: 'User asked for a LinkedIn post about a product feature.',
        extracted_parameters: { channel: 'linkedin', content_format: 'post' },
      }),
      toolCalls: [],
      usage: {},
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
    });

    const result = await orchestrator.routeMarketingRequest(
      'Write a LinkedIn post about our new AI feature.',
      ws,
      session,
    );

    expect(result.success).toBe(true);
    expect(result.route).toBe('CONTENT_STRATEGIST');
    expect(result.content?.status).toBe('stub_completed');
  });

  it('RT-02 (Campaign Only): routes to CAMPAIGN_MANAGER', async () => {
    vi.mocked(generateResponse).mockResolvedValue({
      content: JSON.stringify({
        route: 'CAMPAIGN_MANAGER',
        reasoning: 'User wants a retention campaign with a defined budget.',
        extracted_parameters: { budget: '$5k', campaign_name: 'Q3 retention' },
      }),
      toolCalls: [],
      usage: {},
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
    });

    const result = await orchestrator.routeMarketingRequest(
      'Set up a Q3 retention campaign with a $5k budget.',
      ws,
      session,
    );

    expect(result.success).toBe(true);
    expect(result.route).toBe('CAMPAIGN_MANAGER');
    expect(result.campaign?.campaignId).toMatch(/^stub-/);
  });

  it('RT-03 (Complex Handoff): BOTH and Campaign Manager runs before Content', async () => {
    vi.mocked(generateResponse).mockResolvedValue({
      content: JSON.stringify({
        route: 'BOTH',
        reasoning: 'Launch plan plus teaser emails require campaign then copy.',
        extracted_parameters: { campaign_name: 'launch', content_format: 'email' },
      }),
      toolCalls: [],
      usage: {},
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
    });

    const callOrder: string[] = [];
    const result = await orchestrator.routeMarketingRequest(
      'Plan a launch campaign for next month and write the first two teaser emails.',
      ws,
      session,
      {
        async executeCampaignWorkflow() {
          callOrder.push('campaign');
          return { campaignId: 'c-rt03', contextSummary: 'launch context' };
        },
        async executeContentWorkflow() {
          callOrder.push('content');
          return { status: 'stub_completed', extractedSnapshot: {} };
        },
      },
    );

    expect(result.success).toBe(true);
    expect(result.route).toBe('BOTH');
    expect(callOrder).toEqual(['campaign', 'content']);
  });

  it('RT-04 (Out of Bounds): routes to NONE', async () => {
    vi.mocked(generateResponse).mockResolvedValue({
      content: JSON.stringify({
        route: 'NONE',
        reasoning: 'PTO is an HR request, not marketing.',
        extracted_parameters: {},
      }),
      toolCalls: [],
      usage: {},
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
    });

    const result = await orchestrator.routeMarketingRequest('Can you approve my PTO request?', ws, session);

    expect(result.success).toBe(true);
    expect(result.route).toBe('NONE');
    expect(result.assistantMessage).toMatch(/Dora/i);
  });
});

describe('routeMarketingRequest (safe fallback)', () => {
  beforeEach(() => {
    vi.mocked(generateResponse).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to safe state on malformed JSON', async () => {
    vi.mocked(generateResponse).mockResolvedValue({
      content: 'this is not json',
      toolCalls: [],
      usage: {},
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
    });

    const result = await orchestrator.routeMarketingRequest('hello', ws, session);
    expect(result.success).toBe(false);
    expect(result.route).toBe('NONE');
    expect(result.assistantMessage).toBeDefined();
  });

  it('defaults to safe state on API timeout', async () => {
    vi.mocked(generateResponse).mockRejectedValue(new LLMGatewayError('timed out', 'timeout'));

    const result = await orchestrator.routeMarketingRequest('hello', ws, session);
    expect(result.success).toBe(false);
    expect(result.route).toBe('NONE');
    expect(result.error).toMatch(/timed out/i);
  });
});
