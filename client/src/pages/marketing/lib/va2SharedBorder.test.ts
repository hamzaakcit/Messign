import { describe, expect, it } from 'vitest';
import { getTheme } from './designTokens';
import { buildSubtleCardBorder, createSingleColumnRow } from './blockBuilders/va2Shared';
import { buildCTASection } from './blockBuilders/ctaBuilder';
import { buildTestimonialCard } from './blockBuilders/socialBuilders';

describe('va2Shared borders', () => {
  it('buildSubtleCardBorder sets solid divider on all four sides', () => {
    const theme = getTheme('minimal');
    const b = buildSubtleCardBorder(theme);
    expect(b.borderTopWidth).toBe('1px');
    expect(b.borderTopStyle).toBe('solid');
    expect(b.borderTopColor).toBe(theme.colors.divider);
    expect(b.borderBottomColor).toBe(theme.colors.divider);
    expect(b.borderLeftColor).toBe(theme.colors.divider);
    expect(b.borderRightColor).toBe(theme.colors.divider);
  });

  it('createSingleColumnRow applies columnBorder to column values.border', () => {
    const theme = getTheme('minimal');
    const border = buildSubtleCardBorder(theme);
    const row = createSingleColumnRow(
      [],
      theme,
      {
        columnBorder: border,
        columnBgColor: theme.colors.surface,
      },
    );
    expect(row.columns[0]?.values.border).toEqual(border);
  });

  it('createSingleColumnRow uses empty border when columnBorder omitted', () => {
    const theme = getTheme('minimal');
    const row = createSingleColumnRow([], theme, {});
    expect(row.columns[0]?.values.border).toEqual({});
  });
});

describe('buildCTASection', () => {
  it('default layout frames column with subtle border', () => {
    const theme = getTheme('minimal');
    const rows = buildCTASection(
      { buttonText: 'Go', buttonUrl: 'https://example.com' },
      theme,
    );
    expect(rows[0]?.columns[0]?.values.border).toEqual(buildSubtleCardBorder(theme));
    expect(rows[0]?.columns[0]?.values.backgroundColor).toBe(theme.colors.surface);
  });

  it('flush layout omits column border', () => {
    const theme = getTheme('minimal');
    const rows = buildCTASection(
      { buttonText: 'Go', buttonUrl: 'https://example.com' },
      theme,
      { layoutVariant: 'flush' },
    );
    expect(rows[0]?.columns[0]?.values.border).toEqual({});
  });
});

describe('buildTestimonialCard', () => {
  it('includes accent bar HTML and column border for card edge', () => {
    const theme = getTheme('tech');
    const rows = buildTestimonialCard(
      {
        quote: 'Great product.',
        authorName: 'Alex',
        rating: 5,
      },
      theme,
    );
    const htmlBlocks = rows[0]?.columns[0]?.contents.filter((c) => c.type === 'html') ?? [];
    const accent = htmlBlocks.find(
      (c) =>
        typeof c.values.html === 'string' &&
        c.values.html.includes(theme.colors.accent) &&
        c.values.html.includes('height:2px'),
    );
    expect(accent).toBeDefined();
    expect(rows[0]?.columns[0]?.values.border).toEqual(buildSubtleCardBorder(theme));
  });
});
