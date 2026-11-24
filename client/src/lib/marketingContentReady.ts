/**
 * Reads the content id the marketing orchestrator persisted, from v2 SSE metadata.
 */
export function readMarketingContentId(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const id = (meta as { marketingContentId?: unknown }).marketingContentId;
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  return trimmed.length > 0 ? trimmed : null;
}
