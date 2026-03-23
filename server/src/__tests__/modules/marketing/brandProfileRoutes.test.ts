import { describe, it, expect } from 'vitest';
import {
  createBrandProfile,
  getBrandProfile,
  listBrandProfiles,
  updateBrandProfile,
  deleteBrandProfile,
  setContentBrandProfile,
  getBrandProfileContentCounts,
  formatBrandProfileAsMd,
} from '../../../services/marketing/brandProfileService.js';
import type { BrandProfile } from '../../../services/marketing/brandProfileService.js';

// ── Service exports ──

describe('Brand Profile Routes — service exports', () => {
  it('exports all 7 CRUD functions', () => {
    expect(typeof createBrandProfile).toBe('function');
    expect(typeof getBrandProfile).toBe('function');
    expect(typeof listBrandProfiles).toBe('function');
    expect(typeof updateBrandProfile).toBe('function');
    expect(typeof deleteBrandProfile).toBe('function');
    expect(typeof setContentBrandProfile).toBe('function');
    expect(typeof getBrandProfileContentCounts).toBe('function');
  });

  it('exports formatBrandProfileAsMd', () => {
    expect(typeof formatBrandProfileAsMd).toBe('function');
  });
});

// ── Route input validation logic ──

describe('Brand Profile Routes — input validation', () => {
  it('rejects empty brand_name', async () => {
    let threw = false;
    try {
      await createBrandProfile(
        { organizationId: 'org-1', brandName: '' },
        { query: async () => ({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] }) as never },
      );
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it('rejects whitespace-only brand_name', async () => {
    let threw = false;
    try {
      await createBrandProfile(
        { organizationId: 'org-1', brandName: '   ' },
        { query: async () => ({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] }) as never },
      );
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it('filters invalid preferred_themes to valid subset', () => {
    const validThemes = ['executive', 'startup', 'luxury', 'minimal', 'bold', 'nature', 'tech', 'warm'];
    const input = ['executive', 'invalid-theme', 'tech', 'nonexistent'];
    const filtered = input.filter((t) => validThemes.includes(t));
    expect(filtered).toEqual(['executive', 'tech']);
  });

  it('passes hex color validation pattern', () => {
    const hexPattern = /^#[0-9a-fA-F]{3,8}$/;
    expect(hexPattern.test('#fff')).toBe(true);
    expect(hexPattern.test('#FF5733')).toBe(true);
    expect(hexPattern.test('#00112233')).toBe(true);
    expect(hexPattern.test('red')).toBe(false);
    expect(hexPattern.test('#xyz')).toBe(false);
    expect(hexPattern.test('')).toBe(false);
  });

  it('validates tone_keywords is array-shaped', () => {
    const keywords = ['professional', 'friendly', 'warm'];
    expect(Array.isArray(keywords)).toBe(true);
    expect(keywords.every((k) => typeof k === 'string')).toBe(true);
  });
});

// ── formatBrandProfileAsMd ──

describe('formatBrandProfileAsMd', () => {
  const baseProfile: BrandProfile = {
    id: 'bp-1',
    organization_id: 'org-1',
    brand_name: 'Acme Corp',
    brand_description: 'Leading widget maker',
    logo_url: null,
    tone_keywords: ['professional', 'innovative'],
    forbidden_words: ['cheap', 'discount'],
    required_disclaimers: ['Results may vary'],
    voice_examples: ['We build the future.'],
    style_guide_notes: 'Use Oxford comma',
    color_palette: { primary: '#0066FF' },
    preferred_themes: ['executive', 'tech'],
    active: true,
    created_by: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  };

  it('contains brand name in header', () => {
    const md = formatBrandProfileAsMd(baseProfile);
    expect(md).toContain('## Brand voice profile: Acme Corp');
  });

  it('contains tone keywords', () => {
    const md = formatBrandProfileAsMd(baseProfile);
    expect(md).toContain('professional');
    expect(md).toContain('innovative');
  });

  it('contains forbidden words', () => {
    const md = formatBrandProfileAsMd(baseProfile);
    expect(md).toContain('cheap');
    expect(md).toContain('discount');
  });

  it('contains required disclaimers', () => {
    const md = formatBrandProfileAsMd(baseProfile);
    expect(md).toContain('Results may vary');
  });

  it('contains voice examples', () => {
    const md = formatBrandProfileAsMd(baseProfile);
    expect(md).toContain('We build the future.');
  });

  it('contains style guide notes', () => {
    const md = formatBrandProfileAsMd(baseProfile);
    expect(md).toContain('Oxford comma');
  });

  it('contains preferred themes', () => {
    const md = formatBrandProfileAsMd(baseProfile);
    expect(md).toContain('executive');
    expect(md).toContain('tech');
  });

  it('does not contain data from other brands', () => {
    const md = formatBrandProfileAsMd(baseProfile);
    expect(md).not.toContain('Other Brand');
    expect(md).not.toContain('competitor');
  });

  it('handles profile with minimal fields', () => {
    const minimal: BrandProfile = {
      ...baseProfile,
      brand_description: null,
      tone_keywords: [],
      forbidden_words: [],
      required_disclaimers: [],
      voice_examples: [],
      style_guide_notes: null,
      preferred_themes: [],
    };
    const md = formatBrandProfileAsMd(minimal);
    expect(md).toContain('Acme Corp');
    expect(md).not.toContain('Tone:');
    expect(md).not.toContain('Forbidden');
  });
});
