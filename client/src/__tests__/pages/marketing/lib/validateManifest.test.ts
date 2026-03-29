import { describe, it, expect } from 'vitest';
import { validateManifest } from '@/pages/marketing/lib/designAssembler';

describe('validateManifest', () => {
  it('auto-alternates consecutive image_text left/right layouts and emits no rhythm warning', () => {
    const r = validateManifest({
      version: '2.0',
      theme: 'minimal',
      subject: 'Test subject line for validation',
      preheader: 'x'.repeat(110),
      sections: [
        {
          type: 'hero',
          order: 0,
          content: {
            headline: 'H',
            imagePrompt: 'Wide atmospheric scene with open space for text overlay, soft light',
          },
        },
        {
          type: 'image_text',
          order: 1,
          content: { body: 'a', imagePrompt: 'p', layout: 'image_left' },
        },
        {
          type: 'image_text',
          order: 2,
          content: { body: 'b', imagePrompt: 'q', layout: 'image_left' },
        },
        {
          type: 'footer',
          order: 3,
          content: { companyName: 'Co', address: 'Addr' },
        },
      ],
    });
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.message.includes('Multiple image_text'))).toBe(false);
    const imageRows = r.normalizedManifest!.sections
      .filter((s) => s.type === 'image_text')
      .sort((a, b) => a.order - b.order);
    expect((imageRows[0].content as { layout?: string }).layout).toBe('image_left');
    expect((imageRows[1].content as { layout?: string }).layout).toBe('image_right');
  });

  it('replaces exact Learn more CTA before copy-quality checks', () => {
    const r = validateManifest({
      version: '2.0',
      theme: 'minimal',
      subject: 'Concrete subject with hook and number 42',
      preheader: 'x'.repeat(110),
      sections: [
        {
          type: 'hero',
          order: 0,
          content: {
            headline: 'Headline with 3 concrete outcomes for teams',
            subheadline: 'Subhead with 12% lift and one timeframe',
            ctaText: 'Get the checklist',
            ctaUrl: 'https://example.com',
            imagePrompt: 'Wide atmospheric scene with open space for text overlay, soft light',
          },
        },
        {
          type: 'cta',
          order: 1,
          content: { buttonText: 'Learn more', buttonUrl: 'https://example.com', variant: 'pill' },
        },
        {
          type: 'text_block',
          order: 2,
          content: { body: `P.S. — ${'Detail line with 50+ chars for closing note. '.repeat(2)}` },
        },
        {
          type: 'footer',
          order: 3,
          content: { companyName: 'Co', address: 'Addr', links: [{ text: 'Unsubscribe', url: '#' }] },
        },
      ],
    });
    expect(r.valid).toBe(true);
    expect(
      r.warnings.some((w) => w.message.includes('[Copy Quality') && w.message.includes('Learn more')),
    ).toBe(false);
    const cta = r.normalizedManifest!.sections.find((s) => s.type === 'cta');
    expect((cta!.content as { buttonText?: string }).buttonText).toBe('See details');
  });

  it('uses section.order (document order), not JSON array order, for image_text layout rhythm', () => {
    const r = validateManifest({
      version: '2.0',
      theme: 'minimal',
      subject: 'Test subject line for validation',
      preheader: 'x'.repeat(110),
      sections: [
        {
          type: 'hero',
          order: 1,
          content: {
            headline: 'H',
            imagePrompt: 'Wide atmospheric scene with open space for text overlay, soft light',
          },
        },
        {
          type: 'image_text',
          order: 3,
          content: { body: 'b', imagePrompt: 'q', layout: 'image_right' },
        },
        {
          type: 'image_text',
          order: 2,
          content: { body: 'a', imagePrompt: 'p', layout: 'image_left' },
        },
        {
          type: 'footer',
          order: 4,
          content: { companyName: 'Co', address: 'Addr' },
        },
      ],
    });
    expect(r.valid).toBe(true);
    expect(r.warnings.filter((w) => w.message.includes('Multiple image_text')).length).toBe(0);
  });

  it('warns on thin promotional layout when visual_density is rich but few visual sections', () => {
    const r = validateManifest({
      version: '2.0',
      theme: 'minimal',
      subject: 'Test subject line for validation of thin promotional manifests',
      preheader: 'x'.repeat(110),
      sections: [
        {
          type: 'hero',
          order: 1,
          content: {
            headline: 'Headline',
            imagePrompt: 'Wide atmospheric scene with open space for text overlay, soft light',
          },
        },
        {
          type: 'text_block',
          order: 2,
          content: { body: 'Supporting copy without additional visual sections.', alignment: 'left' },
        },
        {
          type: 'cta',
          order: 3,
          content: {
            headline: 'Act now',
            buttonText: 'Click',
            buttonUrl: 'https://example.com',
          },
        },
        {
          type: 'footer',
          order: 4,
          content: { companyName: 'Co', address: 'Addr' },
        },
      ],
      metadata: {
        visual_density: 'rich',
      },
    });
    expect(r.valid).toBe(true);
    const thin = r.warnings.find((w) => w.message.startsWith('Layout richness:'));
    expect(thin).toBeDefined();
    expect(thin!.message).toMatch(/visual section\(s\)/);
  });

  it('warns when a promotional manifest with hero has fewer than four distinct section types (Phase 13)', () => {
    const r = validateManifest({
      version: '2.0',
      theme: 'minimal',
      subject: 'Test subject line for distinct section depth validation in promotional email',
      preheader: 'x'.repeat(110),
      sections: [
        {
          type: 'hero',
          order: 1,
          content: {
            headline: 'Headline',
            imagePrompt: 'Wide atmospheric scene with open space for text overlay, soft light',
          },
        },
        {
          type: 'text_block',
          order: 2,
          content: { body: '<p>Supporting copy only.</p>', alignment: 'left' },
        },
        {
          type: 'cta',
          order: 3,
          content: { buttonText: 'Go', buttonUrl: 'https://example.com' },
        },
        {
          type: 'footer',
          order: 4,
          content: { companyName: 'Co', address: 'Addr' },
        },
      ],
    });
    expect(r.valid).toBe(true);
    const thin = r.warnings.find((w) => w.message.startsWith('Layout richness:'));
    expect(thin).toBeDefined();
    expect(thin!.message).toMatch(/at least four excluding preheader\/footer/);
  });

  it('does not warn distinct section depth when hero is omitted (minimal layouts)', () => {
    const r = validateManifest({
      version: '2.0',
      theme: 'minimal',
      subject: 'Confirm your email address for account notices',
      preheader: 'x'.repeat(110),
      sections: [
        {
          type: 'text_block',
          order: 1,
          content: { body: '<p>Please confirm.</p>', alignment: 'center' },
        },
        {
          type: 'cta',
          order: 2,
          content: { buttonText: 'Confirm', buttonUrl: 'https://example.com/c' },
        },
        {
          type: 'footer',
          order: 3,
          content: { companyName: 'Co', address: 'Addr' },
        },
      ],
    });
    expect(r.valid).toBe(true);
    expect(
      r.warnings.some((w) => w.message.includes('at least four excluding preheader/footer')),
    ).toBe(false);
  });

  it('warns when the same imagePrompt is reused across multiple slots', () => {
    const dup =
      'Wide atmospheric scene with open space for text overlay, soft light, editorial photography';
    const r = validateManifest({
      version: '2.0',
      theme: 'minimal',
      subject: 'Test subject line for duplicate image prompt validation',
      preheader: 'x'.repeat(110),
      sections: [
        {
          type: 'hero',
          order: 1,
          content: { headline: 'H', imagePrompt: dup },
        },
        {
          type: 'image_text',
          order: 2,
          content: { body: 'a', imagePrompt: dup, layout: 'image_left' },
        },
        {
          type: 'footer',
          order: 3,
          content: { companyName: 'Co', address: 'Addr' },
        },
      ],
    });
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.message.includes('Duplicate imagePrompt'))).toBe(true);
  });

  it('does not warn on short raw preheader when normalizePreheaderForEmail expands it (same as assembly)', () => {
    const r = validateManifest({
      version: '2.0',
      theme: 'minimal',
      subject: 'Test subject line for short preheader validation',
      preheader: 'Too short',
      sections: [
        {
          type: 'hero',
          order: 1,
          content: {
            headline: 'H',
            imagePrompt: 'Wide atmospheric scene with open space for text overlay, soft light',
          },
        },
        {
          type: 'footer',
          order: 2,
          content: { companyName: 'Co', address: 'Addr' },
        },
      ],
      metadata: { visual_density: 'rich' },
    });
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.field === 'preheader' && w.message.includes('40 characters'))).toBe(
      false,
    );
  });

  it('does not warn for short preheader when visual_density is minimal', () => {
    const r = validateManifest({
      version: '2.0',
      theme: 'minimal',
      subject: 'Test subject line for short preheader validation',
      preheader: 'Short',
      sections: [
        {
          type: 'text_block',
          order: 1,
          content: { body: 'Receipt copy.', alignment: 'left' },
        },
        {
          type: 'footer',
          order: 2,
          content: { companyName: 'Co', address: 'Addr' },
        },
      ],
      metadata: { visual_density: 'minimal' },
    });
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.field === 'preheader')).toBe(false);
  });

  it('warns when visual_density is rich but no image_text, image, or product_grid (Phase 10)', () => {
    const r = validateManifest({
      version: '2.0',
      theme: 'minimal',
      subject: 'Test subject line for rich density validation',
      preheader: 'x'.repeat(110),
      sections: [
        {
          type: 'hero',
          order: 1,
          content: {
            headline: 'H',
            imagePrompt: 'Wide atmospheric scene with open space for text overlay, soft light',
          },
        },
        {
          type: 'value_prop',
          order: 2,
          content: {
            columns: 2,
            items: [
              { icon: 'Zap', heading: 'A', description: 'One' },
              { icon: 'Shield', heading: 'B', description: 'Two' },
            ],
          },
        },
        {
          type: 'cta',
          order: 3,
          content: { buttonText: 'Go', buttonUrl: 'https://example.com', variant: 'pill' },
        },
        {
          type: 'footer',
          order: 4,
          content: { companyName: 'Co', address: 'Addr' },
        },
      ],
      metadata: { visual_density: 'rich', target_image_slots: 6 },
    });
    expect(r.valid).toBe(true);
    expect(
      r.warnings.some(
        (w) =>
          w.field === 'metadata.visual_density' &&
          w.message.includes('image_text') &&
          w.message.includes('value_prop alone'),
      ),
    ).toBe(true);
  });

  it('does not emit rich-density warning when rich manifest includes image_text (Phase 10)', () => {
    const r = validateManifest({
      version: '2.0',
      theme: 'minimal',
      subject: 'Test subject line for rich density validation',
      preheader: 'x'.repeat(110),
      sections: [
        {
          type: 'hero',
          order: 1,
          content: {
            headline: 'H',
            imagePrompt: 'Wide atmospheric scene with open space for text overlay, soft light',
          },
        },
        {
          type: 'image_text',
          order: 2,
          content: {
            body: 'Supporting copy',
            imagePrompt: 'Coffee cup on desk morning light editorial scene',
            layout: 'image_left',
          },
        },
        {
          type: 'footer',
          order: 3,
          content: { companyName: 'Co', address: 'Addr' },
        },
      ],
      metadata: { visual_density: 'rich' },
    });
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.field === 'metadata.visual_density')).toBe(false);
  });

  it('warns when subject exceeds typical mobile truncation length', () => {
    const longSubject =
      'This subject line is intentionally long so that many mobile email clients will truncate it before the recipient reads the full benefit';
    const r = validateManifest({
      version: '2.0',
      theme: 'minimal',
      subject: longSubject,
      preheader: 'x'.repeat(110),
      sections: [
        {
          type: 'hero',
          order: 1,
          content: {
            headline: 'H',
            imagePrompt: 'Wide atmospheric scene with open space for text overlay, soft light',
          },
        },
        {
          type: 'footer',
          order: 2,
          content: { companyName: 'Co', address: 'Addr' },
        },
      ],
    });
    expect(r.valid).toBe(true);
    expect(
      r.warnings.some(
        (w) =>
          w.field === 'subject' &&
          w.message.includes('truncate') &&
          w.message.includes('55'),
      ),
    ).toBe(true);
  });

  it('warns when metadata.target_image_slots is 11 or higher', () => {
    const r = validateManifest({
      version: '2.0',
      theme: 'minimal',
      subject: 'Test subject line for high target_image_slots validation',
      preheader: 'x'.repeat(110),
      sections: [
        {
          type: 'hero',
          order: 1,
          content: {
            headline: 'H',
            imagePrompt: 'Wide atmospheric scene with open space for text overlay, soft light',
          },
        },
        {
          type: 'footer',
          order: 2,
          content: { companyName: 'Co', address: 'Addr' },
        },
      ],
      metadata: { target_image_slots: 11 },
    });
    expect(r.valid).toBe(true);
    expect(
      r.warnings.some(
        (w) =>
          w.field === 'metadata.target_image_slots' &&
          w.message.includes('11 or higher') &&
          w.message.includes('HTML export'),
      ),
    ).toBe(true);
  });
});
