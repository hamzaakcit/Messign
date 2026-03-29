import { describe, it, expect } from 'vitest';
import { mapDimensionsToFalKontextAspectRatio } from '../../../services/marketing/publishing/imageService/falKontextAspectRatio.js';

describe('mapDimensionsToFalKontextAspectRatio', () => {
  it('maps 1920x1080 to 16:9', () => {
    expect(mapDimensionsToFalKontextAspectRatio(1920, 1080)).toBe('16:9');
  });

  it('maps square to 1:1', () => {
    expect(mapDimensionsToFalKontextAspectRatio(1024, 1024)).toBe('1:1');
  });

  it('maps portrait phone to 9:16', () => {
    expect(mapDimensionsToFalKontextAspectRatio(1080, 1920)).toBe('9:16');
  });

  it('falls back to 1:1 for invalid dimensions', () => {
    expect(mapDimensionsToFalKontextAspectRatio(0, 100)).toBe('1:1');
  });
});
