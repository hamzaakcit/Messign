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
