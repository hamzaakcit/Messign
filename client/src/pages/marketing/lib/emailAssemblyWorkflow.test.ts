import { describe, it, expect } from 'vitest';
import { runEmailAssemblyPipeline, utmParamsFromManifestMetadata, validateManifest } from './designAssembler';
import { mergeBrandIntoTheme, getTheme } from './designTokens';
import { evaluateInboxCopy } from './emailInboxPreview';
import { contrastRatio } from './accessibilityEnforcer';
import { legacyFlatManifestToVa2 } from './legacyFlatToVa2';
import { normalizeVa2SectionContent } from './va2ManifestNormalize';
import { mergeResolvedEmailImagesIntoManifest, mergeResolveTelemetryIntoManifest } from '../components/contentEmail/manifestHelpers';
import { countImageSlotsInManifest } from './emailManifestImageSlots';
import {
  inferPlainTextRequestedImageCount,
  synthesizeManifestFromPlainText,
} from './manifestParser';
import { countImageSlotsInManifest } from './emailManifestImageSlots';
import type { DesignManifest } from './types/manifestTypes';
import transactionalReceiptManifest from '../unlayerTemplates/starters/transactionalReceipt.json';

describe('normalizeVa2SectionContent', () => {
  it('maps cta text/url aliases to buttonText/buttonUrl', () => {
    const out = normalizeVa2SectionContent('cta', {
      text: 'Click',
      url: 'https://example.com/x',
    });
    expect(out.buttonText).toBe('Click');
    expect(out.buttonUrl).toBe('https://example.com/x');
  });

  it('maps nested hero cta object', () => {
    const out = normalizeVa2SectionContent('hero', {
      headline: 'Hi',
      cta: { text: 'Go', url: 'https://a.com' },
    });
    expect(out.ctaText).toBe('Go');
    expect(out.ctaUrl).toBe('https://a.com');
  });

  it('maps imageAlt to altText on hero', () => {
    const out = normalizeVa2SectionContent('hero', {
      headline: 'Hi',
      imageAlt: 'Skyline photo',
    });
    expect(out.altText).toBe('Skyline photo');
  });
});

describe('contrastRatio', () => {
  it('returns high ratio for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeGreaterThan(10);
  });
});

describe('mergeBrandIntoTheme', () => {
  it('applies primary hex', () => {
    const m = mergeBrandIntoTheme(getTheme('minimal'), { primaryHex: '#ff0000' });
    expect(m.colors.primary).toBe('#ff0000');
  });

  it('applies body background and text hex', () => {
    const base = getTheme('minimal');
    const m = mergeBrandIntoTheme(base, {
      bodyBackgroundHex: '#0a0a0a',
      textHex: '#eaeaea',
    });
    expect(m.colors.background).toBe('#0a0a0a');
    expect(m.colors.text).toBe('#eaeaea');
  });
});

describe('evaluateInboxCopy', () => {
  it('flags short preheader and long subject', () => {
    const longSub = 'x'.repeat(60);
    const shortPre = 'short';
    const e = evaluateInboxCopy(longSub, shortPre);
    expect(e.subjectOverRecommended).toBe(true);
    expect(e.preheaderUnderRecommended).toBe(true);
    expect(e.warnings.length).toBeGreaterThan(0);
  });

  it('has no warnings for balanced copy', () => {
    const e = evaluateInboxCopy('Welcome back', 'x'.repeat(100));
    expect(e.subjectOverRecommended).toBe(false);
    expect(e.preheaderUnderRecommended).toBe(false);
    expect(e.preheaderOverSoftMax).toBe(false);
    expect(e.warnings.length).toBe(0);
  });
});

describe('legacyFlatManifestToVa2', () => {
  it('maps legacy flat manifest to valid VA2', () => {
    const legacy = {
      colorTheme: 'messign_blue',
      layout: 'minimalist',
      meta: { subject: 'S', preheader: 'p'.repeat(110) },
      sections: [
        { type: 'hero', headline: 'H', imagePrompt: 'sky', cta: { text: 'Go', url: 'https://x.com' } },
        { type: 'footer', companyName: 'Co', unsubscribeUrl: '#' },
      ],
    };
    const va2 = legacyFlatManifestToVa2(legacy as import('./types/designManifest.types').DesignManifest);
    const v = validateManifest(va2);
    expect(v.valid).toBe(true);
  });
});

describe('utmParamsFromManifestMetadata', () => {
  it('returns undefined without campaign_id', () => {
    expect(
      utmParamsFromManifestMetadata({
        version: '2.0',
        theme: 'minimal',
        subject: 'S',
        preheader: 'p'.repeat(100),
        sections: [],
        metadata: { channel: 'email', tone: '', audience: '' },
      }),
    ).toBeUndefined();
  });

  it('builds UTM params from campaign_id', () => {
    const u = utmParamsFromManifestMetadata({
      version: '2.0',
      theme: 'minimal',
      subject: 'S',
      preheader: 'p'.repeat(100),
      sections: [],
      metadata: { channel: 'email', tone: '', audience: '', campaign_id: 'spring_sale' },
    });
    expect(u?.utm_campaign).toBe('spring_sale');
    expect(u?.utm_medium).toBe('email');
  });
});

