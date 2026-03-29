import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  estimateRgbMeanLuminance,
  flattenInstagramFeedToOpaqueJpeg,
  flattenKontextToOpaqueJpeg,
} from '../../../services/marketing/publishing/imageService/kontextRasterNormalize.js';

describe('flattenInstagramFeedToOpaqueJpeg', () => {
  it('converts fully transparent PNG to bright JPEG (never leaves alpha for feed)', async () => {
    const png = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();

    const out = await flattenInstagramFeedToOpaqueJpeg(png);
    expect(out[0]).toBe(0xff);
    expect(out[1]).toBe(0xd8);
    const lum = await estimateRgbMeanLuminance(out);
    expect(lum).not.toBeNull();
    expect(lum!).toBeGreaterThan(200);
  });
});

describe('flattenKontextToOpaqueJpeg', () => {
  it('converts transparent PNG to opaque JPEG bytes', async () => {
    const png = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 4,
        background: { r: 10, g: 10, b: 10, alpha: 0 },
      },
    })
      .png()
      .toBuffer();

    const out = await flattenKontextToOpaqueJpeg(png);
    expect(out.length).toBeGreaterThan(20);
    expect(out[0]).toBe(0xff);
    expect(out[1]).toBe(0xd8);
  });
});

describe('estimateRgbMeanLuminance', () => {
  it('returns a high mean for bright JPEGs (Fal near-black guard must not false-reject)', async () => {
    const rgb = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: { r: 240, g: 240, b: 240 },
      },
    })
      .jpeg()
      .toBuffer();
    const m = await estimateRgbMeanLuminance(rgb);
    expect(m).not.toBeNull();
    expect(m!).toBeGreaterThan(80);
  });

  it('returns a low mean for near-uniform dark frames', async () => {
    const rgb = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: { r: 2, g: 2, b: 2 },
      },
    })
      .jpeg()
      .toBuffer();
    const m = await estimateRgbMeanLuminance(rgb);
    expect(m).not.toBeNull();
    expect(m!).toBeLessThan(14);
  });
});
