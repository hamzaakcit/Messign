import { describe, it, expect } from 'vitest';
import {
  buildMarketingModeLocation,
  getWorkspacePanel,
  isMarketingLucyHome,
  pathnameToViewMode,
  viewModeToPath,
} from '@/pages/marketing/lib/marketingPathUtils';
import type { ViewMode } from '@/pages/marketing/components/SparkBar';

describe('marketingPathUtils', () => {
  it('detects Lucy home only on /marketing', () => {
    expect(isMarketingLucyHome('/marketing')).toBe(true);
    expect(isMarketingLucyHome('/marketing/')).toBe(true);
    expect(isMarketingLucyHome('/marketing/workspace')).toBe(false);
    expect(isMarketingLucyHome('/marketing/calendar')).toBe(false);
  });

  it('maps modes and round-trips with buildMarketingModeLocation', () => {
    const modes: ViewMode[] = ['pipeline', 'calendar', 'builder', 'intelligence'];
    for (const m of modes) {
      const loc = buildMarketingModeLocation(m, '');
      expect(pathnameToViewMode(loc.pathname, loc.search)).toBe(m);
    }
  });

  it('maps legacy workspace URL and pipeline segment to pipeline mode', () => {
    expect(pathnameToViewMode('/marketing/workspace')).toBe('pipeline');
    expect(pathnameToViewMode('/marketing/pipeline')).toBe('pipeline');
    expect(viewModeToPath('pipeline')).toBe('/marketing/pipeline');
  });

  it('maps builder and intelligence paths', () => {
    expect(pathnameToViewMode('/marketing/builder')).toBe('builder');
    expect(pathnameToViewMode('/marketing/intelligence')).toBe('intelligence');
    expect(viewModeToPath('builder')).toBe('/marketing/builder');
    expect(viewModeToPath('intelligence')).toBe('/marketing/intelligence');
  });

  it('maps legacy ?panel= on /marketing pathname', () => {
    expect(pathnameToViewMode('/marketing', '?panel=builder')).toBe('builder');
    expect(pathnameToViewMode('/marketing', '?panel=intelligence')).toBe('intelligence');
    expect(getWorkspacePanel('?panel=builder')).toBe('builder');
  });

  it('maps /marketing/calendar to calendar', () => {
    expect(pathnameToViewMode('/marketing/calendar')).toBe('calendar');
    expect(viewModeToPath('calendar')).toBe('/marketing/calendar');
  });

  it('maps ops one-pager segments to pipeline mode for SparkBar', () => {
    expect(pathnameToViewMode('/marketing/brand-social')).toBe('pipeline');
    expect(pathnameToViewMode('/marketing/funnel')).toBe('pipeline');
  });

  it('buildMarketingModeLocation preserves search string on calendar', () => {
    const loc = buildMarketingModeLocation('calendar', '?foo=1');
    expect(loc.pathname).toBe('/marketing/calendar');
    expect(loc.search).toBe('?foo=1');
  });

  it('buildMarketingModeLocation merges builder path and clears panel', () => {
    const b = buildMarketingModeLocation('builder', '?type=email&foo=1');
    expect(b.pathname).toBe('/marketing/builder');
    expect(b.search).toContain('type=email');
    expect(b.search).not.toContain('panel');
    const back = buildMarketingModeLocation('pipeline', b.search);
    expect(back.pathname).toBe('/marketing/pipeline');
  });
});
