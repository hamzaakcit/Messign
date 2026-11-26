/**
 * Paths that belong to the public website.
 * `/` is the marketing homepage. The signed-in workspace starts at `/dashboard`
 * (engage sessions are sent on to `/marketing` by the existing surface gate).
 */

const EXACT = new Set([
  '/',
  '/engage',
  '/infrastructure',
  '/developers',
  '/company',
  '/contact',
  '/signup',
]);

/**
 * Routes that must render during local auto-login instead of the sign-in screen.
 * Includes the marketing site, the sign-up notice, and the public unsubscribe link.
 */
export function skipsDevLoginScreen(pathname: string): boolean {
  if (EXACT.has(pathname)) return true;
  if (pathname.startsWith('/solutions/')) return true;
  if (pathname.startsWith('/u/')) return true;
  return false;
}
