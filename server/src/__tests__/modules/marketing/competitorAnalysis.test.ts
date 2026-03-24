import { describe, it, expect } from 'vitest';
import {
  buildActivitySummaryPrompt,
  buildCompetitiveSummaryPrompt,
  buildTrendAnalysisPrompt,
  buildEventAnalysisPrompt,
  timeRangeToDate,
  formatTimeRange,
} from '../../../services/marketing/competitorAnalysisPrompts.js';
import type { CompetitorEvent, Competitor } from '../../../services/marketing/competitorService.js';

function makeCompetitor(overrides: Partial<Competitor> = {}): Competitor {
  return {
    id: 'comp-1',
    organization_id: 'org-1',
    name: 'Acme Corp',
    website_url: 'https://acme.com',
    description: 'A rival',
    logo_url: null,
    monitor_urls: [],
    monitor_email: false,
    monitor_social: false,
    industry: 'SaaS',
    tier: 'direct',
    active: true,
    last_scraped_at: null,
    last_scrape_summary: null,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeEvent(overrides: Partial<CompetitorEvent> = {}): CompetitorEvent {
  return {
    id: 'evt-1',
    organization_id: 'org-1',
    competitor_id: 'comp-1',
    event_type: 'blog_post',
    title: 'New Blog Post',
    summary: 'Acme writes about AI workflows',
    body_text: null,
    source_url: 'https://acme.com/blog/post-1',
    image_url: null,
    tags: ['ai', 'workflows'],
    sentiment: 'positive',
    significance: 'normal',
    ai_analysis: null,
    ai_analyzed_at: null,
    content_hash: 'abc123',
    event_date: '2026-03-20',
    discovered_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('timeRangeToDate', () => {
  it('last_week returns ~7 days ago', () => {
    const date = new Date(timeRangeToDate('last_week'));
    const daysAgo = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
    expect(daysAgo).toBeCloseTo(7, 0);
  });

  it('last_month returns ~30 days ago', () => {
    const date = new Date(timeRangeToDate('last_month'));
    const daysAgo = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
    expect(daysAgo).toBeCloseTo(30, 0);
  });

  it('last_quarter returns ~90 days ago', () => {
    const date = new Date(timeRangeToDate('last_quarter'));
    const daysAgo = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
    expect(daysAgo).toBeCloseTo(90, 0);
  });

  it('last_year returns ~365 days ago', () => {
    const date = new Date(timeRangeToDate('last_year'));
    const daysAgo = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
    expect(daysAgo).toBeCloseTo(365, 0);
  });

  it('unknown range defaults to last_month', () => {
    const date = new Date(timeRangeToDate('unknown_value'));
    const daysAgo = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
    expect(daysAgo).toBeCloseTo(30, 0);
  });

  it('returns valid ISO string', () => {
    const iso = timeRangeToDate('last_week');
    expect(() => new Date(iso)).not.toThrow();
    expect(new Date(iso).toISOString()).toBe(iso);
  });
});

describe('formatTimeRange', () => {
  it('maps all ranges to display strings', () => {
    expect(formatTimeRange('last_week')).toBe('past week');
    expect(formatTimeRange('last_month')).toBe('past month');
    expect(formatTimeRange('last_quarter')).toBe('past quarter');
    expect(formatTimeRange('last_year')).toBe('past year');
  });

  it('defaults to past month for unknown', () => {
    expect(formatTimeRange('unknown')).toBe('past month');
  });
});

describe('buildActivitySummaryPrompt', () => {
  it('includes competitor name and events', () => {
    const comp = makeCompetitor({ name: 'Acme Corp' });
    const events = [
      makeEvent({ title: 'AI Launch', event_type: 'product_launch', event_date: '2026-03-15' }),
      makeEvent({ title: 'Pricing Update', event_type: 'pricing_change', event_date: '2026-03-10' }),
    ];
    const { systemPrompt, userPrompt } = buildActivitySummaryPrompt(comp, events, 'past month');
    expect(userPrompt).toContain('Acme Corp');
    expect(userPrompt).toContain('AI Launch');
    expect(userPrompt).toContain('Pricing Update');
    expect(userPrompt).toContain('product_launch');
    expect(systemPrompt).toContain('competitive intelligence');
  });

  it('handles empty events', () => {
    const { userPrompt } = buildActivitySummaryPrompt(makeCompetitor(), [], 'past week');
    expect(userPrompt).toContain('No events found');
  });

  it('limits events to 20 in prompt', () => {
    const events = Array.from({ length: 30 }, (_, i) =>
      makeEvent({ title: `Event ${i}` }),
    );
    const { userPrompt } = buildActivitySummaryPrompt(makeCompetitor(), events, 'past month');
    const eventLines = userPrompt.split('\n').filter((l) => l.startsWith('- ['));
    expect(eventLines.length).toBeLessThanOrEqual(20);
  });

  it('includes industry and tier from competitor profile', () => {
    const comp = makeCompetitor({ industry: 'FinTech', tier: 'aspirational' });
    const { userPrompt } = buildActivitySummaryPrompt(comp, [makeEvent()], 'past month');
    expect(userPrompt).toContain('FinTech');
    expect(userPrompt).toContain('aspirational');
  });

  it('includes event summaries when available', () => {
    const events = [makeEvent({ summary: 'Major product redesign announced' })];
    const { userPrompt } = buildActivitySummaryPrompt(makeCompetitor(), events, 'past month');
    expect(userPrompt).toContain('Major product redesign announced');
  });

  it('uses discovered_at when event_date is null', () => {
    const events = [makeEvent({ event_date: null, discovered_at: '2026-03-18T10:00:00Z' })];
    const { userPrompt } = buildActivitySummaryPrompt(makeCompetitor(), events, 'past month');
    expect(userPrompt).toContain('2026-03-18');
  });
});

describe('buildCompetitiveSummaryPrompt', () => {
  it('groups events by competitor', () => {
    const competitors = [
      makeCompetitor({ id: 'c1', name: 'Acme' }),
      makeCompetitor({ id: 'c2', name: 'Rival' }),
    ];
    const events = [
      makeEvent({ competitor_id: 'c1', title: 'Acme Event' }),
      makeEvent({ competitor_id: 'c2', title: 'Rival Event' }),
    ];
    const { userPrompt } = buildCompetitiveSummaryPrompt(competitors, events, 'past month');
    expect(userPrompt).toContain('Acme');
    expect(userPrompt).toContain('Rival');
  });

  it('handles no events', () => {
    const { userPrompt } = buildCompetitiveSummaryPrompt([makeCompetitor()], [], 'past month');
    expect(userPrompt).toContain('No competitor activity');
  });

  it('system prompt includes strategic structure', () => {
    const { systemPrompt } = buildCompetitiveSummaryPrompt([], [], 'past month');
    expect(systemPrompt).toContain('Threats');
    expect(systemPrompt).toContain('Opportunities');
    expect(systemPrompt).toContain('Recommendation');
  });

  it('filters out competitors with zero events', () => {
    const competitors = [
      makeCompetitor({ id: 'c1', name: 'Active' }),
      makeCompetitor({ id: 'c2', name: 'Dormant' }),
    ];
    const events = [makeEvent({ competitor_id: 'c1' })];
    const { userPrompt } = buildCompetitiveSummaryPrompt(competitors, events, 'past month');
    expect(userPrompt).toContain('Active');
    expect(userPrompt).not.toContain('Dormant');
  });

  it('highlights high-significance events', () => {
    const competitors = [makeCompetitor({ id: 'c1', name: 'Acme' })];
    const events = [
      makeEvent({ competitor_id: 'c1', title: 'Big Launch', significance: 'critical', summary: 'New platform' }),
      makeEvent({ competitor_id: 'c1', title: 'Blog Post', significance: 'low' }),
    ];
    const { userPrompt } = buildCompetitiveSummaryPrompt(competitors, events, 'past month');
    expect(userPrompt).toContain('Big Launch');
    expect(userPrompt).toContain('New platform');
  });
});

describe('buildTrendAnalysisPrompt', () => {
  it('aggregates tags into top topics', () => {
    const events = [
      makeEvent({ tags: ['ai', 'automation'] }),
      makeEvent({ tags: ['ai', 'pricing'] }),
      makeEvent({ tags: ['ai', 'enterprise'] }),
    ];
    const { userPrompt } = buildTrendAnalysisPrompt(events, 'past quarter');
    expect(userPrompt).toContain('ai (3)');
  });

  it('shows event type breakdown', () => {
    const events = [
      makeEvent({ event_type: 'blog_post' }),
      makeEvent({ event_type: 'blog_post' }),
      makeEvent({ event_type: 'product_launch' }),
    ];
    const { userPrompt } = buildTrendAnalysisPrompt(events, 'past month');
    expect(userPrompt).toContain('blog_post: 2');
    expect(userPrompt).toContain('product_launch: 1');
  });

  it('highlights significant events', () => {
    const events = [
      makeEvent({ title: 'Big Launch', significance: 'critical' }),
      makeEvent({ title: 'Minor Post', significance: 'low' }),
    ];
    const { userPrompt } = buildTrendAnalysisPrompt(events, 'past month');
    expect(userPrompt).toContain('Big Launch');
  });

  it('handles events with no tags', () => {
    const events = [makeEvent({ tags: [] })];
    const { userPrompt } = buildTrendAnalysisPrompt(events, 'past month');
    expect(userPrompt).toContain('none tagged');
  });

  it('sorts tags by frequency', () => {
    const events = [
      makeEvent({ tags: ['b', 'a'] }),
      makeEvent({ tags: ['a', 'c'] }),
      makeEvent({ tags: ['a', 'b'] }),
    ];
    const { userPrompt } = buildTrendAnalysisPrompt(events, 'past month');
    const tagsLine = userPrompt.split('\n').find((l) => l.startsWith('Top topics'));
    expect(tagsLine).toBeTruthy();
    expect(tagsLine!.indexOf('a (3)')).toBeLessThan(tagsLine!.indexOf('b (2)'));
  });

  it('includes event count', () => {
    const events = [makeEvent(), makeEvent(), makeEvent()];
    const { userPrompt } = buildTrendAnalysisPrompt(events, 'past month');
    expect(userPrompt).toContain('3 competitor events');
  });

  it('system prompt requests data-driven analysis', () => {
    const { systemPrompt } = buildTrendAnalysisPrompt([], 'past month');
    expect(systemPrompt).toContain('Emerging Trends');
    expect(systemPrompt).toContain('Market Shifts');
    expect(systemPrompt).toContain('Technology Trends');
  });
});

describe('buildEventAnalysisPrompt', () => {
  it('includes event details and competitor context', () => {
    const event = makeEvent({
      title: 'Acme Launches AI Platform',
      event_type: 'product_launch',
      significance: 'critical',
      body_text: 'Acme announced their new AI platform today...',
    });
    const comp = makeCompetitor({ name: 'Acme', industry: 'SaaS', tier: 'direct' });
    const { userPrompt, systemPrompt } = buildEventAnalysisPrompt(event, comp);

    expect(userPrompt).toContain('Acme');
    expect(userPrompt).toContain('AI Platform');
    expect(userPrompt).toContain('critical');
    expect(userPrompt).toContain('direct competitor');
    expect(systemPrompt).toContain('Recommended response');
  });

  it('truncates long body_text to 2000 chars', () => {
    const event = makeEvent({ body_text: 'A'.repeat(5000) });
    const { userPrompt } = buildEventAnalysisPrompt(event, makeCompetitor());
    expect(userPrompt.length).toBeLessThan(6000);
  });

  it('handles missing body_text', () => {
    const event = makeEvent({ body_text: null });
    const { userPrompt } = buildEventAnalysisPrompt(event, makeCompetitor());
    expect(userPrompt).not.toContain('Full text:');
  });

  it('uses event_date when available', () => {
    const event = makeEvent({ event_date: '2026-03-15' });
    const { userPrompt } = buildEventAnalysisPrompt(event, makeCompetitor());
    expect(userPrompt).toContain('2026-03-15');
  });

  it('falls back to discovered_at when event_date is null', () => {
    const event = makeEvent({ event_date: null, discovered_at: '2026-03-18T10:00:00Z' });
    const { userPrompt } = buildEventAnalysisPrompt(event, makeCompetitor());
    expect(userPrompt).toContain('2026-03-18');
  });

  it('handles missing industry gracefully', () => {
    const comp = makeCompetitor({ industry: null as unknown as string });
    const { userPrompt } = buildEventAnalysisPrompt(makeEvent(), comp);
    expect(userPrompt).toContain('our market');
  });
});
