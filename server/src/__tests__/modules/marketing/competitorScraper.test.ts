import { describe, it, expect } from 'vitest';
import {
  extractContentItems,
  parseClassificationResponse,
  stripHtml,
  resolveUrl,
} from '../../../services/marketing/competitorScraper.js';
import type { ScrapeResult } from '../../../services/marketing/competitorScraper.js';

describe('stripHtml', () => {
  it('removes HTML tags', () => {
    expect(stripHtml('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
  });

  it('decodes HTML entities', () => {
    expect(stripHtml('&amp; &lt; &gt; &quot; &#39;')).toBe('& < > " \'');
  });

  it('collapses whitespace', () => {
    expect(stripHtml('Hello   \n\n   world')).toBe('Hello world');
  });

  it('handles nbsp', () => {
    expect(stripHtml('Hello&nbsp;world')).toBe('Hello world');
  });

  it('returns empty string for empty input', () => {
    expect(stripHtml('')).toBe('');
  });
});

describe('resolveUrl', () => {
  it('resolves relative URLs', () => {
    expect(resolveUrl('/blog/post-1', 'https://example.com')).toBe('https://example.com/blog/post-1');
  });

  it('returns absolute URLs unchanged', () => {
    expect(resolveUrl('https://other.com/page', 'https://example.com')).toBe('https://other.com/page');
  });

  it('handles protocol-relative URLs', () => {
    expect(resolveUrl('//cdn.example.com/img.png', 'https://example.com')).toBe('https://cdn.example.com/img.png');
  });

  it('returns href unchanged if URL construction fails', () => {
    expect(resolveUrl('not a url at all', 'also not valid')).toBe('not a url at all');
  });
});

describe('extractContentItems', () => {
  it('extracts items from <article> blocks', () => {
    const html = `
      <article>
        <h2><a href="/blog/post-1">First Post</a></h2>
        <time datetime="2026-03-20">March 20</time>
        <p>This is the first post content with some details.</p>
      </article>
      <article>
        <h2><a href="/blog/post-2">Second Post</a></h2>
        <p>Another post about things.</p>
      </article>
    `;
    const items = extractContentItems(html, 'https://example.com');
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items[0].title).toBe('First Post');
    expect(items[0].url).toBe('https://example.com/blog/post-1');
    expect(items[0].date).toBe('2026-03-20');
  });

  it('falls back to heading+link extraction when no articles', () => {
    const html = `
      <div class="post-list">
        <h2><a href="/news/update-1">Big Update Here</a></h2>
        <h3><a href="/news/minor-fix">Minor Fix Applied</a></h3>
      </div>
    `;
    const items = extractContentItems(html, 'https://example.com');
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items[0].title).toBe('Big Update Here');
  });

  it('deduplicates by title', () => {
    const html = `
      <article><h2>Same Title Here</h2></article>
      <article><h2>Same Title Here</h2></article>
      <article><h2>Different Title Here</h2></article>
    `;
    const items = extractContentItems(html, 'https://example.com');
    const titles = items.map((i) => i.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('handles RSS/Atom feed format', () => {
    const xml = `
      <feed>
        <entry>
          <title>Feed Entry One</title>
          <link href="https://example.com/entry-1"/>
        </entry>
        <entry>
          <title>Feed Entry Two</title>
          <link href="https://example.com/entry-2"/>
        </entry>
      </feed>
    `;
    const items = extractContentItems(xml, 'https://example.com/feed');
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items[0].title).toBe('Feed Entry One');
  });

  it('skips items with very short titles', () => {
    const html = `
      <article><h2>OK</h2></article>
      <article><h2>This is a valid title</h2></article>
    `;
    const items = extractContentItems(html, 'https://example.com');
    expect(items.every((i) => i.title.length >= 5)).toBe(true);
  });

  it('returns empty array for non-HTML content', () => {
    const items = extractContentItems('Just plain text with no HTML structure', 'https://example.com');
    expect(items).toHaveLength(0);
  });

  it('extracts snippet from paragraph text', () => {
    const html = `
      <article>
        <h2>Article With Paragraph</h2>
        <p>This paragraph has some meaningful content about the article topic.</p>
      </article>
    `;
    const items = extractContentItems(html, 'https://example.com');
    expect(items[0].snippet).toBeTruthy();
    expect(items[0].snippet!.length).toBeGreaterThan(0);
    expect(items[0].snippet!.length).toBeLessThanOrEqual(200);
  });

  it('handles RSS <item> elements', () => {
    const xml = `
      <rss>
        <channel>
          <item>
            <title>RSS Item Title One</title>
            <link>https://example.com/rss-1</link>
          </item>
        </channel>
      </rss>
    `;
    const items = extractContentItems(xml, 'https://example.com/rss');
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0].title).toBe('RSS Item Title One');
  });
});

