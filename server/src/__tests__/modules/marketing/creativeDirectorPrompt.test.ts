import { describe, it, expect } from 'vitest';
import { buildMarketingCreativeDirectorPrompt } from '../../../modules/marketing/prompts/marketingCreativeDirectorPrompt.js';

describe('buildMarketingCreativeDirectorPrompt', () => {
  it('includes ROLE, injections, and brief JSON shape', () => {
    const p = buildMarketingCreativeDirectorPrompt({
      userRole: 'manager',
      brandColorsMd: '#0a0a0a primary',
      organizationName: 'Acme Co',
    });
    expect(p).toContain('ROLE: Creative Director for Acme Co');
    expect(p).toContain('User role: manager.');
    expect(p).toContain('#0a0a0a');
    expect(p).toContain('brief_type');
    expect(p).toContain('creative brief');
  });
});
