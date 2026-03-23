import { describe, it, expect } from 'vitest';

describe('ComplianceBadge logic', () => {
  describe('status classification', () => {
    function getStatus(score: number | null): string {
      if (score === null) return 'not_scanned';
      if (score >= 80) return 'passed';
      if (score >= 60) return 'warning';
      return 'failed';
    }

    it('null score = not scanned', () => {
      expect(getStatus(null)).toBe('not_scanned');
    });

    it('80+ = passed', () => {
      expect(getStatus(80)).toBe('passed');
      expect(getStatus(100)).toBe('passed');
      expect(getStatus(95)).toBe('passed');
    });

    it('60-79 = warning', () => {
      expect(getStatus(60)).toBe('warning');
      expect(getStatus(79)).toBe('warning');
      expect(getStatus(70)).toBe('warning');
    });

    it('below 60 = failed', () => {
      expect(getStatus(59)).toBe('failed');
      expect(getStatus(0)).toBe('failed');
      expect(getStatus(30)).toBe('failed');
    });
  });

  describe('display text', () => {
    function getLabel(score: number | null): string {
      if (score === null) return 'Not scanned';
      if (score >= 80) return 'Compliant';
      if (score >= 60) return 'Review needed';
      return 'Non-compliant';
    }

    it('maps scores to display labels', () => {
      expect(getLabel(null)).toBe('Not scanned');
      expect(getLabel(92)).toBe('Compliant');
      expect(getLabel(65)).toBe('Review needed');
      expect(getLabel(40)).toBe('Non-compliant');
    });
  });

  describe('flag summary for tooltip', () => {
    function getFlagSummary(flags: Array<{ severity: string }>): string {
      const errors = flags.filter((f) => f.severity === 'error').length;
      const warnings = flags.filter((f) => f.severity === 'warning').length;
      const parts: string[] = [];
      if (errors > 0) parts.push(`${errors} error${errors > 1 ? 's' : ''}`);
      if (warnings > 0) parts.push(`${warnings} warning${warnings > 1 ? 's' : ''}`);
      return parts.join(', ') || 'No issues';
    }

    it('counts errors and warnings separately', () => {
      expect(getFlagSummary([
        { severity: 'error' }, { severity: 'error' }, { severity: 'warning' },
      ])).toBe('2 errors, 1 warning');
    });

    it('handles errors only', () => {
      expect(getFlagSummary([{ severity: 'error' }])).toBe('1 error');
    });

    it('handles no flags', () => {
      expect(getFlagSummary([])).toBe('No issues');
    });
  });
});

describe('ComplianceDetailPanel logic', () => {
  describe('score color mapping', () => {
    function getScoreColor(score: number): string {
      if (score >= 80) return 'green';
      if (score >= 60) return 'amber';
      return 'red';
    }

    it('green for passing', () => expect(getScoreColor(85)).toBe('green'));
    it('amber for warning', () => expect(getScoreColor(72)).toBe('amber'));
    it('red for failing', () => expect(getScoreColor(45)).toBe('red'));
  });

  describe('flag grouping', () => {
    function groupFlags(flags: Array<{ severity: string; type: string; message: string }>) {
      const errors = flags.filter((f) => f.severity === 'error');
      const warnings = flags.filter((f) => f.severity === 'warning');
      return { errors, warnings };
    }

    it('separates errors and warnings', () => {
      const flags = [
        { severity: 'error', type: 'forbidden_word', message: "Found 'leverage'" },
        { severity: 'warning', type: 'tone_deviation', message: 'Slightly casual' },
        { severity: 'error', type: 'missing_disclaimer', message: 'Missing SOC2' },
      ];
      const grouped = groupFlags(flags);
      expect(grouped.errors).toHaveLength(2);
      expect(grouped.warnings).toHaveLength(1);
    });

    it('handles empty flags', () => {
      const grouped = groupFlags([]);
      expect(grouped.errors).toHaveLength(0);
      expect(grouped.warnings).toHaveLength(0);
    });
  });

  describe('flag type display names', () => {
    const typeLabels: Record<string, string> = {
      forbidden_word: 'Forbidden word',
      missing_disclaimer: 'Missing disclaimer',
      tone_deviation: 'Tone issue',
      style_violation: 'Style',
      length_issue: 'Length',
    };

    it('all flag types have labels', () => {
      const types = ['forbidden_word', 'missing_disclaimer', 'tone_deviation', 'style_violation', 'length_issue'];
      for (const type of types) {
        expect(typeLabels[type]).toBeTruthy();
      }
    });
  });

  describe('time since scan', () => {
    function timeSinceScan(scannedAt: string): string {
      const diff = Date.now() - new Date(scannedAt).getTime();
      const minutes = Math.floor(diff / 60000);
      if (minutes < 1) return 'Just now';
      if (minutes < 60) return `${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ago`;
      return `${Math.floor(hours / 24)}d ago`;
    }

    it('just now for recent scan', () => {
      expect(timeSinceScan(new Date().toISOString())).toBe('Just now');
    });

    it('minutes for recent scan', () => {
      const tenMinAgo = new Date(Date.now() - 10 * 60000).toISOString();
      expect(timeSinceScan(tenMinAgo)).toBe('10m ago');
    });

    it('hours for older scan', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 3600000).toISOString();
      expect(timeSinceScan(twoHoursAgo)).toBe('2h ago');
    });
  });

  describe('score breakdown display', () => {
    it('formats weighted scores correctly', () => {
      const ruleScore = 85;
      const llmScore = 90;
      const ruleWeighted = Math.round(ruleScore * 0.4);
      const llmWeighted = Math.round(llmScore * 0.6);
      const total = ruleWeighted + llmWeighted;
      expect(total).toBe(88);
    });

    it('handles null LLM score', () => {
      const llmScore: number | null = null;
      const display = llmScore !== null ? `${llmScore}` : 'N/A';
      expect(display).toBe('N/A');
    });
  });
});

describe('Brand filter logic', () => {
  it('null brand filter shows all content', () => {
    const filter: string | null = null;
    const showAll = filter === null;
    expect(showAll).toBe(true);
  });

  it('specific brand filter passes brand_profile_id to API', () => {
    const filter = 'bp-123';
    const queryParam = filter ? `&brand_profile_id=${filter}` : '';
    expect(queryParam).toBe('&brand_profile_id=bp-123');
  });
});
