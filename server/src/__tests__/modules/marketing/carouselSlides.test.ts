import { describe, expect, it } from 'vitest';
import {
  applyCarouselSlideEdit,
  buildCarouselRolePrompts,
  carouselProRequest,
  regenAllSlideIndexes,
  returnedPromptOmitsProduct,
} from '../../../services/marketing/workflows/carouselSlides.js';

const threeSlides = [
  { index: 0, image_url: 'https://cdn.example/1.png', prompt: 'cover' },
  { index: 1, image_url: 'https://cdn.example/2.png', prompt: 'detail' },
  { index: 2, image_url: 'https://cdn.example/3.png', prompt: 'back' },
];

describe('carousel slides', () => {
  it('regenerates slide 2 without replacing slide 1', () => {
    const edited = applyCarouselSlideEdit(threeSlides, 1, {
      image_url: 'https://cdn.example/2b.png',
      prompt: 'detail revised',
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.updatesHero).toBe(false);
    expect(edited.slides[0]?.image_url).toBe('https://cdn.example/1.png');
    expect(edited.slides[0]?.role).toBe('cover');
    expect(edited.slides[1]?.image_url).toBe('https://cdn.example/2b.png');
    expect(edited.slides[1]?.role).toBe('product');
    expect(edited.slides[2]?.image_url).toBe('https://cdn.example/3.png');
    expect(edited.slides[2]?.role).toBe('detail');
  });

  it('rejects a sixth slide', () => {
    const five = Array.from({ length: 5 }, (_, index) => ({
      index,
      image_url: `https://cdn.example/${index}.png`,
      prompt: `slide ${index}`,
    }));
    const edited = applyCarouselSlideEdit(five, 5, {
      image_url: 'https://cdn.example/extra.png',
      prompt: 'one too many',
    });
    expect(edited.ok).toBe(false);
    if (edited.ok) return;
    expect(edited.error).toContain('5 slides');
    expect(regenAllSlideIndexes(6).ok).toBe(false);
    expect(regenAllSlideIndexes(5)).toEqual({ ok: true, indexes: [0, 1, 2, 3, 4] });
  });

  it('builds five prompts that each name the product and use the Pro still', () => {
    const slides = buildCarouselRolePrompts({
      product: 'Kürk Mantolu Madonna',
      place: 'Karaköy kitapçı vitrini',
      claim: 'Bu hafta vitrinde',
    });
    expect(slides).toHaveLength(5);
    expect(slides.map((slide) => slide.role)).toEqual(['cover', 'product', 'detail', 'proof', 'close']);
    for (const slide of slides) {
      expect(slide.prompt).toContain('Kürk Mantolu Madonna');
      expect(slide.prompt).not.toContain('₺');
      expect(slide.claim).toBe('Bu hafta vitrinde');
    }
    expect(carouselProRequest('Kürk Mantolu Madonna', 'Karaköy kitapçı vitrini')).toEqual({
      instagram_feed: true,
      scene_product: 'Kürk Mantolu Madonna',
      scene_place: 'Karaköy kitapçı vitrini',
    });
    expect(returnedPromptOmitsProduct('a generic vase', 'Kürk Mantolu Madonna')).toBe(true);
    expect(returnedPromptOmitsProduct('Kürk Mantolu Madonna on the table', 'Kürk Mantolu Madonna')).toBe(false);
  });
});
