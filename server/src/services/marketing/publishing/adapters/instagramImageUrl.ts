/**
 * Instagram Graph API requires `image_url` to be a publicly reachable HTTPS URL that
 * Meta's crawlers can fetch. Mock/dev URLs and HTML error pages produce black or broken posts.
 */

const META_CRAWLER_UA =
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.html)';

/**
 * Returns false for hosts Meta cannot reach (same constraints we enforce before publish).
 */
export function isBlockedImageHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === 'storage.mock.local' ||
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h.endsWith('.local') ||
    h === '0.0.0.0'
  );
}

/**
 * Structural checks only (no network). Use before calling Meta.
 */
export function validateInstagramImageUrlStruct(url: string): { ok: true } | { ok: false; reason: string } {
  const trimmed = url.trim();
  if (!trimmed) return { ok: false, reason: 'empty image_url' };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      reason:
        'image_url is not a valid URL — use a real HTTPS image link (e.g. Supabase public object URL), not prompt text.',
    };
  }

  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'Instagram requires an HTTPS image_url' };
  }

  if (isBlockedImageHost(parsed.hostname)) {
    return {
      ok: false,
      reason:
        'image_url points to a non-public host (mock/local). Configure Supabase and regenerate the image so image_url is a real public URL.',
    };
  }

  return { ok: true };
}

/**
 * Verifies Meta can fetch the image: HTTP 200 and image/* content-type.
 * Uses a Facebook crawler User-Agent similar to Meta's fetcher.
 */
export async function verifyInstagramImageUrlReachable(
  url: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const structural = validateInstagramImageUrlStruct(url);
  if (!structural.ok) return structural;

  const headers = { 'User-Agent': META_CRAWLER_UA };

  async function tryFetch(method: 'HEAD' | 'GET'): Promise<Response | undefined> {
    try {
      return await fetch(url, {
        method,
        redirect: 'follow',
        signal: AbortSignal.timeout(25_000),
        headers,
      });
    } catch (e) {
      return undefined;
    }
  }

  let res = await tryFetch('HEAD');
  if (!res || !res.ok || res.status === 405) {
    res = await tryFetch('GET');
  }
  if (!res) {
    return { ok: false, reason: 'Network error fetching image_url (Meta would fail too)' };
  }
  if (!res.ok) {
    return {
      ok: false,
      reason: `Image URL returned HTTP ${res.status} — must be publicly readable (check Supabase bucket is public)`,
    };
  }

  const ct = (res.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (!ct.startsWith('image/')) {
    return {
      ok: false,
      reason: `URL did not return an image (got content-type "${ct || 'none'}") — fix image_url or storage ACL`,
    };
  }

  return { ok: true };
}
