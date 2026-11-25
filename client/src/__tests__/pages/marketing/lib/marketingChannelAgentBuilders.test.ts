import { describe, it, expect } from 'vitest';
import { buildEmailVa2AgentMessage, validateEmailVa2AgentForm } from '@/pages/marketing/lib/marketingChannelAgentBuilders';

describe('marketingChannelAgentBuilders', () => {
  it('buildEmailVa2AgentMessage requests JSON manifest', () => {
    const msg = buildEmailVa2AgentMessage({
      audience: 'Newsletter subscribers',
      offer: 'Webinar replay',
      notes: 'Soft CTA',
    });
    expect(msg).toContain('Visual Architect');
    expect(msg).toContain('```json```');
    expect(msg).toContain('Newsletter subscribers');
    expect(msg).toContain('Webinar replay');
    expect(msg).toContain('Additional notes: Soft CTA');
  });

  it('validateEmailVa2AgentForm requires audience and offer', () => {
    expect(validateEmailVa2AgentForm({ audience: '', offer: 'ab', notes: '' })).toEqual({
      audience: 'Audience is required (at least 4 characters)',
      offer: 'Offer / topic is required (at least 4 characters)',
    });
    expect(validateEmailVa2AgentForm({ audience: 'Readers', offer: 'Book drop', notes: '' })).toEqual({});
  });
});
