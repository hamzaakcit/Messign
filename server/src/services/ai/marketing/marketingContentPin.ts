/**
 * Pins a marketing agent run to an existing `marketing_content` row.
 * Kept free of orchestrator imports so request validation can use it.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Accepts a UUID content id from the v2 answer body. Anything else is rejected.
 */
export function parseMarketingContentId(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const id = raw.trim();
  if (!UUID_RE.test(id)) return undefined;
  return id;
}
