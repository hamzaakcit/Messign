import { describe, expect, it } from 'vitest';
import { checkFeedPackage, feedRegenScene } from '../../../services/marketing/feedPackage.js';

const brief = [
  'Window drop',
  '',
  'product: Kürk Mantolu Madonna',
  'place: Karaköy kitapçı vitrini',
  'price: ₺189',
  'language: tr',
].join('\n');

const caption = 'Kürk Mantolu Madonna bu hafta vitrinde, ₺189. Link in bio';

describe('checkFeedPackage', () => {
  it('fails when the returned prompt drops the place', () => {
    const errors = checkFeedPackage({
      brief,
      returnedPrompt: 'Photorealistic photograph of Kürk Mantolu Madonna.',
      aspectRatio: '1:1',
      caption,
      format: 'feed',
    });
    expect(errors.map((error) => error.field)).toContain('place');
  });

  it('fails when the caption adds a second price', () => {
    const errors = checkFeedPackage({
      brief,
      returnedPrompt: 'Photorealistic photograph of Kürk Mantolu Madonna at Karaköy kitapçı vitrini.',
      aspectRatio: '1:1',
      caption: 'Kürk Mantolu Madonna is ₺189, and the other copy is ₺220. Link in bio',
      format: 'feed',
    });
    expect(errors.map((error) => error.field)).toContain('price');
  });

  it('passes a square still whose caption keeps the sheet price', () => {
    const errors = checkFeedPackage({
      brief,
      returnedPrompt: 'Photorealistic photograph of Kürk Mantolu Madonna at Karaköy kitapçı vitrini. Square 1:1 frame.',
      aspectRatio: '1:1',
      caption,
      format: 'feed',
    });
    expect(errors).toEqual([]);
  });
});

describe('feedRegenScene', () => {
  it('sends the sheet scene again and leaves the new prompt out of the still', () => {
    const scene = feedRegenScene({
      userBrief: brief,
      newPrompt: 'draw a rocket on the moon',
      stylePreset: 'photoreal',
    });
    expect(scene.prompt).toContain('Kürk Mantolu Madonna');
    expect(scene.prompt).toContain('Karaköy kitapçı vitrini');
    expect(scene.prompt).toContain('Square 1:1 frame.');
    expect(scene.prompt).not.toContain('rocket');
    expect(scene.aspectRatio).toBe('1:1');
  });

  it('uses the look saved on the offer', () => {
    const scene = feedRegenScene({
      userBrief: `${brief}\nstyle: editorial`,
      newPrompt: 'draw a rocket on the moon',
      stylePreset: 'photoreal',
    });
    expect(scene.prompt).toContain('Editorial photograph');
    expect(scene.prompt).not.toContain('Photorealistic');
  });
});
