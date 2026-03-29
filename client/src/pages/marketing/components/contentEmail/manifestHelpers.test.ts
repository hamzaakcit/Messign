import { describe, expect, it } from 'vitest';
import {
  hashManifestForIdempotencyKey,
  isPersistedUnlayerDesign,
  mergeResolvedEmailImagesIntoManifest,
} from './manifestHelpers';
import type { DesignManifest } from '../../lib/types/manifestTypes';

const baseManifest = (): DesignManifest =>
  ({
    version: '2.0',
    theme: 'minimal',
    subject: 'Launch week',
    preheader: 'Save your spot',
    sections: [
      {
        type: 'hero',
        order: 1,
        content: {
          headline: 'H',
          imagePrompt: 'A detailed hero prompt about our summer sale and outdoor products',
        },
      },
      { type: 'footer', order: 2, content: {} },
    ],
    metadata: { channel: 'email', tone: '', audience: '' },
  }) as unknown as DesignManifest;

describe('mergeResolvedEmailImagesIntoManifest', () => {
  it('merges itemImages into value_prop items by order:idx', () => {
    const manifest = {
      version: '2.0' as const,
      theme: 'minimal',
      subject: 'S',
      preheader: 'P'.repeat(100),
      sections: [
        {
          type: 'value_prop' as const,
          order: 2,
          content: {
            columns: 2,
            items: [
              { heading: 'One', imagePrompt: 'p1' },
              { heading: 'Two', imagePrompt: 'p2' },
            ],
          },
        },
      ],
      metadata: { channel: 'email' as const, tone: '', audience: '' },
    } as unknown as DesignManifest;

    const merged = mergeResolvedEmailImagesIntoManifest(manifest, undefined, {
      '2:0': 'https://example.com/a.png',
      '2:1': 'https://example.com/b.png',
    });
    const items = (merged.sections[0].content as { items: { imageUrl?: string }[] }).items;
    expect(items[0].imageUrl).toBe('https://example.com/a.png');
    expect(items[1].imageUrl).toBe('https://example.com/b.png');
  });
});

describe('hashManifestForIdempotencyKey', () => {
  it('changes when imagePrompt changes (same section structure)', () => {
    const a = baseManifest();
    const b = baseManifest();
    (b.sections[0].content as { imagePrompt: string }).imagePrompt = 'Different hero scene entirely';
    const ha = hashManifestForIdempotencyKey(a, 'cid-1');
    const hb = hashManifestForIdempotencyKey(b, 'cid-1');
    expect(ha).not.toBe(hb);
  });

  it('changes when preheader changes', () => {
    const a = baseManifest();
    const b = baseManifest();
    b.preheader = 'Different preview line for inbox';
    expect(hashManifestForIdempotencyKey(a, 'cid-1')).not.toBe(hashManifestForIdempotencyKey(b, 'cid-1'));
  });

  it('is stable for identical manifest snapshot', () => {
    const m = baseManifest();
    expect(hashManifestForIdempotencyKey(m, 'cid-1')).toBe(hashManifestForIdempotencyKey(m, 'cid-1'));
  });

  it('changes when regenerate payload differs', () => {
    const m = baseManifest();
    const h0 = hashManifestForIdempotencyKey(m, 'cid-1', null);
    const h1 = hashManifestForIdempotencyKey(m, 'cid-1', { regenerate_section_orders: [1] });
    expect(h0).not.toBe(h1);
  });
});

describe('isPersistedUnlayerDesign', () => {
  it('returns false for manifest-only body_design sidecar', () => {
    expect(isPersistedUnlayerDesign({ va2_manifest: { sections: [] } })).toBe(false);
  });

  it('returns true when body has Unlayer rows', () => {
    expect(isPersistedUnlayerDesign({ body: { rows: [{ columns: [] }] } })).toBe(true);
  });
});
