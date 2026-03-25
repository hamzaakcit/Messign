/** Simple in-memory rate limiter for chat AI routes (per user, sliding window). */

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 40;

const buckets = new Map<string, number[]>();

export function allowChatAiRequest(userId: string): boolean {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const prev = buckets.get(userId) ?? [];
  const trimmed = prev.filter((t) => t > windowStart);
  if (trimmed.length >= MAX_REQUESTS) {
    buckets.set(userId, trimmed);
    return false;
  }
  trimmed.push(now);
  buckets.set(userId, trimmed);
  return true;
}
