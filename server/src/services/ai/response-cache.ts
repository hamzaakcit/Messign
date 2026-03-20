import NodeCache from 'node-cache';
import type { SourceDocument } from './types.js';
import type { WidgetPayload } from './widgetResolve.js';

const cache = new NodeCache({ stdTTL: 60, checkperiod: 120 });

export interface CachedDirectIntentPayload {
  text: string;
  widgets: WidgetPayload[];
  toolsUsed: string[];
  dataPoints: number;
  sources?: SourceDocument[];
}

function cacheKey(intentId: string, userId: string, organizationId: string | null | undefined): string {
  const org = organizationId ?? 'noorg';
  return `${intentId}:${userId}:${org}`;
}

export function getCachedResponse(
  intentId: string,
  userId: string,
  organizationId?: string | null,
): CachedDirectIntentPayload | undefined {
  const key = cacheKey(intentId, userId, organizationId);
  const hit = cache.get<CachedDirectIntentPayload>(key);
  return hit;
}

export function setCachedResponse(
  intentId: string,
  userId: string,
  data: CachedDirectIntentPayload,
  organizationId?: string | null,
  ttlSeconds?: number,
): void {
  const key = cacheKey(intentId, userId, organizationId);
  const ttl = ttlSeconds && ttlSeconds > 0 ? ttlSeconds : 60;
  cache.set(key, data, ttl);
}
