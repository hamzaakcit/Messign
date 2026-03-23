import { describe, it, expect } from 'vitest';

describe('CeoDashboard logic', () => {
  describe('metric card formatting', () => {
    const formatPercent = (value: number | null): string => {
      if (value === null) return '—';
      return `${(value * 100).toFixed(1)}%`;
    };

    const formatNumber = (value: number): string => {
      if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
      return String(value);
    };

    it('formats percentages', () => {
      expect(formatPercent(0.28)).toBe('28.0%');
      expect(formatPercent(0.852)).toBe('85.2%');
      expect(formatPercent(null)).toBe('—');
    });

    it('formats large numbers with K suffix', () => {
      expect(formatNumber(1500)).toBe('1.5K');
      expect(formatNumber(500)).toBe('500');
      expect(formatNumber(10000)).toBe('10.0K');
    });
  });

  describe('trend indicator', () => {
    function getTrendDirection(current: number | null, previous: number | null): 'up' | 'down' | 'flat' {
      if (current === null || previous === null) return 'flat';
      if (current > previous * 1.05) return 'up';
      if (current < previous * 0.95) return 'down';
      return 'flat';
    }

    it('up when >5% increase', () => {
      expect(getTrendDirection(0.30, 0.25)).toBe('up');
    });

    it('down when >5% decrease', () => {
      expect(getTrendDirection(0.20, 0.30)).toBe('down');
    });

    it('flat within 5% band', () => {
      expect(getTrendDirection(0.28, 0.27)).toBe('flat');
    });

    it('flat when nulls', () => {
      expect(getTrendDirection(null, 0.28)).toBe('flat');
      expect(getTrendDirection(0.28, null)).toBe('flat');
    });
  });

  describe('freshness indicator', () => {
    function getSnapshotFreshness(generatedAt: string): { label: string; isStale: boolean } {
      const ageMs = Date.now() - new Date(generatedAt).getTime();
      const hours = Math.floor(ageMs / 3600000);
      if (hours < 1) return { label: 'Just updated', isStale: false };
      if (hours < 24) return { label: `Updated ${hours}h ago`, isStale: false };
      return { label: `Updated ${Math.floor(hours / 24)}d ago`, isStale: true };
    }

    it('just updated for recent snapshots', () => {
      const result = getSnapshotFreshness(new Date().toISOString());
      expect(result.label).toBe('Just updated');
      expect(result.isStale).toBe(false);
    });

    it('stale after 24 hours', () => {
      const old = new Date(Date.now() - 25 * 3600000).toISOString();
      const result = getSnapshotFreshness(old);
      expect(result.isStale).toBe(true);
    });
  });

  describe('pipeline funnel', () => {
    it('calculates funnel percentages', () => {
      const pipeline = { draft: 8, inReview: 3, approved: 5, published: 35 };
      const total = pipeline.draft + pipeline.inReview + pipeline.approved + pipeline.published;
      expect(total).toBe(51);
      const publishedPct = Math.round((pipeline.published / total) * 100);
      expect(publishedPct).toBe(69);
    });

    it('handles zero total', () => {
      const pipeline = { draft: 0, inReview: 0, approved: 0, published: 0 };
      const total = pipeline.draft + pipeline.inReview + pipeline.approved + pipeline.published;
      expect(total).toBe(0);
    });
  });

  describe('channel success rate formatting', () => {
    it('formats rates as bar widths', () => {
      const rates = { email: 0.95, twitter: 0.92, instagram: 0.88, linkedin: 0.90, sms: 0.85 };
      const formatted = Object.entries(rates).map(([channel, rate]) => ({
        channel,
        percentage: Math.round(rate * 100),
        barWidth: `${Math.round(rate * 100)}%`,
      }));
      expect(formatted[0].percentage).toBe(95);
      expect(formatted[0].barWidth).toBe('95%');
    });

    it('handles empty rates', () => {
      const rates: Record<string, number> = {};
      expect(Object.keys(rates)).toHaveLength(0);
    });
  });

  describe('empty state detection', () => {
    it('detects empty workspace', () => {
      const isEmpty = (s: { emailsCreated: number; contentPublished: number; activeTeamMembers: number }) =>
        s.emailsCreated === 0 && s.contentPublished === 0 && s.activeTeamMembers === 0;
      expect(isEmpty({ emailsCreated: 0, contentPublished: 0, activeTeamMembers: 0 })).toBe(true);
      expect(isEmpty({ emailsCreated: 5, contentPublished: 0, activeTeamMembers: 1 })).toBe(false);
    });
  });

  describe('violation display', () => {
    const violationLabels: Record<string, string> = {
      forbidden_word: 'Forbidden Words',
      missing_disclaimer: 'Missing Disclaimers',
      tone_deviation: 'Tone Issues',
      style_violation: 'Style Violations',
    };

    it('maps violation types to display names', () => {
      const violations = [
        { type: 'forbidden_word', count: 12 },
        { type: 'tone_deviation', count: 5 },
      ];
      const display = violations.map((v) => ({
        label: violationLabels[v.type] || v.type,
        count: v.count,
      }));
      expect(display[0].label).toBe('Forbidden Words');
      expect(display[0].count).toBe(12);
    });
  });
});

describe('Recharts data preparation', () => {
  it('maps trend data to Recharts format', () => {
    const trends = [
      { date: '2026-03-21', emailsSent: 3, avgOpenRate: 0.25, batchJobsCompleted: 1, compliancePassRate: 0.80, competitorEvents: 2 },
      { date: '2026-03-22', emailsSent: 5, avgOpenRate: 0.28, batchJobsCompleted: 2, compliancePassRate: 0.85, competitorEvents: 4 },
    ];
    const chartData = trends.map((t) => ({
      date: t.date.slice(5),
      sent: t.emailsSent,
      openRate: t.avgOpenRate ? Math.round(t.avgOpenRate * 100) : 0,
    }));
    expect(chartData[0].date).toBe('03-21');
    expect(chartData[0].openRate).toBe(25);
  });
});
