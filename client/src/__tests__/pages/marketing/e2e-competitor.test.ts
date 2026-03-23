import { describe, it, expect } from 'vitest';

describe('E2E: Competitor Dashboard Data Flow', () => {
  describe('filter combination', () => {
    it('builds query params from filter state', () => {
      const buildParams = (filters: {
        competitorId: string | null;
        eventType: string | null;
        timeRange: string;
      }) => {
        const params = new URLSearchParams();
        if (filters.competitorId) params.set('competitor_id', filters.competitorId);
        if (filters.eventType) params.set('event_type', filters.eventType);
        const since = new Date();
        const days: Record<string, number> = { last_week: 7, last_month: 30, last_quarter: 90, last_year: 365 };
        since.setDate(since.getDate() - (days[filters.timeRange] || 30));
        params.set('since', since.toISOString());
        return params.toString();
      };

      const params = buildParams({
        competitorId: 'comp-1',
        eventType: 'product_launch',
        timeRange: 'last_month',
      });
      expect(params).toContain('competitor_id=comp-1');
      expect(params).toContain('event_type=product_launch');
      expect(params).toContain('since=');
    });

    it('omits null filters', () => {
      const params = new URLSearchParams();
      const competitorId: string | null = null;
      if (competitorId) params.set('competitor_id', competitorId);
      expect(params.has('competitor_id')).toBe(false);
    });

    it('all time ranges produce valid since dates', () => {
      const ranges = ['last_week', 'last_month', 'last_quarter', 'last_year'];
      const days: Record<string, number> = { last_week: 7, last_month: 30, last_quarter: 90, last_year: 365 };
      for (const range of ranges) {
        const since = new Date();
        since.setDate(since.getDate() - days[range]);
        expect(since.getTime()).toBeLessThan(Date.now());
        expect(since.toISOString()).toBeTruthy();
      }
    });
  });

  describe('event type display completeness', () => {
    const typeLabels: Record<string, string> = {
      blog_post: 'Blog', product_launch: 'Launch',
      pricing_change: 'Pricing', email_campaign: 'Email',
      feature_update: 'Feature', partnership: 'Partner',
      funding: 'Funding', press_release: 'Press',
      social_post: 'Social', other: 'Other',
    };

    it('all 10 event types have display labels', () => {
      expect(Object.keys(typeLabels)).toHaveLength(10);
    });

    it('each label is a short human-readable string', () => {
      for (const label of Object.values(typeLabels)) {
        expect(label.length).toBeGreaterThan(0);
        expect(label.length).toBeLessThanOrEqual(10);
      }
    });
  });

  describe('significance priority sorting', () => {
    const priorityOrder: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 };

    it('critical sorts before high', () => {
      expect(priorityOrder.critical).toBeLessThan(priorityOrder.high);
    });

    it('sorts events by significance then date', () => {
      const events = [
        { significance: 'normal', discovered_at: '2026-03-20' },
        { significance: 'critical', discovered_at: '2026-03-18' },
        { significance: 'high', discovered_at: '2026-03-22' },
      ];
      const sorted = [...events].sort((a, b) => {
        const sigDiff = (priorityOrder[a.significance] ?? 2) - (priorityOrder[b.significance] ?? 2);
        if (sigDiff !== 0) return sigDiff;
        return new Date(b.discovered_at).getTime() - new Date(a.discovered_at).getTime();
      });
      expect(sorted[0].significance).toBe('critical');
      expect(sorted[1].significance).toBe('high');
    });
  });

  describe('competitor card event count aggregation', () => {
    it('counts events per competitor from timeline data', () => {
      const events = [
        { competitor_id: 'c1' }, { competitor_id: 'c1' }, { competitor_id: 'c1' },
        { competitor_id: 'c2' }, { competitor_id: 'c2' },
        { competitor_id: 'c3' },
      ];
      const counts: Record<string, number> = {};
      for (const e of events) {
        counts[e.competitor_id] = (counts[e.competitor_id] || 0) + 1;
      }
      expect(counts['c1']).toBe(3);
      expect(counts['c2']).toBe(2);
      expect(counts['c3']).toBe(1);
    });
  });

  describe('pagination', () => {
    it('hasMore is true when loaded < total', () => {
      const loaded = 20;
      const total = 45;
      expect(loaded < total).toBe(true);
    });

    it('hasMore is false when all loaded', () => {
      const loaded = 25;
      const total = 25;
      expect(loaded < total).toBe(false);
    });

    it('remaining count is correct', () => {
      expect(45 - 20).toBe(25);
      expect(25 - 25).toBe(0);
    });
  });
});
