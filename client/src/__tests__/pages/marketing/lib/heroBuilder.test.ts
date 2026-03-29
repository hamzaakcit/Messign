import { describe, it, expect } from 'vitest';
import { buildHeroSection } from '@/pages/marketing/lib/blockBuilders/heroBuilder';
import { getTheme } from '@/pages/marketing/lib/designTokens';

describe('buildHeroSection', () => {
  const theme = getTheme('minimal');

  it('sets photo hero row padding and background image position', () => {
    const rows = buildHeroSection(
      {
        headline: 'Test headline',
        imageUrl: 'https://example.com/h.jpg',
        imagePosition: 'center top',
      },
      theme,
    );
    const row = rows[0];
    const vals = row.values as Record<string, unknown>;
    expect(vals.padding).toBe('56px 0 72px 0');
    const bg = vals.backgroundImage as Record<string, unknown>;
    expect(bg.position).toBe('center top');
    const col = rows[0].columns[0];
    const panel = col.contents.find((c) => c.type === 'html');
    const meta = panel?.values as { _meta?: { htmlClassNames?: string }; html?: string };
    expect(meta?._meta?.htmlClassNames).toContain('hero-text-panel');
    expect(String(meta?.html)).toContain('rgba(0,0,0,0.28)');
  });

  it('includes watermark markup when decorativeInitial is set', () => {
    const rows = buildHeroSection(
      {
        headline: 'Launch',
        imageUrl: 'https://example.com/h.jpg',
        decorativeInitial: 'L',
        watermarkOpacity: 0.08,
      },
      theme,
    );
    const col = rows[0].columns[0];
    const htmlBlock = col.contents.find((c) => c.type === 'html' && String(c.values.html).includes('L</span>'));
    expect(htmlBlock).toBeDefined();
    const html = String(htmlBlock?.values.html);
    expect(html).toContain('position:absolute');
    expect(html).toContain('L</span>');
    expect(html).toContain('opacity:0.08');
  });

  it('uses solid gradient background when no image', () => {
    const rows = buildHeroSection({ headline: 'No image hero' }, theme);
    const vals = rows[0].values as Record<string, unknown>;
    expect(String(vals.backgroundColor)).toContain('linear-gradient');
  });

  it('adds vertical padding when layoutDensity is airy (photo hero)', () => {
    const rowsDefault = buildHeroSection(
      {
        headline: 'Test',
        imageUrl: 'https://example.com/h.jpg',
      },
      theme,
    );
    const rowsAiry = buildHeroSection(
      {
        headline: 'Test',
        imageUrl: 'https://example.com/h.jpg',
      },
      theme,
      { layoutDensity: 'airy' },
    );
    const padDefault = String((rowsDefault[0].values as Record<string, unknown>).padding);
    const padAiry = String((rowsAiry[0].values as Record<string, unknown>).padding);
    expect(padDefault).toBe('56px 0 72px 0');
    expect(padAiry).toBe('64px 0 80px 0');
  });
});
