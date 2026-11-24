import { describe, expect, it } from 'vitest';
import {
  aspectRatioForInstagramFormat,
  instagramFormatFromTags,
} from '@/pages/marketing/lib/instagramFormat';

describe('instagramFormatFromTags', () => {
  it('reloads story as 9:16 and feed as 1:1', () => {
    expect(instagramFormatFromTags(['recipe:product_drop', 'ig_format:story'])).toBe('story');
    expect(aspectRatioForInstagramFormat(instagramFormatFromTags(['ig_format:story']))).toBe('9:16');
    expect(aspectRatioForInstagramFormat(instagramFormatFromTags(['ig_format:feed']))).toBe('1:1');
    expect(aspectRatioForInstagramFormat(instagramFormatFromTags(['ig_format:reel']))).toBe('9:16');
  });

  it('stays square when the row has no format tag', () => {
    expect(instagramFormatFromTags(['recipe:product_drop'])).toBeNull();
    expect(aspectRatioForInstagramFormat(null)).toBe('1:1');
  });
});
