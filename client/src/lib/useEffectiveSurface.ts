import { useSyncExternalStore } from 'react';
import { getEffectiveSurface, subscribeEffectiveSurface, type ProductSurface } from './productSurface';

/** The surface of this session (ADR-017); components that depend on it re-render when it is narrowed. */
export function useEffectiveSurface(): ProductSurface {
  return useSyncExternalStore(subscribeEffectiveSurface, getEffectiveSurface, getEffectiveSurface);
}
