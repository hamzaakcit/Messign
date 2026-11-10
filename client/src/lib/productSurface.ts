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

/**
 * The surface this signed-in session runs on (ADR-017). It is the build's surface, except that on a shared (`all`)
 * build a session of an engage tenant is narrowed to `engage`: a tenant gets the engage pages and none of the
 * Company-OS ones (the server refuses them too). Only `engage` can be set, and only on an `all` build, so a session can
 * never be widened.
 */
let sessionSurface: ProductSurface | null = null;
const surfaceListeners = new Set<() => void>();

export function setSessionSurface(next: 'engage' | null): void {
  const allowed = next === null || getProductSurface() === 'all';
  const value = allowed ? next : null;
  if (value === sessionSurface) return;
  sessionSurface = value;
  surfaceListeners.forEach((listener) => listener());
}

export function getEffectiveSurface(): ProductSurface {
  return sessionSurface ?? getProductSurface();
}

export function subscribeEffectiveSurface(listener: () => void): () => void {
  surfaceListeners.add(listener);
  return () => { surfaceListeners.delete(listener); };
}

/**
 * Whether the frozen Company-OS modules exist for this session (mirror of the server's `mountsFrozenModules`). On
 * `engage` the server does not mount them, so the client must not call them (they only answer 404/403).
 */
export function mountsFrozenModules(surface: ProductSurface = getEffectiveSurface()): boolean {
  return surface !== 'engage';
}

export function isNavItemOnSurface(
  navId: string,
  surface: ProductSurface = getEffectiveSurface(),
): boolean {
  return surface !== 'engage' || ENGAGE_NAV_IDS.has(navId);
}

export function isPathOnSurface(
  path: string,
  surface: ProductSurface = getEffectiveSurface(),
): boolean {
  if (surface !== 'engage') return true;
  return ENGAGE_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
