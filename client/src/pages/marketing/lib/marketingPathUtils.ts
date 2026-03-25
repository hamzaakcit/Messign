import type { ViewMode } from '../components/SparkBar';

/**
 * Marketing hub routing: path drives `ViewMode` (no parallel React state for mode).
 *
 * - `/marketing` → board
 * - `/marketing/calendar` → calendar (do not redirect to `/marketing`)
 * - `/marketing/builder` → builder (lazy `BuilderSection`)
 * - `/marketing/intelligence` → intelligence (lazy `CompetitorDashboard`)
 *
 * Use {@link viewModeToPath} when switching modes so the URL and SparkBar stay aligned.
 */

/**
 * URL is the source of truth for marketing hub view mode (board | calendar | builder | intelligence).
 */
export function pathnameToViewMode(pathname: string): ViewMode {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'marketing') return 'board';
  const seg = parts[1];
  if (seg === 'builder') return 'builder';
  if (seg === 'intelligence') return 'intelligence';
  if (seg === 'calendar') return 'calendar';
  return 'board';
}

export function viewModeToPath(mode: ViewMode): string {
  if (mode === 'builder') return '/marketing/builder';
  if (mode === 'intelligence') return '/marketing/intelligence';
  if (mode === 'calendar') return '/marketing/calendar';
  return '/marketing';
}

/**
 * Navigate between hub modes while preserving the current query string (e.g. UTM or deep-link params).
 */
export function buildMarketingModeLocation(mode: ViewMode, search: string): { pathname: string; search: string } {
  return { pathname: viewModeToPath(mode), search };
}
