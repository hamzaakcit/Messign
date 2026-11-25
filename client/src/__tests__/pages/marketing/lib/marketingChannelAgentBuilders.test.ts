import { describe, it, expect } from 'vitest';
import { buildEmailVa2AgentMessage, EMAIL_LAYOUTS, validateEmailVa2AgentForm } from '@/pages/marketing/lib/marketingChannelAgentBuilders';

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

  it('adds the layout goal to the request, and nothing for the standard layout', () => {
    const base = { audience: 'Newsletter subscribers', offer: 'Webinar replay', notes: 'Soft CTA' };
    const standard = buildEmailVa2AgentMessage(base);
    expect(buildEmailVa2AgentMessage({ ...base, layout: 'standard' })).toBe(standard);
    expect(standard).not.toContain('Goal:');
    expect(buildEmailVa2AgentMessage({ ...base, layout: 'newsletter' })).toContain('**newsletter depth**');
    expect(buildEmailVa2AgentMessage({ ...base, layout: 'flash' })).toContain('**flash sale**');
    const event = buildEmailVa2AgentMessage({ ...base, layout: 'event' });
    expect(event).toContain('**event invitation**');
    expect(event).toContain('Additional notes: Soft CTA');
    expect(event.indexOf('Goal:')).toBeLessThan(event.indexOf('Additional notes:'));
  });

  it('offers each layout once, with a plain hint', () => {
    expect(EMAIL_LAYOUTS.map((l) => l.id)).toEqual(['standard', 'newsletter', 'flash', 'event']);
    for (const layout of EMAIL_LAYOUTS) expect(layout.hint.length).toBeGreaterThan(10);
  });

  it('validateEmailVa2AgentForm requires audience and offer', () => {
    expect(validateEmailVa2AgentForm({ audience: '', offer: 'ab', notes: '' })).toEqual({
      audience: 'Audience is required (at least 4 characters)',
      offer: 'Offer / topic is required (at least 4 characters)',
    });
    expect(validateEmailVa2AgentForm({ audience: 'Readers', offer: 'Book drop', notes: '' })).toEqual({});
  });
});
