export type ProductSurface = 'engage' | 'workspace' | 'all';

const SURFACES: readonly ProductSurface[] = ['engage', 'workspace', 'all'];

/** Modules kept in the engage product (ADR-001, product-vision Q1). Everything else is frozen. */
const ENGAGE_MODULE_NAMESPACES: ReadonlySet<string> = new Set(['marketing', 'creative']);

/** Unset means `workspace`, which is what runs today. A typo throws so it cannot expose frozen routes. */
export function getProductSurface(): ProductSurface {
  const raw = process.env.PRODUCT_SURFACE?.trim();
  if (!raw) return 'workspace';
  if ((SURFACES as readonly string[]).includes(raw)) return raw as ProductSurface;
  throw new Error(`Invalid PRODUCT_SURFACE "${raw}". Expected one of: ${SURFACES.join(', ')}`);
}

export function mountsFrozenModules(surface: ProductSurface = getProductSurface()): boolean {
  return surface !== 'engage';
}

export function isModuleOnSurface(
  namespace: string,
  surface: ProductSurface = getProductSurface(),
): boolean {
  return mountsFrozenModules(surface) || ENGAGE_MODULE_NAMESPACES.has(namespace);
}

export function mountsSeedRoutes(nodeEnv: string | undefined = process.env.NODE_ENV): boolean {
  return nodeEnv !== 'production';
}
