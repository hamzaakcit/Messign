/**
 * Stable query keys for marketing workspace invalidation.
 */
export const marketingQueryKeys = {
  all: ['marketing'] as const,
  bootstrap: (userId: string) => ['marketing', 'bootstrap', userId] as const,
  funnel: (userId: string) => ['marketing', 'funnel', userId] as const,
  brands: (userId: string) => ['marketing', 'brands', userId] as const,
  commandCenter: (userId: string, days: number, brandId: string | null) =>
    ['marketing', 'commandCenter', userId, days, brandId] as const,
};
