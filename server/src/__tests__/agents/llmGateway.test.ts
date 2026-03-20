import { describe, it, expect } from 'vitest';
import { LLMGatewayError, LLM_TIER } from '../../services/ai/llmGateway.js';

describe('LLMGatewayError', () => {
  it('carries code and optional status', () => {
    const e = new LLMGatewayError('rate limited', 'rate_limit', { statusCode: 429 });
    expect(e.code).toBe('rate_limit');
    expect(e.statusCode).toBe(429);
    expect(e.name).toBe('LLMGatewayError');
  });
});

describe('LLM_TIER', () => {
  it('exposes complex and fast', () => {
    expect(LLM_TIER.COMPLEX).toBe('complex');
    expect(LLM_TIER.FAST).toBe('fast');
  });
});
