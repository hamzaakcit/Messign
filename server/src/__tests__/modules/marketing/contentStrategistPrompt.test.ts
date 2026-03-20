import { describe, it, expect } from 'vitest';
import { buildMarketingContentStrategistPrompt } from '../../../modules/marketing/prompts/marketingContentStrategistPrompt.js';

describe('buildMarketingContentStrategistPrompt', () => {
  it('embeds injected layers and static spec', () => {
    const p = buildMarketingContentStrategistPrompt({
      userRole: 'admin',
      productTruthMd: '## Truth\n- Feature A',
      brandVoiceMd: '## Brand\n- Tone: crisp',
    });
    expect(p).toContain('User role: admin.');
    expect(p).toContain('## Truth');
    expect(p).toContain('## Brand');
    expect(p).toContain('CONTENT_STRATEGIST');
    expect(p).toContain('marketing:product_truth_lookup');
    expect(p).toContain('marketing:validate_product_truth');
  });
});
