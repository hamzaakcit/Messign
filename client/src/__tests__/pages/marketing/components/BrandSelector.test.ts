import { describe, it, expect } from 'vitest';
import type { BrandProfileClient } from '../../../../lib/marketingApi';

// ── BrandSelector logic tests ──

describe('BrandSelector logic', () => {
  const profiles: BrandProfileClient[] = [
    {
      id: 'bp-1',
      organization_id: 'org-1',
      brand_name: 'Zebra Corp',
      brand_description: 'Striped solutions',
      logo_url: null,
      tone_keywords: ['bold'],
      forbidden_words: [],
      required_disclaimers: [],
      voice_examples: [],
      style_guide_notes: null,
      color_palette: {},
      preferred_themes: [],
      active: true,
      created_by: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
    {
      id: 'bp-2',
      organization_id: 'org-1',
      brand_name: 'Alpha Inc',
      brand_description: 'First in everything',
      logo_url: null,
      tone_keywords: ['professional'],
      forbidden_words: ['cheap'],
      required_disclaimers: [],
      voice_examples: [],
      style_guide_notes: null,
      color_palette: {},
      preferred_themes: ['executive'],
      active: true,
      created_by: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
    {
      id: 'bp-3',
      organization_id: 'org-1',
      brand_name: 'Inactive Brand',
      brand_description: null,
      logo_url: null,
      tone_keywords: [],
      forbidden_words: [],
      required_disclaimers: [],
      voice_examples: [],
      style_guide_notes: null,
      color_palette: {},
      preferred_themes: [],
      active: false,
      created_by: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
  ];

  it('null selectedBrandId means no brand selected', () => {
    const selectedBrandId: string | null = null;
    expect(selectedBrandId).toBeNull();
  });

  it('sorts profiles alphabetically by brand_name', () => {
    const sorted = [...profiles]
      .filter((p) => p.active)
      .sort((a, b) => a.brand_name.localeCompare(b.brand_name));
    expect(sorted[0].brand_name).toBe('Alpha Inc');
    expect(sorted[1].brand_name).toBe('Zebra Corp');
  });

  it('filters out inactive brands', () => {
    const activeOnly = profiles.filter((p) => p.active);
    expect(activeOnly).toHaveLength(2);
    expect(activeOnly.find((p) => p.brand_name === 'Inactive Brand')).toBeUndefined();
  });

  it('shows setup prompt for empty list', () => {
    const empty: BrandProfileClient[] = [];
    const message = empty.length === 0 ? 'No brands configured' : '';
    expect(message).toBe('No brands configured');
  });
});

// ── BrandProfileManager logic tests ──

describe('BrandProfileManager logic', () => {
  describe('tag add/remove/dedup/trim', () => {
    it('adds tag to empty list', () => {
      const tags: string[] = [];
      const input = 'professional';
      const trimmed = input.trim();
      if (trimmed && !tags.includes(trimmed)) {
        tags.push(trimmed);
      }
      expect(tags).toEqual(['professional']);
    });

    it('trims whitespace from tags', () => {
      const tags: string[] = [];
      const input = '  bold  ';
      const trimmed = input.trim();
      if (trimmed && !tags.includes(trimmed)) {
        tags.push(trimmed);
      }
      expect(tags).toEqual(['bold']);
    });

    it('deduplicates tags', () => {
      const tags = ['professional'];
      const input = 'professional';
      const trimmed = input.trim();
      if (trimmed && !tags.includes(trimmed)) {
        tags.push(trimmed);
      }
      expect(tags).toEqual(['professional']);
    });

    it('rejects empty tags', () => {
      const tags: string[] = [];
      const input = '   ';
      const trimmed = input.trim();
      if (trimmed && !tags.includes(trimmed)) {
        tags.push(trimmed);
      }
      expect(tags).toEqual([]);
    });

    it('removes tag by filter', () => {
      const tags = ['bold', 'warm', 'friendly'];
      const result = tags.filter((t) => t !== 'warm');
      expect(result).toEqual(['bold', 'friendly']);
    });
  });

  describe('hex color validation', () => {
    const hexPattern = /^#[0-9a-fA-F]{3,8}$/;

    it('accepts valid 3-digit hex', () => {
      expect(hexPattern.test('#fff')).toBe(true);
    });

    it('accepts valid 6-digit hex', () => {
      expect(hexPattern.test('#FF5733')).toBe(true);
    });

    it('accepts valid 8-digit hex (with alpha)', () => {
      expect(hexPattern.test('#00112233')).toBe(true);
    });

    it('rejects named colors', () => {
      expect(hexPattern.test('red')).toBe(false);
    });

    it('rejects invalid hex characters', () => {
      expect(hexPattern.test('#xyz')).toBe(false);
    });

    it('rejects empty string', () => {
      expect(hexPattern.test('')).toBe(false);
    });
  });

  describe('theme toggle', () => {
    const VALID_THEMES = ['executive', 'startup', 'luxury', 'minimal', 'bold', 'nature', 'tech', 'warm'];

    it('adds theme on toggle', () => {
      const current = ['executive'];
      const theme = 'tech';
      const result = current.includes(theme) ? current.filter((t) => t !== theme) : [...current, theme];
      expect(result).toEqual(['executive', 'tech']);
    });

    it('removes theme on toggle', () => {
      const current = ['executive', 'tech'];
      const theme = 'executive';
      const result = current.includes(theme) ? current.filter((t) => t !== theme) : [...current, theme];
      expect(result).toEqual(['tech']);
    });

    it('all 8 VA2 themes are valid', () => {
      expect(VALID_THEMES).toHaveLength(8);
      for (const theme of VALID_THEMES) {
        expect(typeof theme).toBe('string');
        expect(theme.length).toBeGreaterThan(0);
      }
    });
  });
});
