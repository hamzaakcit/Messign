import { describe, it, expect } from 'vitest';
import { buildMarketingAnalyticsAgentPrompt } from '../../../modules/marketing/prompts/marketingAnalyticsAgentPrompt.js';

describe('buildMarketingAnalyticsAgentPrompt', () => {
  it('includes ROLE, read-only rules, and marketing metric tools', () => {
    const p = buildMarketingAnalyticsAgentPrompt({
      userRole: 'manager',
      organizationName: 'Acme Co',
    });
    expect(p).toContain('ROLE: Marketing Analytics Agent for Acme Co');
    expect(p).toContain('marketing:get_campaign_performance');
    expect(p).toContain('marketing:get_marketing_roi');
    expect(p).toContain('only read');
  });
});
