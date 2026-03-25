import { describe, it, expect } from 'vitest';
import { formatDashboardDataAge } from '@/lib/dashboardFreshness';

describe('formatDashboardDataAge', () => {
  it('returns empty for invalid iso', () => {
    expect(formatDashboardDataAge('not-a-date')).toBe('');
  });

  it('returns relative phrase for recent time', () => {
    const iso = new Date(Date.now() - 30_000).toISOString();
    expect(formatDashboardDataAge(iso)).toMatch(/ago|just now/);
  });
});
