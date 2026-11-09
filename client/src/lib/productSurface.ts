export type ProductSurface = 'engage' | 'workspace' | 'all';

const ENGAGE_NAV_IDS: ReadonlySet<string> = new Set(['marketing', 'customers', 'settings']);
const ENGAGE_PATH_PREFIXES: readonly string[] = ['/marketing', '/customers', '/settings', '/admin'];
/** Engage screens: their API exists only where engage is mounted (engage, all), never on the Company-OS workspace. */
const ENGAGE_ONLY_NAV_IDS: ReadonlySet<string> = new Set(['customers']);
const ENGAGE_ONLY_PATH_PREFIXES: readonly string[] = ['/customers'];

export const ENGAGE_HOME_PATH = '/marketing';

/** Mirrors the server default. An unknown value hides frozen UI rather than exposing it. */
export function getProductSurface(
  raw: string | undefined = import.meta.env.VITE_PRODUCT_SURFACE,
): ProductSurface {
  const value = raw?.trim();
  if (!value) return 'workspace';
  return value === 'workspace' || value === 'all' ? value : 'engage';
}

/**
 * Whether the frozen Company-OS modules exist on this surface (mirror of the server's `mountsFrozenModules`). On
 * `engage` the server does not mount them, so the client must not call them (they only answer 404/403).
 */
export function mountsFrozenModules(surface: ProductSurface = getProductSurface()): boolean {
  return surface !== 'engage';
}

export function isNavItemOnSurface(
  navId: string,
  surface: ProductSurface = getProductSurface(),
): boolean {
  if (surface === 'workspace') return !ENGAGE_ONLY_NAV_IDS.has(navId);
  return surface !== 'engage' || ENGAGE_NAV_IDS.has(navId);
}

export function isPathOnSurface(
  path: string,
  surface: ProductSurface = getProductSurface(),
): boolean {
  const under = (prefix: string) => path === prefix || path.startsWith(`${prefix}/`);
  if (surface === 'workspace') return !ENGAGE_ONLY_PATH_PREFIXES.some(under);
  if (surface !== 'engage') return true;
  return ENGAGE_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
