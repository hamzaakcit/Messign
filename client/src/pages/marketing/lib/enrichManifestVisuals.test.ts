import { describe, it, expect } from 'vitest';
import {
  enrichManifestForVisualDensity,
  DEFAULT_CAMPAIGN_IMAGE_SLOTS,
  MAX_CAMPAIGN_IMAGE_SLOTS,
  MIN_CAMPAIGN_IMAGE_SLOTS,
  resolveTargetImageSlots,
} from './enrichManifestVisuals';
import { countImageSlotsInManifest } from './emailManifestImageSlots';
import type { DesignManifest } from './types/manifestTypes';

describe('resolveTargetImageSlots', () => {
  it('defaults to DEFAULT_CAMPAIGN_IMAGE_SLOTS when target_image_slots is omitted', () => {
    const m: DesignManifest = {
      version: '2.0',
      theme: 'minimal',
      subject: 'S',
      preheader: 'p'.repeat(100),
      sections: [
        { type: 'hero', order: 1, content: { headline: 'H', imagePrompt: 'x', ctaText: 'Go', ctaUrl: '#' } },
        { type: 'footer', order: 2, content: { companyName: 'C', address: 'A', links: [] } },
      ],
      metadata: { channel: 'email', tone: '', audience: '' },
    };
    expect(resolveTargetImageSlots(m)).toBe(DEFAULT_CAMPAIGN_IMAGE_SLOTS);
  });
});

describe('enrichManifestForVisualDensity', () => {
  it(`adds image_text sections until at least ${MIN_CAMPAIGN_IMAGE_SLOTS} slots`, () => {
    const m: DesignManifest = {
      version: '2.0',
      theme: 'minimal',
      subject: 'Spring launch',
      preheader: 'x'.repeat(100),
      sections: [
        {
          type: 'hero',
          order: 1,
          content: {
            headline: 'H',
            imagePrompt: 'Wide scenic landscape photograph, soft light, no text',
            ctaText: 'Go',
            ctaUrl: 'https://example.com',
          },
        },
        {
          type: 'footer',
          order: 2,
          content: {
            companyName: 'Co',
            address: 'Addr',
            links: [{ text: 'Unsub', url: '/u' }],
          },
        },
      ],
      metadata: { channel: 'email', tone: '', audience: '' },
    };
    const out = enrichManifestForVisualDensity(m);
    expect(countImageSlotsInManifest(out)).toBeGreaterThanOrEqual(MIN_CAMPAIGN_IMAGE_SLOTS);
    expect(out.metadata?.visual_slots_auto_enriched).toBe(true);
    const imageTexts = out.sections.filter((s) => s.type === 'image_text');
    expect(imageTexts.length).toBeGreaterThanOrEqual(2);
  });

  it('does not enrich when visual_density is minimal', () => {
    const m: DesignManifest = {
      version: '2.0',
      theme: 'minimal',
      subject: 'Receipt',
      preheader: 'x'.repeat(100),
      sections: [
        {
          type: 'hero',
          order: 1,
          content: {
            headline: 'H',
            imagePrompt: 'x',
            ctaText: 'Ok',
            ctaUrl: 'https://x.com',
          },
        },
        {
          type: 'footer',
          order: 2,
          content: { companyName: 'C', address: 'A', links: [] },
        },
      ],
      metadata: { channel: 'email', tone: '', audience: '', visual_density: 'minimal' },
    };
    const out = enrichManifestForVisualDensity(m);
    expect(out).toBe(m);
    expect(out.metadata?.visual_slots_auto_enriched).toBeUndefined();
  });

  it('respects metadata.target_image_slots when greater than minimum', () => {
    const m: DesignManifest = {
      version: '2.0',
      theme: 'minimal',
      subject: 'Exclusive watches for collectors',
      preheader: 'y'.repeat(100),
      sections: [
        {
          type: 'hero',
          order: 1,
          content: {
            headline: 'H',
            subheadline: 'Swiss craftsmanship',
            imagePrompt: 'Luxury timepiece macro, soft light',
            ctaText: 'Shop',
            ctaUrl: 'https://example.com',
          },
        },
        {
          type: 'footer',
          order: 2,
          content: { companyName: 'Co', address: 'A', links: [] },
        },
      ],
      metadata: { channel: 'email', tone: '', audience: 'High-net-worth collectors', target_image_slots: 6 },
    };
    const out = enrichManifestForVisualDensity(m);
    expect(resolveTargetImageSlots(m)).toBe(6);
    expect(countImageSlotsInManifest(out)).toBe(6);
    expect(out.sections.filter((s) => s.type === 'image_text').length).toBe(5);
  });

  it('clamps target_image_slots to MAX_CAMPAIGN_IMAGE_SLOTS', () => {
    const m: DesignManifest = {
      version: '2.0',
      theme: 'minimal',
      subject: 'S',
      preheader: 'p'.repeat(100),
      sections: [
        {
          type: 'hero',
          order: 1,
          content: { headline: 'H', imagePrompt: 'wide hero scene with no text', ctaText: 'Go', ctaUrl: '#' },
        },
        { type: 'footer', order: 2, content: { companyName: 'C', address: 'A', links: [] } },
      ],
      metadata: { channel: 'email', tone: '', audience: '', target_image_slots: 99 },
    };
    expect(resolveTargetImageSlots(m)).toBe(MAX_CAMPAIGN_IMAGE_SLOTS);
    const out = enrichManifestForVisualDensity(m);
    expect(countImageSlotsInManifest(out)).toBe(MAX_CAMPAIGN_IMAGE_SLOTS);
  });

  it('starts inserted image_text with the opposite side of the last existing image_text', () => {
    const m: DesignManifest = {
      version: '2.0',
      theme: 'minimal',
      subject: 'Campaign',
      preheader: 'y'.repeat(100),
      sections: [
        {
          type: 'hero',
          order: 1,
          content: {
            headline: 'H',
            imagePrompt: 'Wide scenic landscape photograph, soft light, no text',
            ctaText: 'Go',
            ctaUrl: 'https://example.com',
          },
        },
        {
          type: 'image_text',
          order: 2,
          content: {
            headline: 'Story',
            body: '<p>Body</p>',
            imagePrompt: 'Supporting scene one',
            altText: 'One',
            layout: 'image_left',
          },
        },
        {
          type: 'footer',
          order: 3,
          content: { companyName: 'Co', address: 'Addr', links: [] },
        },
      ],
      metadata: { channel: 'email', tone: '', audience: '', target_image_slots: 4 },
    };
    const out = enrichManifestForVisualDensity(m);
    const texts = out.sections
      .filter((s) => s.type === 'image_text')
      .sort((a, b) => a.order - b.order);
    expect(texts.length).toBe(3);
    const c0 = texts[0].content as { layout?: string };
    const c1 = texts[1].content as { layout?: string };
    expect(c0.layout).toBe('image_left');
    expect(c1.layout).toBe('image_right');
  });

  it('skips enrich for transactional-looking subjects', () => {
    const m: DesignManifest = {
      version: '2.0',
      theme: 'minimal',
      subject: 'Your order receipt #9921',
      preheader: 'x'.repeat(100),
      sections: [
        {
          type: 'hero',
          order: 1,
          content: {
            headline: 'H',
            imagePrompt: 'x',
            ctaText: 'Ok',
            ctaUrl: 'https://x.com',
          },
        },
        {
          type: 'footer',
          order: 2,
          content: { companyName: 'C', address: 'A', links: [] },
        },
      ],
      metadata: { channel: 'email', tone: '', audience: '' },
    };
    const out = enrichManifestForVisualDensity(m);
    expect(out).toBe(m);
  });
});
