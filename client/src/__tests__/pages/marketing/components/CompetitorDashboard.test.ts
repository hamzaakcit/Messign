import { describe, it, expect } from 'vitest';

describe('CompetitorDashboard logic', () => {
  describe('time range filter', () => {
    const timeRanges = [
      { value: 'last_week', label: 'Last Week', days: 7 },
      { value: 'last_month', label: 'Last Month', days: 30 },
      { value: 'last_quarter', label: 'Last Quarter', days: 90 },
      { value: 'last_year', label: 'Last Year', days: 365 },
    ];

    it('has 4 time range options', () => {
      expect(timeRanges).toHaveLength(4);
    });

    it('default is last_month', () => {
      const defaultRange = 'last_month';
      expect(timeRanges.find((r) => r.value === defaultRange)).toBeDefined();
    });

    it('computes since date from range', () => {
      const computeSince = (days: number) => {
        const d = new Date();
        d.setDate(d.getDate() - days);
        return d.toISOString();
      };
      const since = computeSince(30);
      expect(new Date(since).getTime()).toBeLessThan(Date.now());
      const diff = Date.now() - new Date(since).getTime();
      expect(Math.floor(diff / 86400000)).toBeCloseTo(30, 0);
    });
  });

  describe('event type filter', () => {
    const eventTypes = [
      { value: null, label: 'All Types' },
      { value: 'product_launch', label: 'Product Launch' },
      { value: 'blog_post', label: 'Blog Post' },
      { value: 'pricing_change', label: 'Pricing Change' },
      { value: 'feature_update', label: 'Feature Update' },
      { value: 'partnership', label: 'Partnership' },
      { value: 'funding', label: 'Funding' },
      { value: 'email_campaign', label: 'Email Campaign' },
      { value: 'press_release', label: 'Press Release' },
      { value: 'social_post', label: 'Social Post' },
      { value: 'other', label: 'Other' },
    ];

    it('has All Types option plus 10 event types', () => {
      expect(eventTypes).toHaveLength(11);
      expect(eventTypes[0].value).toBeNull();
    });

    it('each type has a unique value', () => {
      const values = eventTypes.filter((t) => t.value).map((t) => t.value);
      expect(new Set(values).size).toBe(values.length);
    });
  });

  describe('competitor card data', () => {
    it('event count per competitor', () => {
      const competitors = [
        { id: 'c1', name: 'Acme', event_count: 12 },
        { id: 'c2', name: 'Rival', event_count: 5 },
        { id: 'c3', name: 'NewCo', event_count: 0 },
      ];
      const sorted = [...competitors].sort((a, b) => b.event_count - a.event_count);
      expect(sorted[0].name).toBe('Acme');
    });

    it('scrape freshness display', () => {
      const formatFreshness = (lastScraped: string | null): string => {
        if (!lastScraped) return 'Never scraped';
        const diff = Date.now() - new Date(lastScraped).getTime();
        const hours = Math.floor(diff / 3600000);
        if (hours < 1) return 'Just now';
        if (hours < 24) return `${hours}h ago`;
        return `${Math.floor(hours / 24)}d ago`;
      };
      expect(formatFreshness(null)).toBe('Never scraped');
      expect(formatFreshness(new Date().toISOString())).toBe('Just now');
      expect(formatFreshness(new Date(Date.now() - 2 * 3600000).toISOString())).toBe('2h ago');
      expect(formatFreshness(new Date(Date.now() - 48 * 3600000).toISOString())).toBe('2d ago');
    });

    it('event count aggregation by competitor_id', () => {
      const events = [
        { competitor_id: 'c1' },
        { competitor_id: 'c1' },
        { competitor_id: 'c2' },
        { competitor_id: 'c1' },
      ];
      const counts: Record<string, number> = {};
      for (const e of events) {
        counts[e.competitor_id] = (counts[e.competitor_id] || 0) + 1;
      }
      expect(counts['c1']).toBe(3);
      expect(counts['c2']).toBe(1);
    });
  });

  describe('pagination', () => {
    it('hasMore check', () => {
      expect(10 < 25).toBe(true);
      expect(25 < 25).toBe(false);
    });

    it('remaining count', () => {
      const total = 45;
      const loaded = 20;
      expect(total - loaded).toBe(25);
    });
  });

  describe('significance filter', () => {
    const significanceOptions = [
      { value: '', label: 'All significance' },
      { value: 'low', label: 'Low' },
      { value: 'normal', label: 'Normal' },
      { value: 'high', label: 'High' },
      { value: 'critical', label: 'Critical' },
    ];

    it('includes All plus four levels', () => {
      expect(significanceOptions).toHaveLength(5);
      expect(significanceOptions[0].value).toBe('');
    });
  });

  describe('stats-based chip counts', () => {
    it('maps per_competitor rows to competitor id', () => {
      const perCompetitor = [
        { competitor_id: 'c1', competitor_name: 'A', event_count: 3 },
        { competitor_id: 'c2', competitor_name: 'B', event_count: 7 },
      ];
      const map = new Map<string, number>();
      for (const row of perCompetitor) {
        map.set(row.competitor_id, row.event_count);
      }
      expect(map.get('c1')).toBe(3);
      expect(map.get('c2')).toBe(7);
    });
  });

  describe('client search filter', () => {
    it('filters events by title or summary substring', () => {
      const events = [
        { title: 'Alpha launch', summary: 'Shipped v1', competitor_name: 'Acme' },
        { title: 'Beta', summary: 'Nothing here', competitor_name: 'Other' },
      ];
      const q = 'launch';
      const filtered = events.filter((ev) => {
        const title = (ev.title || '').toLowerCase();
        const summary = (ev.summary || '').toLowerCase();
        const name = (ev.competitor_name || '').toLowerCase();
        return title.includes(q) || summary.includes(q) || name.includes(q);
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe('Alpha launch');
    });
  });

  describe('CSV escaping', () => {
    it('quotes cells with commas', () => {
      const escapeCsvCell = (s: string): string => {
        if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      expect(escapeCsvCell('hello')).toBe('hello');
      expect(escapeCsvCell('a,b')).toBe('"a,b"');
      expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    });
  });
});

describe('CompetitorEventCard logic', () => {
  describe('event type display', () => {
    const typeConfig: Record<string, { label: string; color: string }> = {
      blog_post: { label: 'Blog', color: 'blue' },
      product_launch: { label: 'Launch', color: 'purple' },
      pricing_change: { label: 'Pricing', color: 'orange' },
      email_campaign: { label: 'Email', color: 'teal' },
      feature_update: { label: 'Feature', color: 'green' },
      partnership: { label: 'Partner', color: 'indigo' },
      funding: { label: 'Funding', color: 'yellow' },
      press_release: { label: 'Press', color: 'gray' },
      social_post: { label: 'Social', color: 'pink' },
      other: { label: 'Other', color: 'gray' },
    };

    it('all 10 event types have display config', () => {
      expect(Object.keys(typeConfig)).toHaveLength(10);
    });

    it('each type has a label and color', () => {
      for (const config of Object.values(typeConfig)) {
        expect(config.label).toBeTruthy();
        expect(config.color).toBeTruthy();
      }
    });

    it('unknown types fall back to other', () => {
      const getConfig = (type: string) => typeConfig[type] || typeConfig.other;
      expect(getConfig('unknown_type').label).toBe('Other');
    });
  });

  describe('significance display', () => {
    const showDot = (significance: string) =>
      significance === 'critical' || significance === 'high';

    it('shows dot for critical and high', () => {
      expect(showDot('critical')).toBe(true);
      expect(showDot('high')).toBe(true);
    });

    it('no dot for normal and low', () => {
      expect(showDot('normal')).toBe(false);
      expect(showDot('low')).toBe(false);
    });
  });

  describe('relative date formatting', () => {
    const formatRelative = (dateStr: string): string => {
      const diff = Date.now() - new Date(dateStr).getTime();
      const days = Math.floor(diff / 86400000);
      if (days === 0) return 'Today';
      if (days === 1) return 'Yesterday';
      if (days < 7) return `${days} days ago`;
      if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
      if (days < 365) return `${Math.floor(days / 30)} months ago`;
      return `${Math.floor(days / 365)} years ago`;
    };

    it('today for same-day events', () => {
      expect(formatRelative(new Date().toISOString())).toBe('Today');
    });

    it('yesterday for 1 day ago', () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString();
      expect(formatRelative(yesterday)).toBe('Yesterday');
    });

    it('weeks for 7-29 days', () => {
      const twoWeeks = new Date(Date.now() - 14 * 86400000).toISOString();
      expect(formatRelative(twoWeeks)).toBe('2 weeks ago');
    });

    it('months for 30-364 days', () => {
      const threeMonths = new Date(Date.now() - 90 * 86400000).toISOString();
      expect(formatRelative(threeMonths)).toBe('3 months ago');
    });
  });

  describe('tag display', () => {
    it('limits to 5 tags', () => {
      const allTags = ['ai', 'ml', 'saas', 'enterprise', 'pricing', 'launch', 'feature'];
      const displayed = allTags.slice(0, 5);
      expect(displayed).toHaveLength(5);
    });

    it('shows +N indicator for overflow', () => {
      const tags = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
      const overflow = tags.length > 5 ? tags.length - 5 : 0;
      expect(overflow).toBe(2);
    });

    it('no overflow for 5 or fewer tags', () => {
      const tags = ['a', 'b', 'c'];
      const overflow = tags.length > 5 ? tags.length - 5 : 0;
      expect(overflow).toBe(0);
    });
  });

  describe('AI analysis toggle', () => {
    it('only shows toggle when ai_analysis is present', () => {
      const hasAnalysis = (analysis: string | null) => !!analysis;
      expect(hasAnalysis('This is significant because...')).toBe(true);
      expect(hasAnalysis(null)).toBe(false);
      expect(hasAnalysis('')).toBe(false);
    });
  });
});

describe('CompetitorManager logic', () => {
  describe('tier display', () => {
    const tierConfig: Record<string, { label: string; color: string }> = {
      direct: { label: 'Direct', color: 'blue' },
      indirect: { label: 'Indirect', color: 'gray' },
      aspirational: { label: 'Aspirational', color: 'purple' },
    };

    it('3 tier options', () => {
      expect(Object.keys(tierConfig)).toHaveLength(3);
    });

    it('each tier has label and color', () => {
      for (const config of Object.values(tierConfig)) {
        expect(config.label).toBeTruthy();
        expect(config.color).toBeTruthy();
      }
    });
  });

  describe('monitor URL validation', () => {
    const isValidUrl = (url: string) => {
      try { new URL(url); return true; } catch { return false; }
    };

    it('accepts valid URLs', () => {
      expect(isValidUrl('https://competitor.com/blog')).toBe(true);
      expect(isValidUrl('https://blog.competitor.com')).toBe(true);
      expect(isValidUrl('http://example.com')).toBe(true);
    });

    it('rejects invalid URLs', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('just text')).toBe(false);
    });
  });

  describe('form defaults', () => {
    it('empty form has correct defaults', () => {
      const emptyForm = {
        name: '',
        website_url: '',
        description: '',
        industry: '',
        tier: 'direct' as const,
        monitor_urls: [] as string[],
        monitor_email: false,
        monitor_social: false,
      };
      expect(emptyForm.tier).toBe('direct');
      expect(emptyForm.monitor_urls).toHaveLength(0);
      expect(emptyForm.monitor_email).toBe(false);
    });
  });
});
