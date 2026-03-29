import { describe, it, expect } from 'vitest';
import { inferMarketingContentChannel } from '../../../services/ai/marketing/marketingAgentOrchestrator.js';

describe('inferMarketingContentChannel', () => {
  it('detects email-related phrasing', () => {
    expect(inferMarketingContentChannel('Write a drip sequence for our subscribers')).toBe('email');
    expect(inferMarketingContentChannel('Weekly newsletter for B2B')).toBe('email');
    expect(inferMarketingContentChannel('EDM for Black Friday')).toBe('email');
    expect(inferMarketingContentChannel('Klaviyo-style promo for the list')).toBe('email');
  });

  it('still defaults to linkedin for generic marketing ask', () => {
    expect(inferMarketingContentChannel('Write a LinkedIn post about our launch')).toBe('linkedin');
  });
});
