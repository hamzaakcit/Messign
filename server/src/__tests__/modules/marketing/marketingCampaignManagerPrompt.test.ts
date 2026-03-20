import { describe, it, expect } from 'vitest';
import {
  buildMarketingCampaignManagerPrompt,
  getMarketingCampaignManagerSystemPrompt,
} from '../../../modules/marketing/prompts/marketingCampaignManagerPrompt.js';

describe('buildMarketingCampaignManagerPrompt', () => {
  it('includes GTM, confirmation protocol, and real tool names', () => {
    const p = buildMarketingCampaignManagerPrompt({ userRole: 'manager' });
    expect(p).toContain('User role: manager.');
    expect(p).toContain('sales-led GTM');
    expect(p).toContain('**Never** auto-create');
    expect(p).toContain('marketing:get_campaign_performance');
    expect(p).toContain('marketing:get_marketing_roi');
    expect(p).toContain('marketing:suggest_content_topics');
    expect(p).toContain('marketing:create_campaign');
  });

  it('matches getMarketingCampaignManagerSystemPrompt', () => {
    expect(getMarketingCampaignManagerSystemPrompt('admin')).toBe(buildMarketingCampaignManagerPrompt({ userRole: 'admin' }));
  });
});
