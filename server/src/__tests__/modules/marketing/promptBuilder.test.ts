import { describe, it, expect } from 'vitest';
import {
  enhanceImagePrompt,
  buildDirectInstagramFalPrompt,
} from '../../../services/marketing/publishing/imageService.js';
import type { ImageGenContext } from '../../../services/marketing/publishing/imageService.js';

describe('enhanceImagePrompt — email anti-text and hero clarity', () => {
  it('includes ZERO TEXT block for email channel', () => {
    const ctx: ImageGenContext = { channel: 'email', sectionType: 'image_text' };
    const result = enhanceImagePrompt('Workspace desk with laptop', 'photoreal', ctx);
    expect(result).toContain('ZERO TEXT (mandatory — email image)');
    expect(result).toContain('No fake app UI');
  });

  it('includes EMAIL HERO CLARITY for email hero', () => {
    const ctx: ImageGenContext = { channel: 'email', sectionType: 'hero' };
    const result = enhanceImagePrompt('Product on marble surface', 'photoreal', ctx);
    expect(result).toContain('EMAIL HERO CLARITY (mandatory)');
    expect(result).toContain('abstract blur-only hero');
  });

  it('does not include EMAIL HERO CLARITY for email non-hero sections', () => {
    const ctx: ImageGenContext = { channel: 'email', sectionType: 'image_text' };
    const result = enhanceImagePrompt('Supporting visual', 'photoreal', ctx);
    expect(result).not.toContain('EMAIL HERO CLARITY (mandatory)');
  });

  it('includes TECHNICAL PLATFORM IMAGERY when technicalPlatformTopic is true', () => {
    const ctx: ImageGenContext = {
      channel: 'email',
      sectionType: 'hero',
      technicalPlatformTopic: true,
    };
    const result = enhanceImagePrompt('API integration campaign', 'photoreal', ctx);
    expect(result).toContain('TECHNICAL PLATFORM IMAGERY');
    expect(result).toContain('no readable text on screens');
  });

  it('does not include TECHNICAL PLATFORM IMAGERY when flag is false', () => {
    const ctx: ImageGenContext = {
      channel: 'email',
      sectionType: 'hero',
      technicalPlatformTopic: false,
    };
    const result = enhanceImagePrompt('Retail sale banner', 'photoreal', ctx);
    expect(result).not.toContain('TECHNICAL PLATFORM IMAGERY');
  });

  it('adds photoreal email banner clarity phrase', () => {
    const ctx: ImageGenContext = { channel: 'email', sectionType: 'hero' };
    const result = enhanceImagePrompt('Autumn product lineup', 'photoreal', ctx);
    expect(result).toContain('f/5.6\u2013f/11');
  });
});

describe('buildDirectInstagramFalPrompt', () => {
  it('uses the cleaned image prompt when the brief has no product or place', () => {
    const out = buildDirectInstagramFalPrompt({
      userBrief: "Red paper plane on a child's hand outdoors",
      imagePrompt:
        "Planner: Creative Director\nPRIMARY SUBJECT: generic office stock photo\nScene / composition: a golden retriever on a beach",
    });
    expect(out).toContain('golden retriever');
    expect(out).not.toContain('Red paper plane');
    expect(out).not.toContain('Planner:');
    expect(out).toMatch(/Photorealistic photograph/i);
    expect(out).toMatch(/unified lighting/i);
  });

  it('strips planner lines from imagePrompt when userBrief is empty', () => {
    const out = buildDirectInstagramFalPrompt({
      userBrief: null,
      imagePrompt: "Planner: ignore this\nUser's request: A golden retriever on a beach at sunset",
    });
    expect(out).toContain('golden retriever');
    expect(out).not.toContain('Planner:');
    expect(out).toMatch(/physically real/i);
  });

  it('builds the scene from the product and the place when the topic is bland', () => {
    const out = buildDirectInstagramFalPrompt({
      userBrief: [
        'Nice photo',
        '',
        'product: Kürk Mantolu Madonna',
        'truth_id: 11111111-2222-4333-8444-555555555555',
        'place: Karaköy kitapçı vitrini',
        'price: ₺189',
        'claim: Bu hafta vitrinde',
        'audience: Shoppers passing the window',
        'window: 2026-11-13..2026-11-20',
        'language: tr',
      ].join('\n'),
      imagePrompt: 'nice photo of a generic office',
      materials: 'A novel in the shop window.\nprice: ₺189',
      aspectRatio: '1:1',
    });
    expect(out).toContain('a novel in the shop window');
    expect(out.indexOf('a novel in the shop window')).toBeLessThan(out.indexOf('titled Kürk Mantolu Madonna'));
    expect(out).toContain('Karaköy kitapçı vitrini');
    expect(out).toContain('Show the named book in the named shop');
    expect(out).toContain('Square 1:1 frame.');
    expect(out).not.toContain('₺');
    expect(out).not.toContain('Bu hafta vitrinde');
    expect(out).not.toContain('Shoppers passing the window');
    expect(out).not.toContain('2026-11-13');
    expect(out).not.toContain('generic office');
    expect(out).not.toContain('Nice photo');
  });

  it('puts brief materials and shot lines in the scene and drops a price from the shot', () => {
    const out = buildDirectInstagramFalPrompt({
      userBrief: [
        'product: Kürk Mantolu Madonna',
        'place: Karaköy kitapçı vitrini',
        'materials: A closed paperback novel',
        'in_frame: the closed book standing face-out in the glass',
        'keep_out: people, flowers, a crown, letters',
        'price: ₺189',
      ].join('\n'),
      imagePrompt: 'ignored',
      materials: 'A novel in the shop window.',
      aspectRatio: '1:1',
    });
    expect(out).toContain(
      'Photorealistic photograph of a closed paperback novel, titled Kürk Mantolu Madonna, at Karaköy kitapçı vitrini. In frame: the closed book standing face-out in the glass. Keep out: people, flowers, a crown, letters. No letters, numbers, or logos.',
    );
    expect(out).not.toContain('A novel in the shop window');
    expect(out).not.toContain('₺');

    const pricedShot = buildDirectInstagramFalPrompt({
      userBrief: [
        'product: Kürk Mantolu Madonna',
        'place: Karaköy kitapçı vitrini',
        'in_frame: price: ₺189',
        'claim: Bu hafta vitrinde',
      ].join('\n'),
      imagePrompt: 'ignored',
    });
    expect(pricedShot).not.toContain('In frame:');
    expect(pricedShot).not.toContain('₺');
    expect(pricedShot).not.toContain('Bu hafta vitrinde');
  });

  it('opens the scene with the chosen look and keeps an acronym', () => {
    const out = buildDirectInstagramFalPrompt({
      userBrief: [
        'product: Dora',
        'place: Istanbul Taksim',
        'materials: AI assistant for the workspace',
        'style: editorial',
      ].join('\n'),
      imagePrompt: 'ignored',
    });
    expect(out).toContain('Editorial photograph of AI assistant for the workspace, titled Dora, at Istanbul Taksim.');
    expect(out).not.toContain('Photorealistic');

    const requested = buildDirectInstagramFalPrompt({
      userBrief: [
        'product: Dora',
        'place: Istanbul Taksim',
        'materials: AI assistant for the workspace',
        'style: editorial',
      ].join('\n'),
      imagePrompt: 'ignored',
      look: 'photoreal',
    });
    expect(requested).toContain('Editorial photograph of AI assistant for the workspace, titled Dora, at Istanbul Taksim.');
    expect(requested).not.toContain('Photorealistic');
    expect(out).not.toContain('aI assistant');
  });
});
