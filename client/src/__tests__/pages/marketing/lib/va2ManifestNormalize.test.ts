import { describe, it, expect } from 'vitest';
import { normalizeVa2SectionContent } from '@/pages/marketing/lib/va2ManifestNormalize';

describe('normalizeVa2SectionContent', () => {
  it('maps hero aliases for image position and watermark', () => {
    const out = normalizeVa2SectionContent('hero', {
      backgroundPosition: 'center top',
      initialLetter: 'M',
      watermark_opacity: 0.1,
    });
    expect(out.imagePosition).toBe('center top');
    expect(out.decorativeInitial).toBe('M');
    expect(out.watermarkOpacity).toBe(0.1);
  });
});
