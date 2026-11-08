export type ProductSurface = 'engage' | 'workspace' | 'all';

const ENGAGE_NAV_IDS: ReadonlySet<string> = new Set(['marketing', 'settings']);
const ENGAGE_PATH_PREFIXES: readonly string[] = ['/marketing', '/settings', '/admin'];

export const ENGAGE_HOME_PATH = '/marketing';

/** Mirrors the server default. An unknown value hides frozen UI rather than exposing it. */
export function getProductSurface(
  raw: string | undefined = import.meta.env.VITE_PRODUCT_SURFACE,
): ProductSurface {
  const value = raw?.trim();
  if (!value) return 'workspace';
  return value === 'workspace' || value === 'all' ? value : 'engage';
}

export function isNavItemOnSurface(
  navId: string,
  surface: ProductSurface = getProductSurface(),
): boolean {
  return surface !== 'engage' || ENGAGE_NAV_IDS.has(navId);
}

export function isPathOnSurface(
  path: string,
  surface: ProductSurface = getProductSurface(),
): boolean {
  if (surface !== 'engage') return true;
  return ENGAGE_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
