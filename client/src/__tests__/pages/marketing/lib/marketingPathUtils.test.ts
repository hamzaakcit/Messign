import { describe, it, expect } from 'vitest';
import {
  buildMarketingModeLocation,
  pathnameToViewMode,
  viewModeToPath,
} from '@/pages/marketing/lib/marketingPathUtils';
import type { ViewMode } from '@/pages/marketing/components/SparkBar';

describe('marketingPathUtils', () => {
  it('maps board paths and round-trips with viewModeToPath', () => {
    const modes: ViewMode[] = ['board', 'calendar', 'builder', 'intelligence'];
    for (const m of modes) {
      const path = viewModeToPath(m);
      expect(pathnameToViewMode(path)).toBe(m);
    }
  });

  it('treats /marketing and /marketing/unknown as board', () => {
    expect(pathnameToViewMode('/marketing')).toBe('board');
    expect(pathnameToViewMode('/marketing/foo')).toBe('board');
  });

  it('maps /marketing/calendar to calendar (regression: calendar must not redirect to board)', () => {
    expect(pathnameToViewMode('/marketing/calendar')).toBe('calendar');
    expect(viewModeToPath('calendar')).toBe('/marketing/calendar');
  });

  it('buildMarketingModeLocation preserves search string (e.g. ?foo=1 on calendar)', () => {
    const loc = buildMarketingModeLocation('calendar', '?foo=1');
    expect(loc.pathname).toBe('/marketing/calendar');
    expect(loc.search).toBe('?foo=1');
  });
});
