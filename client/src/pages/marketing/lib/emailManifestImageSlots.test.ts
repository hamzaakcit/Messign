import { describe, expect, it } from 'vitest';
import { countImageSlotsInManifest } from './emailManifestImageSlots';
import type { DesignManifest } from './types/manifestTypes';

describe('countImageSlotsInManifest', () => {
  it('counts hero, image sections, and grid items', () => {
    const m = {
      version: '2.0' as const,
      theme: 'minimal',
      subject: 'S',
      preheader: 'P'.repeat(100),
      sections: [
        {
          type: 'hero' as const,
          order: 1,
          content: { headline: 'H', imagePrompt: 'wide photo prompt for hero background' },
        },
        { type: 'image' as const, order: 2, content: { imagePrompt: 'second visual' } },
        {
          type: 'value_prop' as const,
          order: 3,
          content: {
            columns: 2,
            items: [
              { heading: 'A', imagePrompt: 'icon one' },
              { heading: 'B', imagePrompt: 'icon two' },
            ],
          },
        },
      ],
      metadata: { channel: 'email' as const, tone: '', audience: '' },
    };
    expect(countImageSlotsInManifest(m as unknown as DesignManifest)).toBe(4);
  });
});
