import { describe, expect, it } from 'vitest';
import {
  aspectRatioForInstagramFormat,
  instagramFormatFromTags,
} from '../../../services/marketing/workflows/instagramFormat.js';

describe('instagram format aspect', () => {
  it('maps story and reel covers to 9:16 and feed to 1:1', () => {
    expect(aspectRatioForInstagramFormat('story')).toBe('9:16');
    expect(aspectRatioForInstagramFormat('reel')).toBe('9:16');
    expect(aspectRatioForInstagramFormat('feed')).toBe('1:1');
    expect(aspectRatioForInstagramFormat(null)).toBe('1:1');
  });

  it('reads the saved ig_format tag', () => {
    expect(instagramFormatFromTags(['recipe:product_drop', 'ig_format:story'])).toBe('story');
    expect(instagramFormatFromTags(['ig_format:feed'])).toBe('feed');
    expect(instagramFormatFromTags(['ig_format:reel'])).toBe('reel');
    expect(instagramFormatFromTags(['recipe:product_drop'])).toBeNull();
    expect(instagramFormatFromTags(null)).toBeNull();
  });
});
