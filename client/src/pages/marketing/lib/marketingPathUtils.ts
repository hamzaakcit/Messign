import type { ViewMode } from '../components/SparkBar';

/**
 * Marketing routes: Lucy home vs feature paths.
 *
 * - `/marketing` — Lucy navigator + Dora rail (see {@link isMarketingLucyHome}).
 * - `/marketing/pipeline`, `/marketing/brand-social`, etc. — one-pager features.
 * - `/marketing/calendar`, `/marketing/builder`, `/marketing/intelligence` — single-page features.
 * - Legacy `?panel=` on `/marketing` redirects in MarketingHub to `/marketing/builder` / `/marketing/intelligence`.
 *
 * Use {@link buildMarketingModeLocation} when navigating to builder/calendar/intelligence with preserved search.
 */

/**
 * True when the URL is the Lucy-only landing (`/marketing` only, not sub-routes).
 */
export function isMarketingLucyHome(pathname: string): boolean {
  const p = pathname.replace(/\/$/, '') || '/';
  return p === '/marketing';
}

export type WorkspacePanel = 'builder' | 'intelligence';

/**
 * Reads legacy `?panel=` from a search string (with or without leading `?`).
 */
export function getWorkspacePanel(search: string): WorkspacePanel | null {
  const q = search.startsWith('?') ? search.slice(1) : search;
  const p = new URLSearchParams(q).get('panel');
  if (p === 'builder' || p === 'intelligence') return p;
  return null;
}

const OPS_SEGMENTS = new Set(['pipeline', 'brand-social', 'funnel', 'experiments', 'sandbox']);

/**
 * SparkBar / hub view mode from pathname + optional search (legacy panel only on `/marketing` before redirect).
 */
export function pathnameToViewMode(pathname: string, search: string = ''): ViewMode {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'marketing') return 'pipeline';
  const seg = parts[1];
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  if (seg === 'workspace') return 'pipeline';
  if (seg === 'builder') return 'builder';
  if (seg === 'intelligence') return 'intelligence';
  if (seg === 'calendar') return 'calendar';
  if (seg && OPS_SEGMENTS.has(seg)) return 'pipeline';
  if (seg === undefined) {
    const panel = params.get('panel');
    if (panel === 'builder') return 'builder';
    if (panel === 'intelligence') return 'intelligence';
    return 'pipeline';
  }
  return 'pipeline';
}

/** Pathname for each SparkBar mode (no `?panel=` — use path segments). */
export function viewModeToPath(mode: ViewMode): string {
  if (mode === 'calendar') return '/marketing/calendar';
  if (mode === 'builder') return '/marketing/builder';
  if (mode === 'intelligence') return '/marketing/intelligence';
  return '/marketing/pipeline';
}

/**
 * Navigate between hub modes; preserves non-panel query keys (e.g. `type`, `open` on builder).
 */
export function buildMarketingModeLocation(mode: ViewMode, search: string): { pathname: string; search: string } {
  const pathname = viewModeToPath(mode);
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  params.delete('panel');
  const qs = params.toString();
  return { pathname, search: qs ? `?${qs}` : '' };
}
