export type InstagramFormat = 'feed' | 'story' | 'reel';

const FORMAT_TAG_PREFIX = 'ig_format:';

/**
 * Read the Instagram format stored on a content row (`ig_format:feed|story|reel`).
 * Returns null when the row has no recognized format tag.
 */
export function instagramFormatFromTags(
  tags: readonly string[] | null | undefined,
): InstagramFormat | null {
  if (!tags) return null;
  for (const tag of tags) {
    if (!tag.startsWith(FORMAT_TAG_PREFIX)) continue;
    const value = tag.slice(FORMAT_TAG_PREFIX.length);
    if (value === 'feed' || value === 'story' || value === 'reel') return value;
  }
  return null;
}

/**
 * Feed is a square still. Story and reel covers are vertical.
 * A missing format stays square.
 */
export function aspectRatioForInstagramFormat(
  format: InstagramFormat | null | undefined,
): '1:1' | '9:16' {
  if (format === 'story' || format === 'reel') return '9:16';
  return '1:1';
}
