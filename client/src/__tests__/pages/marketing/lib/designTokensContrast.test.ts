import { describe, expect, it } from 'vitest';
import {
  clampAccentForWcagAaOnSurfaces,
  getContrastRatio,
  luxuryTheme,
  mergeBrandIntoTheme,
} from '@/pages/marketing/lib/designTokens';

describe('luxury theme accent WCAG', () => {
  it('meets AA on white and cream backgrounds', () => {
    const a = luxuryTheme.colors.accent;
    expect(getContrastRatio(a, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(a, '#FAF9F6')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('mergeBrandIntoTheme', () => {
  it('darkens brand accent when it would fail AA on light surfaces', () => {
    const t = mergeBrandIntoTheme(luxuryTheme, { accentHex: '#B8860B' });
    expect(getContrastRatio(t.colors.accent, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(t.colors.accent, t.colors.surface)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('clampAccentForWcagAaOnSurfaces', () => {
  it('returns a darkened hex when candidate fails', () => {
    const out = clampAccentForWcagAaOnSurfaces('#B8860B', ['#FFFFFF', '#FAF9F6'], '#1A1A1A');
    expect(getContrastRatio(out, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });
});
