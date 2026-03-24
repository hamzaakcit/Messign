import { describe, it, expect } from 'vitest';
import type { ContentCreatePreset } from '@/pages/marketing/components/ContentCreatePanel';

describe('ContentCreatePreset', () => {
  it('supports instagram preset discriminator', () => {
    const preset: ContentCreatePreset = 'instagram';
    expect(preset === 'instagram' || preset === 'default').toBe(true);
  });
});
