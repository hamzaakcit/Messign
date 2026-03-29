import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getDefaultStaticPlaneAssetUrl,
  getPlaneAssetUrl,
  normalizeBrandHexForOverlay,
  PLANE_WIDTH,
  PLANE_HEIGHT,
} from '@/pages/marketing/lib/paperPlaneAssets';

describe('paperPlaneAssets', () => {
  beforeEach(() => {
    vi.stubEnv('BASE_URL', '/');
  });

  it('getDefaultStaticPlaneAssetUrl is absolute in the browser (Unlayer iframe–safe)', () => {
    expect(getDefaultStaticPlaneAssetUrl('minimal')).toMatch(
      /\/marketing\/overlay\/paper-plane\/minimal\.png$/,
    );
    expect(getDefaultStaticPlaneAssetUrl('tech')).toMatch(/\/marketing\/overlay\/paper-plane\/tech\.png$/);
    expect(getDefaultStaticPlaneAssetUrl('minimal')).toMatch(/^https?:\/\//);
  });

  it('getPlaneAssetUrl uses static PNG path when cache is empty', () => {
    expect(getPlaneAssetUrl('executive')).toMatch(/\/marketing\/overlay\/paper-plane\/executive\.png$/);
  });

  it('normalizeBrandHexForOverlay expands shorthand hex', () => {
    expect(normalizeBrandHexForOverlay('#abc')).toBe('#aabbcc');
    expect(normalizeBrandHexForOverlay('invalid')).toBeUndefined();
  });

  it('exposes img dimensions matching overlay markup', () => {
    expect(PLANE_WIDTH).toBe(96);
    expect(PLANE_HEIGHT).toBe(60);
  });
});
