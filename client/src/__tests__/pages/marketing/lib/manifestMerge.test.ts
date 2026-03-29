import { describe, expect, it } from 'vitest';
import productLaunchManifest from '@/pages/marketing/unlayerTemplates/starters/productLaunch.json';
import { mergeUserEmailDraftIntoTemplateManifest, normalizeManifest } from '@/pages/marketing/lib/manifestParser';

describe('mergeUserEmailDraftIntoTemplateManifest', () => {
  it('replaces product-launch placeholders with user Mother’s Day draft', () => {
    const base = normalizeManifest(productLaunchManifest as Record<string, unknown>);
    const raw = `SUBJECT: Celebrate Mom This Sunday
PREVIEW: Gifts she will love — limited time

BODY:
This Mother’s Day, say thank you with something thoughtful.
[CTA: Shop the collection]`;

    const merged = mergeUserEmailDraftIntoTemplateManifest(base, raw);

    expect(merged.subject).toMatch(/Mother|Mom/i);
    const hero = merged.sections.find((s) => s.type === 'hero');
    if (hero?.content) {
      const c = hero.content as Record<string, unknown>;
      expect(String(c.headline)).toMatch(/Mother|Mom/i);
    }
    expect(merged.sections.some((s) => s.type === 'value_prop')).toBe(false);
    const tb = merged.sections.find((s) => s.type === 'text_block');
    expect(tb?.content).toBeDefined();
    const body = String((tb?.content as Record<string, unknown>).body ?? '');
    expect(body.toLowerCase()).toMatch(/mother|mom/);
  });
});

describe('normalizeManifest', () => {
  it('preserves metadata.target_image_slots and visual_density from LLM JSON', () => {
    const m = normalizeManifest({
      version: '2.0',
      theme: 'minimal',
      subject: 'S',
      preheader: 'p'.repeat(100),
      sections: [
        {
          type: 'hero',
          order: 1,
          content: { headline: 'H', imagePrompt: 'wide hero scene', ctaText: 'Go', ctaUrl: '#' },
        },
        { type: 'footer', order: 2, content: { companyName: 'C', address: 'A', links: [] } },
      ],
      metadata: { channel: 'email', tone: '', audience: '', visual_density: 'rich', target_image_slots: 8 },
    } as Record<string, unknown>);
    expect(m.metadata?.visual_density).toBe('rich');
    expect(m.metadata?.target_image_slots).toBe(8);
  });
});
