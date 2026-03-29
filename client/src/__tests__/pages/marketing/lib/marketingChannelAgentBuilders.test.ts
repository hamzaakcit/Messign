import { describe, it, expect } from 'vitest';
import {
  buildLinkedInAgentMessage,
  buildXAgentMessage,
  buildBlogAgentMessage,
  buildAdsAgentMessage,
  buildEmailVa2AgentMessage,
  buildMetricsAgentMessage,
  validateLinkedInAgentForm,
  validateMetricsAgentForm,
} from '@/pages/marketing/lib/marketingChannelAgentBuilders';

describe('marketingChannelAgentBuilders', () => {
  it('buildLinkedInAgentMessage includes topic and LinkedIn constraints', () => {
    const msg = buildLinkedInAgentMessage({
      topic: 'Q2 launch',
      audience: 'SMB',
      tone: 'confident',
    });
    expect(msg).toContain('Q2 launch');
    expect(msg).toContain('SMB');
    expect(msg).toContain('LinkedIn');
    expect(msg).toContain('220 words');
  });

  it('buildXAgentMessage stays short-form oriented', () => {
    const msg = buildXAgentMessage({ topic: 'shipping update', tone: 'direct' });
    expect(msg).toContain('260 characters');
    expect(msg).toContain('shipping update');
  });

  it('buildBlogAgentMessage includes outline instructions', () => {
    const msg = buildBlogAgentMessage({ topic: 'AI ops', angle: 'how-to' });
    expect(msg).toContain('outline');
    expect(msg).toContain('AI ops');
    expect(msg).toContain('how-to');
  });

  it('buildAdsAgentMessage includes product and optional goal', () => {
    const msg = buildAdsAgentMessage({
      productTopic: 'CRM trial',
      goal: 'signups',
      platform: 'Meta',
    });
    expect(msg).toContain('CRM trial');
    expect(msg).toContain('signups');
    expect(msg).toContain('Meta');
  });

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
  });

  it('buildMetricsAgentMessage appends user focus', () => {
    const msg = buildMetricsAgentMessage({ focus: 'Compare paid vs organic last month' });
    expect(msg).toContain('ROI');
    expect(msg).toContain('Compare paid vs organic last month');
  });

  it('validateLinkedInAgentForm requires topic', () => {
    expect(Object.keys(validateLinkedInAgentForm({ topic: '', audience: '', tone: '' })).length).toBeGreaterThan(0);
    expect(
      Object.keys(validateLinkedInAgentForm({ topic: 'ok', audience: '', tone: '' })).length,
    ).toBe(0);
  });

  it('validateMetricsAgentForm requires sufficient focus', () => {
    expect(Object.keys(validateMetricsAgentForm({ focus: 'short' })).length).toBeGreaterThan(0);
    expect(Object.keys(validateMetricsAgentForm({ focus: 'Enough text here for metrics' })).length).toBe(0);
  });
});
