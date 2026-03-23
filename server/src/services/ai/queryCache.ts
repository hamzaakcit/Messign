/**
 * Messign AI Brain — Query Cache
 *
 * Caches tool execution results to avoid redundant database queries.
 * Uses in-memory cache with TTL (Time-To-Live) based on data freshness needs.
 *
 * Cache strategy:
 * - System stats: 5 min TTL (rarely changes)
 * - Team/department metrics: 3 min TTL (moderate change)
 * - User-specific data: 1 min TTL (changes frequently)
 * - Real-time data (activity feed): NO cache
 *
 * UPGRADE PATH: Replace with Redis for multi-instance deployments.
 */

interface CacheEntry {
  data: unknown;
  createdAt: number;
  ttlMs: number;
  hitCount: number;
}

const cache: Map<string, CacheEntry> = new Map();

/**
 * Maximum cache entries to prevent memory leaks.
 * When exceeded, oldest entries are evicted.
 */
const MAX_CACHE_SIZE = 500;

/**
 * TTL presets by tool category (milliseconds).
 */
const TTL_BY_CATEGORY: Record<string, number> = {
  // Rarely changes — longer cache
  system: 5 * 60 * 1000,        // 5 minutes
  knowledge: 3 * 60 * 1000,     // 3 minutes (docs don't change often)
  achievements: 3 * 60 * 1000,   // 3 minutes

  // Moderate change rate
  projects: 2 * 60 * 1000,      // 2 minutes
  people: 2 * 60 * 1000,        // 2 minutes
  finance: 2 * 60 * 1000,       // 2 minutes

  // Fast-changing — short or no cache
  analytics: 60 * 1000,         // 1 minute
  communication: 30 * 1000,     // 30 seconds

  // Default
  default: 60 * 1000,            // 1 minute
};

/**
 * Tools that should NEVER be cached.
 * These return real-time or user-specific contextual data.
 */
/**
 * Tools that should NEVER be cached.
 * Keys must match what executeTool passes — the **resolved** namespaced name
 * (e.g. analytics:get_recent_activity), not the bare OpenAI function name.
 * Include legacy bare names so older call paths still skip cache.
 */
const NO_CACHE_TOOLS: Set<string> = new Set([
  'analytics:get_recent_activity',
  'get_recent_activity',
  'analytics:get_approval_queue',
  'get_approval_queue',
]);

/**
 * Build a cache key from the tool name, arguments, and user context.
 * Keys are unique per tool + args + user (for permission-aware caching).
 * Format: toolName:uid=<userId>:args=<serialized>[:idem=<key>]
 * The uid= prefix enables safe substring matching in invalidateUser.
 */
function buildCacheKey(
  toolName: string,
  args: Record<string, unknown>,
  userId: string | number,
  idempotencyKey?: string,
): string {
  const argsStr = JSON.stringify(args, Object.keys(args).sort());
  const idem = idempotencyKey ? `:idem=${idempotencyKey}` : '';
  return `${toolName}:uid=${userId}:args=${argsStr}${idem}`;
}

/**
 * Get a cached result if it exists and hasn't expired.
 *
 * @returns The cached data, or null if not found/expired.
 */
export function getCached(
  toolName: string,
  args: Record<string, unknown>,
  userId: string | number,
  idempotencyKey?: string,
): unknown | null {
  // Skip cache for real-time tools
  if (NO_CACHE_TOOLS.has(toolName)) return null;

  const key = buildCacheKey(toolName, args, userId, idempotencyKey);
  const entry = cache.get(key);

  if (!entry) return null;

  // Check TTL
  if (Date.now() - entry.createdAt > entry.ttlMs) {
    cache.delete(key);
    return null;
  }

  entry.hitCount++;
  return entry.data;
}

/**
 * Store a result in the cache.
 *
 * @param toolName - The tool that produced this result
 * @param toolCategory - The tool's category (determines TTL)
 * @param args - The arguments used (part of the cache key)
 * @param userId - The user who made the request
 * @param data - The data to cache
 */
export function setCache(
  toolName: string,
  toolCategory: string,
  args: Record<string, unknown>,
  userId: string | number,
  data: unknown,
  idempotencyKey?: string,
): void {
  if (data === undefined) return;

  // Skip cache for real-time tools
  if (NO_CACHE_TOOLS.has(toolName)) return;

  const key = buildCacheKey(toolName, args, userId, idempotencyKey);
  const ttlMs = TTL_BY_CATEGORY[toolCategory] || TTL_BY_CATEGORY.default;

  // Evict oldest entries if cache is full
  if (cache.size >= MAX_CACHE_SIZE) {
    evictOldest();
  }

  cache.set(key, {
    data,
    createdAt: Date.now(),
    ttlMs,
    hitCount: 0,
  });
}

/**
 * Invalidate all cache entries for a specific tool.
 * Call this when underlying data changes (e.g., after a task is completed).
 */
export function invalidateTool(toolName: string): void {
  for (const [key] of cache) {
    if (key.startsWith(`${toolName}:`)) {
      cache.delete(key);
    }
  }
}

/**
 * Invalidate all cache entries for a specific user.
 * Call this when a user's permissions change.
 */
export function invalidateUser(userId: string | number): void {
  const needle = `:uid=${String(userId)}:`;
  for (const [key] of cache) {
    if (key.includes(needle)) {
      cache.delete(key);
    }
  }
}

/**
 * Clear the entire cache.
 */
export function clearCache(): void {
  cache.clear();
}

/**
 * Get cache statistics (for admin monitoring).
 */
export function getCacheStats(): {
  size: number;
  maxSize: number;
  totalHits: number;
  oldestEntryAge: number;
} {
  let totalHits = 0;
  let oldestAge = 0;
  const now = Date.now();

  for (const entry of cache.values()) {
    totalHits += entry.hitCount;
    const age = now - entry.createdAt;
    if (age > oldestAge) oldestAge = age;
  }

  return {
    size: cache.size,
    maxSize: MAX_CACHE_SIZE,
    totalHits,
    oldestEntryAge: oldestAge,
  };
}

/**
 * Evict the oldest 10% of entries when cache is full.
 */
function evictOldest(): void {
  const entries = Array.from(cache.entries())
    .sort((a, b) => a[1].createdAt - b[1].createdAt);

  const evictCount = Math.ceil(MAX_CACHE_SIZE * 0.1);
  for (let i = 0; i < evictCount && i < entries.length; i++) {
    cache.delete(entries[i][0]);
  }
}
