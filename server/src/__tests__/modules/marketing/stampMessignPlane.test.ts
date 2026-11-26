import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { isMessignBrandStill } from '../../../services/marketing/publishing/imageService/messignBrandMark.js';
import { stampBrandLogo } from '../../../services/marketing/publishing/imageService/stampMessignPlane.js';
import { buildDirectInstagramFalPrompt } from '../../../services/marketing/publishing/imageService/promptBuilder.js';

describe('isMessignBrandStill', () => {
  it('treats Dora as a Messign product and a brief that names Messign as the brand', () => {
    expect(isMessignBrandStill({ product: 'Dora' })).toBe(true);
    expect(isMessignBrandStill({ product: 'Knowledge Hub' })).toBe(true);
    expect(isMessignBrandStill({ brief: 'A Messign booth at the fair' })).toBe(true);
  });

  it('leaves a book or a flower still on its own brand', () => {
    expect(isMessignBrandStill({ product: 'Kürk Mantolu Madonna', shopStill: true })).toBe(false);
    expect(isMessignBrandStill({ product: 'Papatya buketi', shopStill: true })).toBe(false);
    expect(isMessignBrandStill({ product: 'Papatya buketi' })).toBe(false);
  });
});

describe('attached logo on the prompt', () => {
  it('places an attached logo on a book still without calling the brand Messign', () => {
    const out = buildDirectInstagramFalPrompt({
      userBrief: ['product: Kürk Mantolu Madonna', 'place: Karaköy kitapçı vitrini'].join('\n'),
      imagePrompt: 'ignored',
      brandLogoAttached: true,
    });
    expect(out).toContain('The attached logo is placed on the photo afterwards.');
    expect(out).not.toContain('The brand is Messign');
  });
});

describe('stampBrandLogo', () => {
  it('puts the logo color in the top-right and leaves the bottom-left white', async () => {
    const jpeg = await sharp({
      create: { width: 400, height: 400, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .jpeg()
      .toBuffer();
    const logo = await sharp({
      create: { width: 80, height: 40, channels: 4, background: { r: 0, g: 80, b: 220, alpha: 1 } },
    })
      .png()
      .toBuffer();
    const stamped = await stampBrandLogo(jpeg, logo);
    const corner = await sharp(stamped).extract({ left: 250, top: 0, width: 150, height: 120 }).raw().toBuffer();
    let blue = 0;
    for (let i = 0; i < corner.length; i += 3) {
      const r = corner[i] ?? 0;
      const b = corner[i + 2] ?? 0;
      if (b > r + 30 && b > 80) blue += 1;
    }
    expect(blue).toBeGreaterThan(20);

    const quiet = await sharp(stamped).extract({ left: 0, top: 300, width: 40, height: 40 }).raw().toBuffer();
    expect(quiet.every((value) => value > 250)).toBe(true);
  });

  it('returns a tiny image unchanged', async () => {
    const tiny = await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .jpeg()
      .toBuffer();
    const logo = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 0, g: 0, b: 255 } },
    })
      .png()
      .toBuffer();
    const out = await stampBrandLogo(tiny, logo);
    expect(out.equals(tiny)).toBe(true);
  });
});