describe('parseClassificationResponse', () => {
  it('parses clean JSON classification', () => {
    const response = JSON.stringify({
      event_type: 'product_launch',
      title: 'Acme launches v2',
      summary: 'Major product update with AI features',
      tags: ['product', 'ai', 'launch'],
      sentiment: 'positive',
      significance: 'high',
    });
    const result = parseClassificationResponse(response, 'Fallback Title');
    expect(result.eventType).toBe('product_launch');
    expect(result.title).toBe('Acme launches v2');
    expect(result.significance).toBe('high');
    expect(result.tags).toHaveLength(3);
  });

  it('uses fallback for invalid event_type', () => {
    const response = JSON.stringify({
      event_type: 'invalid_type',
      title: 'Some event title',
      summary: 'Summary',
      tags: [],
      sentiment: 'neutral',
      significance: 'normal',
    });
    const result = parseClassificationResponse(response, 'Fallback');
    expect(result.eventType).toBe('other');
  });

  it('truncates long title to 200 chars', () => {
    const response = JSON.stringify({
      event_type: 'blog_post',
      title: 'A'.repeat(300),
      summary: 'Short summary',
      tags: [],
      sentiment: 'neutral',
      significance: 'normal',
    });
    const result = parseClassificationResponse(response, 'Fallback');
    expect(result.title.length).toBeLessThanOrEqual(200);
  });

  it('truncates long summary to 500 chars', () => {
    const response = JSON.stringify({
      event_type: 'blog_post',
      title: 'Title',
      summary: 'S'.repeat(600),
      tags: [],
      sentiment: 'neutral',
      significance: 'normal',
    });
    const result = parseClassificationResponse(response, 'Fallback');
    expect(result.summary.length).toBeLessThanOrEqual(500);
  });

  it('limits tags to 5', () => {
    const response = JSON.stringify({
      event_type: 'blog_post',
      title: 'Title',
      summary: 'Summary',
      tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      sentiment: 'neutral',
      significance: 'normal',
    });
    const result = parseClassificationResponse(response, 'Fallback');
    expect(result.tags.length).toBeLessThanOrEqual(5);
  });

  it('handles JSON wrapped in text', () => {
    const response = 'Here is my classification:\n{"event_type": "funding", "title": "Series B", "summary": "$50M raised", "tags": ["funding"], "sentiment": "positive", "significance": "critical"}\nDone.';
    const result = parseClassificationResponse(response, 'Fallback');
    expect(result.eventType).toBe('funding');
    expect(result.significance).toBe('critical');
  });

  it('handles trailing commas in JSON', () => {
    const response = '{"event_type": "blog_post", "title": "Post Title", "summary": "Sum", "tags": ["a",], "sentiment": "neutral", "significance": "normal",}';
    const result = parseClassificationResponse(response, 'Fallback');
    expect(result.eventType).toBe('blog_post');
  });

  it('returns safe fallback on unparseable response', () => {
    const result = parseClassificationResponse('This is not JSON', 'Original Title');
    expect(result.eventType).toBe('other');
    expect(result.title).toBe('Original Title');
    expect(result.significance).toBe('normal');
    expect(result.sentiment).toBe('neutral');
  });

  it('filters non-string tags', () => {
    const response = JSON.stringify({
      event_type: 'blog_post',
      title: 'Title',
      summary: 'Sum',
      tags: ['valid', 123, null, 'also-valid'],
      sentiment: 'neutral',
      significance: 'normal',
    });
    const result = parseClassificationResponse(response, 'Fallback');
    expect(result.tags.every((t) => typeof t === 'string')).toBe(true);
    expect(result.tags).toEqual(['valid', 'also-valid']);
  });

  it('defaults empty title to fallback', () => {
    const response = JSON.stringify({
      event_type: 'blog_post',
      title: '',
      summary: 'Summary',
      tags: [],
      sentiment: 'neutral',
      significance: 'normal',
    });
    const result = parseClassificationResponse(response, 'My Fallback');
    expect(result.title).toBe('My Fallback');
  });

  it('defaults invalid sentiment to neutral', () => {
    const response = JSON.stringify({
      event_type: 'blog_post',
      title: 'Title',
      summary: 'Sum',
      tags: [],
      sentiment: 'very_positive',
      significance: 'normal',
    });
    const result = parseClassificationResponse(response, 'Fallback');
    expect(result.sentiment).toBe('neutral');
  });

  it('handles all valid event types', () => {
    const types = [
      'blog_post', 'product_launch', 'pricing_change',
      'email_campaign', 'social_post', 'press_release',
      'feature_update', 'partnership', 'funding', 'other',
    ];
    for (const type of types) {
      const response = JSON.stringify({
        event_type: type,
        title: 'Title',
        summary: 'Sum',
        tags: [],
        sentiment: 'neutral',
        significance: 'normal',
      });
      const result = parseClassificationResponse(response, 'Fallback');
      expect(result.eventType).toBe(type);
    }
  });
});

describe('ScrapeResult type', () => {
  it('tracks scrape metrics correctly', () => {
    const result: ScrapeResult = {
      competitorId: 'comp-1',
      competitorName: 'Acme',
      urlsScraped: 3,
      urlsFailed: 1,
      eventsFound: 15,
      eventsNew: 8,
      eventsDuplicate: 7,
      errors: [{ url: 'https://fail.com', error: 'timeout' }],
      durationMs: 5200,
    };
    expect(result.eventsNew + result.eventsDuplicate).toBeLessThanOrEqual(result.eventsFound);
    expect(result.urlsScraped + result.urlsFailed).toBe(4);
  });

  it('handles zero-event scrape', () => {
    const result: ScrapeResult = {
      competitorId: 'comp-2',
      competitorName: 'Empty Corp',
      urlsScraped: 1,
      urlsFailed: 0,
      eventsFound: 0,
      eventsNew: 0,
      eventsDuplicate: 0,
      errors: [],
      durationMs: 120,
    };
    expect(result.errors).toHaveLength(0);
    expect(result.eventsFound).toBe(0);
  });
});