describe('starter template manifests', () => {
  it('assembles transactional receipt starter', () => {
    const parsed = JSON.parse(JSON.stringify(transactionalReceiptManifest)) as unknown;
    const v = validateManifest(parsed);
    expect(v.valid).toBe(true);
    if (!v.normalizedManifest) throw new Error('expected normalized manifest');
    const r = runEmailAssemblyPipeline(v.normalizedManifest, { skipUTM: true });
    expect(r.success).toBe(true);
    expect(r.design?.body.rows?.length).toBeGreaterThan(2);
    expect(r.metadata.accessibilityScore).toBeDefined();
  });
});

describe('countImageSlotsInManifest', () => {
  it('counts hero, image_text, and product_grid items', () => {
    const manifest: DesignManifest = {
      version: '2.0',
      theme: 'minimal',
      subject: 'S',
      preheader: 'p'.repeat(100),
      sections: [
        {
          type: 'hero',
          order: 1,
          content: { headline: 'H', imagePrompt: 'sky' },
        },
        {
          type: 'image_text',
          order: 2,
          content: { body: 'b', imagePrompt: 'office' },
        },
        {
          type: 'product_grid',
          order: 3,
          content: {
            columns: 2,
            items: [
              { name: 'A', imagePrompt: 'mug' },
              { name: 'B', imagePrompt: 'book' },
            ],
          },
        },
      ],
      metadata: { channel: 'email', tone: '', audience: '' },
    };
    expect(countImageSlotsInManifest(manifest)).toBe(4);
  });
});

describe('runEmailAssemblyPipeline theme variants', () => {
  it('assembles minimal and bold themes with same section skeleton', () => {
    const base = (theme: 'minimal' | 'bold'): DesignManifest => ({
      version: '2.0',
      theme,
      subject: 'S',
      preheader: 'p'.repeat(100),
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
    });
    const a = runEmailAssemblyPipeline(base('minimal'), { skipUTM: true });
    const b = runEmailAssemblyPipeline(base('bold'), { skipUTM: true });
    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
    expect(a.metadata.theme).toBe('minimal');
    expect(b.metadata.theme).toBe('bold');
  });
});

describe('runEmailAssemblyPipeline', () => {
  it('sets accessibilityScore on metadata when assembly succeeds', () => {
    const manifest: DesignManifest = {
      version: '2.0',
      theme: 'minimal',
      subject: 'Hello',
      preheader: 'x'.repeat(120),
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
    const result = runEmailAssemblyPipeline(manifest, { skipUTM: true });
    expect(result.success).toBe(true);
    expect(result.metadata.accessibilityScore).toBeDefined();
    expect(typeof result.metadata.accessibilityScore).toBe('number');
  });
});

describe('mergeResolveTelemetryIntoManifest', () => {
  it('stamps email_resolve metadata', () => {
    const m: DesignManifest = {
      version: '2.0',
      theme: 'minimal',
      subject: 'S',
      preheader: 'p'.repeat(100),
      sections: [],
      metadata: { channel: 'email', tone: '', audience: '' },
    };
    const out = mergeResolveTelemetryIntoManifest(m, {
      resolveRunId: 'run-1',
      partial: true,
      errors: ['slot timeout'],
    });
    expect(out.metadata?.email_resolve?.partial).toBe(true);
    expect(out.metadata?.email_resolve?.errorCount).toBe(1);
  });
});

describe('mergeResolvedEmailImagesIntoManifest', () => {
  it('applies URLs by section order key', () => {
    const m: DesignManifest = {
      version: '2.0',
      theme: 'minimal',
      subject: 'S',
      preheader: 'p'.repeat(100),
      sections: [
        { type: 'image', order: 2, content: { imagePrompt: 'x' } },
        { type: 'image', order: 3, content: { imagePrompt: 'y' } },
      ],
      metadata: { channel: 'email', tone: '', audience: '' },
    };
    const merged = mergeResolvedEmailImagesIntoManifest(m, { 2: 'https://a.test/1.png', 3: 'https://a.test/2.png' }, undefined);
    expect((merged.sections[0].content as { imageUrl?: string }).imageUrl).toBe('https://a.test/1.png');
    expect((merged.sections[1].content as { imageUrl?: string }).imageUrl).toBe('https://a.test/2.png');
  });
});

describe('synthesizeManifestFromPlainText', () => {
  it('splits double-newline paragraphs into text blocks', () => {
    const raw = `SUBJECT: T\n\nBODY:\nFirst para.\n\nSecond para.\n\nThird.`;
    const m = synthesizeManifestFromPlainText(raw);
    const bodies = m.sections.filter((s) => s.type === 'text_block');
    expect(bodies.length).toBeGreaterThanOrEqual(1);
    const html = String((bodies[0].content as { body?: string }).body ?? '');
    expect(html).toContain('First');
    expect(html).toContain('Second');
  });

  it('sets target_image_slots and allows more inserted images when draft asks for N images', () => {
    const paras = Array.from({ length: 24 }, (_, i) => `Paragraph ${i + 1} with enough words to build buffers.`);
    const raw = `SUBJECT: Campaign\n\nBODY:\n${paras.join('\n\n')}\n\nPlease include at least 6 images in the layout.`;
    expect(inferPlainTextRequestedImageCount(raw)).toBe(6);
    const m = synthesizeManifestFromPlainText(raw);
    expect(m.metadata?.target_image_slots).toBe(6);
    expect(countImageSlotsInManifest(m)).toBeGreaterThanOrEqual(6);
  });
});
