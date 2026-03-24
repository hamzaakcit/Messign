import { describe, it, expect } from 'vitest';
import {
  extractContentItems,
  parseClassificationResponse,
} from '../../../services/marketing/competitorScraper.js';
import {
  generateContentHash,
  isValidEventType,
  isValidSignificance,
  EVENT_TYPES,
  SIGNIFICANCE_LEVELS,
} from '../../../services/marketing/competitorService.js';
import {
  buildActivitySummaryPrompt,
  buildCompetitiveSummaryPrompt,
  buildTrendAnalysisPrompt,
  buildEventAnalysisPrompt,
  timeRangeToDate,
} from '../../../services/marketing/competitorAnalysisPrompts.js';
import type { Competitor, CompetitorEvent } from '../../../services/marketing/competitorService.js';

// ── Helpers ──

function makeComp(overrides: Partial<Competitor> = {}): Competitor {
  return {
    id: 'comp-e2e', organization_id: 'org-e2e', name: 'RivalCo',
    website_url: 'https://rival.co', description: 'Direct competitor',
    logo_url: null, monitor_urls: ['https://rival.co/blog'],
    monitor_email: false, monitor_social: false, industry: 'SaaS',
    tier: 'direct', active: true, last_scraped_at: null, last_scrape_summary: null, created_by: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeEvt(overrides: Partial<CompetitorEvent> = {}): CompetitorEvent {
  return {
    id: 'evt-e2e', organization_id: 'org-e2e', competitor_id: 'comp-e2e',
    event_type: 'blog_post', title: 'RivalCo Launches AI',
    summary: 'Major AI platform launch', body_text: null,
    source_url: 'https://rival.co/blog/ai-launch', image_url: null,
    tags: ['ai', 'launch'], sentiment: 'positive', significance: 'high',
    ai_analysis: null, ai_analyzed_at: null, content_hash: 'abc',
    event_date: '2026-03-20', discovered_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════

describe('E2E: Full Scraper Pipeline', () => {
  it('realistic blog page → extracted items', () => {
    const html = `
      <html><body>
        <div class="blog-list">
          <article>
            <h2><a href="/blog/ai-workflows">AI Workflows Are Here</a></h2>
            <time datetime="2026-03-18">March 18, 2026</time>
            <p>We're excited to announce our new AI workflow platform that automates everything.</p>
          </article>
          <article>
            <h2><a href="/blog/pricing-update">New Pricing Plans</a></h2>
            <time datetime="2026-03-15">March 15, 2026</time>
            <p>We've updated our pricing to better serve enterprise customers.</p>
          </article>
          <article>
            <h2><a href="/blog/series-b">Series B: $50M Raised</a></h2>
            <time datetime="2026-03-10">March 10, 2026</time>
            <p>We're thrilled to announce our Series B funding round.</p>
          </article>
        </div>
      </body></html>
    `;
    const items = extractContentItems(html, 'https://rival.co/blog');
    expect(items.length).toBe(3);
    expect(items[0].title).toBe('AI Workflows Are Here');
    expect(items[0].url).toBe('https://rival.co/blog/ai-workflows');
    expect(items[0].date).toBe('2026-03-18');
    expect(items[1].title).toBe('New Pricing Plans');
    expect(items[2].title).toContain('Series B');
  });

  it('classification produces valid event structure', () => {
    const response = JSON.stringify({
      event_type: 'product_launch',
      title: 'AI Workflows Platform',
      summary: 'RivalCo launches AI-powered workflow automation',
      tags: ['ai', 'automation', 'product'],
      sentiment: 'positive',
      significance: 'critical',
    });
    const result = parseClassificationResponse(response, 'Fallback');
    expect(result.eventType).toBe('product_launch');
    expect(result.significance).toBe('critical');
    expect(result.tags.length).toBeGreaterThan(0);
    expect(result.tags.every((t) => typeof t === 'string')).toBe(true);
  });

  it('deduplication hash is stable across runs', () => {
    const hash1 = generateContentHash('AI Workflows Are Here', 'https://rival.co/blog/ai-workflows');
    const hash2 = generateContentHash('AI Workflows Are Here', 'https://rival.co/blog/ai-workflows');
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(32);
  });
});

describe('E2E: Extraction Edge Cases', () => {
  it('handles minimalist HTML (no articles, no links)', () => {
    const html = '<html><body><p>Just a paragraph.</p></body></html>';
    const items = extractContentItems(html, 'https://x.com');
    expect(items).toHaveLength(0);
  });

  it('handles malformed HTML gracefully', () => {
    const html = '<article><h2>Unclosed tag<p>Content here';
    const items = extractContentItems(html, 'https://x.com');
    expect(Array.isArray(items)).toBe(true);
  });

  it('handles very large HTML without timeout', () => {
    const repeatedArticle = '<article><h2><a href="/post-N">Post Title Number N</a></h2><p>Content</p></article>';
    const html = Array.from({ length: 200 }, (_, i) =>
      repeatedArticle.replace(/N/g, String(i)),
    ).join('\n');
    const start = Date.now();
    const items = extractContentItems(html, 'https://x.com');
    expect(Date.now() - start).toBeLessThan(1000);
    expect(items.length).toBeGreaterThan(0);
  });

  it('RSS feed extraction works', () => {
    const rss = `<?xml version="1.0"?>
      <rss><channel>
        <item><title>RSS Post One</title><link>https://blog.rival.co/post-1</link></item>
        <item><title>RSS Post Two</title><link>https://blog.rival.co/post-2</link></item>
      </channel></rss>`;
    const items = extractContentItems(rss, 'https://blog.rival.co/feed');
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items[0].title).toBe('RSS Post One');
  });
});

describe('E2E: Analysis Prompt Quality', () => {
  it('activity summary handles mixed event types', () => {
    const events = [
      makeEvt({ event_type: 'product_launch', title: 'Launch X', significance: 'critical' }),
      makeEvt({ event_type: 'blog_post', title: 'Blog about Y' }),
      makeEvt({ event_type: 'pricing_change', title: 'New Pricing', significance: 'high' }),
      makeEvt({ event_type: 'partnership', title: 'Partner with Z' }),
    ];
    const { userPrompt } = buildActivitySummaryPrompt(makeComp(), events, 'past month');
    expect(userPrompt).toContain('Launch X');
    expect(userPrompt).toContain('product_launch');
    expect(userPrompt).toContain('pricing_change');
  });

  it('competitive summary groups by competitor correctly', () => {
    const comps = [
      makeComp({ id: 'c1', name: 'Alpha' }),
      makeComp({ id: 'c2', name: 'Beta' }),
    ];
    const events = [
      makeEvt({ competitor_id: 'c1', title: 'Alpha Event 1' }),
      makeEvt({ competitor_id: 'c1', title: 'Alpha Event 2' }),
      makeEvt({ competitor_id: 'c2', title: 'Beta Event 1' }),
    ];
    const { userPrompt } = buildCompetitiveSummaryPrompt(comps, events, 'past month');
    expect(userPrompt).toContain('Alpha');
    expect(userPrompt).toContain('2 events');
    expect(userPrompt).toContain('Beta');
  });

  it('trend analysis correctly counts tag frequencies', () => {
    const events = [
      makeEvt({ tags: ['ai', 'ml', 'automation'] }),
      makeEvt({ tags: ['ai', 'enterprise'] }),
      makeEvt({ tags: ['ai', 'pricing'] }),
      makeEvt({ tags: ['security', 'enterprise'] }),
    ];
    const { userPrompt } = buildTrendAnalysisPrompt(events, 'past quarter');
    expect(userPrompt).toContain('ai (3)');
    expect(userPrompt).toContain('enterprise (2)');
  });

  it('event analysis includes actionable structure', () => {
    const event = makeEvt({ significance: 'critical', body_text: 'Detailed announcement text...' });
    const { systemPrompt } = buildEventAnalysisPrompt(event, makeComp());
    expect(systemPrompt).toContain('What happened');
    expect(systemPrompt).toContain('Why it matters');
    expect(systemPrompt).toContain('Recommended response');
  });
});

describe('E2E: Data Integrity', () => {
  it('all 10 event types are valid', () => {
    for (const type of EVENT_TYPES) {
      expect(isValidEventType(type)).toBe(true);
    }
  });

  it('all 4 significance levels are valid', () => {
    for (const level of SIGNIFICANCE_LEVELS) {
      expect(isValidSignificance(level)).toBe(true);
    }
  });

  it('content hash handles unicode', () => {
    const hash = generateContentHash('日本語のタイトル', 'https://example.jp/post');
    expect(hash).toHaveLength(32);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('time range covers all options', () => {
    for (const range of ['last_week', 'last_month', 'last_quarter', 'last_year']) {
      const date = timeRangeToDate(range);
      expect(new Date(date).getTime()).toBeLessThan(Date.now());
    }
  });
});

describe('E2E: Classification Robustness', () => {
  it('handles LLM returning markdown-wrapped JSON', () => {
    const response = '```json\n{"event_type": "funding", "title": "Series C", "summary": "$100M raised", "tags": ["funding"], "sentiment": "positive", "significance": "critical"}\n```';
    const result = parseClassificationResponse(response, 'Fallback');
    expect(result.eventType).toBe('funding');
    expect(result.significance).toBe('critical');
  });

  it('handles empty LLM response', () => {
    const result = parseClassificationResponse('', 'Fallback Title');
    expect(result.eventType).toBe('other');
    expect(result.title).toBe('Fallback Title');
  });

  it('handles LLM returning only prose without JSON', () => {
    const result = parseClassificationResponse(
      "I'd rate this as a product launch with high significance.",
      'Original',
    );
    expect(result.eventType).toBe('other');
    expect(result.title).toBe('Original');
  });
});
