import { describe, it, expect, vi } from 'vitest';
import {
  createBrandProfile,
  getBrandProfile,
  listBrandProfiles,
  updateBrandProfile,
  deleteBrandProfile,
  setContentBrandProfile,
} from '../../../services/marketing/brandProfileService.js';
import type {
  BrandProfile,
  CreateBrandProfileInput,
  UpdateBrandProfileInput,
} from '../../../services/marketing/brandProfileService.js';

// ── Helpers ──

function createMockDb() {
  const store: Record<string, unknown>[] = [];
  return {
    query: vi.fn(async (text: string, values?: unknown[]) => {
      if (text.includes('INSERT')) {
        const profile = {
          id: 'bp-' + Math.random().toString(36).slice(2, 8),
          organization_id: values?.[0],
          brand_name: values?.[1],
          brand_description: values?.[2] ?? null,
          logo_url: values?.[3] ?? null,
          tone_keywords: values?.[4] ?? [],
          forbidden_words: values?.[5] ?? [],
          required_disclaimers: values?.[6] ?? [],
          voice_examples: values?.[7] ?? [],
          style_guide_notes: values?.[8] ?? null,
          color_palette: JSON.parse((values?.[9] as string) || '{}'),
          preferred_themes: values?.[10] ?? [],
          active: true,
          created_by: values?.[11] ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        store.push(profile);
        return { rows: [profile] };
      }
      if (text.includes('SELECT') && text.includes('COUNT')) {
        return { rows: [{ total: String(store.length) }] };
      }
      if (text.includes('SELECT') && text.includes('WHERE id')) {
        const id = values?.[0];
        const found = store.find((p) => p.id === id);
        return { rows: found ? [found] : [] };
      }
      if (text.includes('SELECT') && text.includes('LOWER(brand_name)')) {
        const orgId = values?.[0];
        const name = (values?.[1] as string || '').toLowerCase();
        const found = store.find(
          (p) =>
            p.organization_id === orgId &&
            (p.brand_name as string).toLowerCase() === name &&
            p.active === true,
        );
        return { rows: found ? [found] : [] };
      }
      if (text.includes('SELECT')) {
        return { rows: store };
      }
      if (text.includes('UPDATE') && text.includes('active = false')) {
        const id = values?.[0];
        const found = store.find((p) => p.id === id && p.active === true);
        if (found) {
          found.active = false;
          return { rows: [found] };
        }
        return { rows: [] };
      }
      if (text.includes('UPDATE')) {
        const id = values?.[values.length - 1];
        const found = store.find((p) => p.id === id);
        return { rows: found ? [found] : [] };
      }
      return { rows: [] };
    }),
    getStore: () => store,
  };
}

// ── Type Contracts ──

describe('Brand Profile Types', () => {
  it('CreateBrandProfileInput requires organizationId and brandName', () => {
    const input: CreateBrandProfileInput = {
      organizationId: 'org-1',
      brandName: 'Messign',
    };
    expect(input.organizationId).toBeTruthy();
    expect(input.brandName).toBeTruthy();
  });

  it('CreateBrandProfileInput supports all optional fields', () => {
    const full: CreateBrandProfileInput = {
      organizationId: 'org-1',
      brandName: 'Messign',
      brandDescription: 'AI-native business OS',
      logoUrl: 'https://messign.com/logo.png',
      toneKeywords: ['confident', 'technical', 'approachable'],
      forbiddenWords: ['synergy', 'leverage'],
      requiredDisclaimers: ['SOC2 compliant'],
      voiceExamples: ['We ship tools that work.'],
      styleGuideNotes: 'Lead with benefits.',
      colorPalette: { primary: '#1A1A2E', accent: '#E94560' },
      preferredThemes: ['executive', 'startup'],
      createdBy: 'user-1',
    };
    expect(full.toneKeywords).toHaveLength(3);
    expect(full.preferredThemes).toHaveLength(2);
  });

  it('UpdateBrandProfileInput allows partial updates', () => {
    const nameOnly: UpdateBrandProfileInput = { brandName: 'New Name' };
    expect(nameOnly.brandName).toBe('New Name');
    expect(nameOnly.toneKeywords).toBeUndefined();

    const toneOnly: UpdateBrandProfileInput = { toneKeywords: ['bold', 'urgent'] };
    expect(toneOnly.brandName).toBeUndefined();
    expect(toneOnly.toneKeywords).toHaveLength(2);

    const deactivate: UpdateBrandProfileInput = { active: false };
    expect(deactivate.active).toBe(false);
  });

  it('BrandProfile shape matches expected fields', () => {
    const profile: BrandProfile = {
      id: 'bp-1',
      organization_id: 'org-1',
      brand_name: 'Test Brand',
      brand_description: 'A test brand',
      logo_url: null,
      tone_keywords: ['friendly'],
      forbidden_words: ['spam'],
      required_disclaimers: [],
      voice_examples: ['We care about quality.'],
      style_guide_notes: null,
      color_palette: { primary: '#000' },
      preferred_themes: ['minimal'],
      active: true,
      created_by: 'user-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    expect(profile.id).toBeTruthy();
    expect(profile.tone_keywords).toContain('friendly');
    expect(profile.forbidden_words).toContain('spam');
  });
});

// ── Validation Logic ──

describe('Brand Profile Validation Logic', () => {
  const VALID_THEMES = [
    'executive', 'startup', 'luxury', 'minimal',
    'bold', 'nature', 'tech', 'warm',
  ];

  it('filters invalid theme names', () => {
    const input = ['executive', 'invalid_theme', 'startup', 'dark_mode'];
    const validated = input.filter((t) => VALID_THEMES.includes(t));
    expect(validated).toEqual(['executive', 'startup']);
  });

  it('accepts all 8 valid themes', () => {
    const validated = VALID_THEMES.filter((t) => VALID_THEMES.includes(t));
    expect(validated).toHaveLength(8);
  });

  it('rejects empty brand name', () => {
    const isEmpty = (name: string) => !name || name.trim().length === 0;
    expect(isEmpty('')).toBe(true);
    expect(isEmpty('   ')).toBe(true);
    expect(isEmpty('Valid Name')).toBe(false);
  });

  it('trims brand name whitespace', () => {
    const trimmed = '  My Brand  '.trim();
    expect(trimmed).toBe('My Brand');
  });

  it('duplicate check is case-insensitive', () => {
    const existing = 'Messign';
    const newName = 'messign';
    expect(existing.toLowerCase() === newName.toLowerCase()).toBe(true);
  });
});

// ── CRUD with Mock DB ──

describe('Brand Profile Service — CRUD with Mock DB', () => {
  it('createBrandProfile inserts and returns profile', async () => {
    const db = createMockDb();

    const profile = await createBrandProfile(
      {
        organizationId: 'org-1',
        brandName: 'Test Brand',
        toneKeywords: ['friendly', 'professional'],
        forbiddenWords: ['spam'],
      },
      db,
    );

    expect(profile.brand_name).toBe('Test Brand');
    expect(profile.tone_keywords).toEqual(['friendly', 'professional']);
    expect(db.query).toHaveBeenCalled();
  });

  it('createBrandProfile rejects empty brand name', async () => {
    const db = createMockDb();

    await expect(
      createBrandProfile({ organizationId: 'org-1', brandName: '' }, db),
    ).rejects.toThrow('Brand name is required');
  });

  it('createBrandProfile rejects whitespace-only brand name', async () => {
    const db = createMockDb();

    await expect(
      createBrandProfile({ organizationId: 'org-1', brandName: '   ' }, db),
    ).rejects.toThrow('Brand name is required');
  });

  it('createBrandProfile filters invalid preferred themes', async () => {
    const db = createMockDb();

    const profile = await createBrandProfile(
      {
        organizationId: 'org-1',
        brandName: 'Theme Test',
        preferredThemes: ['executive', 'not_a_theme', 'minimal'],
      },
      db,
    );

    expect(profile.preferred_themes).toEqual(['executive', 'minimal']);
  });

  it('createBrandProfile trims brand name', async () => {
    const db = createMockDb();

    const profile = await createBrandProfile(
      { organizationId: 'org-1', brandName: '  Trimmed Brand  ' },
      db,
    );

    expect(profile.brand_name).toBe('Trimmed Brand');
  });

  it('createBrandProfile rejects duplicate brand name (case-insensitive)', async () => {
    const db = createMockDb();

    await createBrandProfile(
      { organizationId: 'org-1', brandName: 'Messign' },
      db,
    );

    await expect(
      createBrandProfile({ organizationId: 'org-1', brandName: 'messign' }, db),
    ).rejects.toThrow('already exists');
  });

  it('createBrandProfile allows same name in different orgs', async () => {
    const db = createMockDb();

    await createBrandProfile(
      { organizationId: 'org-1', brandName: 'Shared Name' },
      db,
    );

    const profile2 = await createBrandProfile(
      { organizationId: 'org-2', brandName: 'Shared Name' },
      db,
    );

    expect(profile2.brand_name).toBe('Shared Name');
  });

  it('createBrandProfile defaults arrays to empty', async () => {
    const db = createMockDb();

    const profile = await createBrandProfile(
      { organizationId: 'org-1', brandName: 'Minimal Brand' },
      db,
    );

    expect(profile.tone_keywords).toEqual([]);
    expect(profile.forbidden_words).toEqual([]);
    expect(profile.required_disclaimers).toEqual([]);
    expect(profile.voice_examples).toEqual([]);
  });

  it('getBrandProfile returns null for non-existent id', async () => {
    const db = createMockDb();

    const result = await getBrandProfile('non-existent', db);
    expect(result).toBeNull();
  });

  it('getBrandProfile returns profile by id', async () => {
    const db = createMockDb();

    const created = await createBrandProfile(
      { organizationId: 'org-1', brandName: 'Findable Brand' },
      db,
    );

    const found = await getBrandProfile(created.id, db);
    expect(found).not.toBeNull();
    expect(found!.brand_name).toBe('Findable Brand');
  });

  it('listBrandProfiles returns paginated results', async () => {
    const db = createMockDb();

    const result = await listBrandProfiles('org-1', { limit: 10 }, db);
    expect(result).toHaveProperty('profiles');
    expect(result).toHaveProperty('total');
    expect(Array.isArray(result.profiles)).toBe(true);
  });

  it('listBrandProfiles filters inactive by default', async () => {
    const db = createMockDb();
    await listBrandProfiles('org-1', {}, db);

    const countCall = db.query.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('COUNT'),
    );
    expect(countCall?.[0]).toContain('active = true');
  });

  it('listBrandProfiles includes inactive when requested', async () => {
    const db = createMockDb();
    await listBrandProfiles('org-1', { includeInactive: true }, db);

    const countCall = db.query.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('COUNT'),
    );
    expect(countCall?.[0]).not.toContain('active = true');
  });

  it('updateBrandProfile returns existing profile when no updates provided', async () => {
    const db = createMockDb();
    const created = await createBrandProfile(
      { organizationId: 'org-1', brandName: 'No Change' },
      db,
    );

    const result = await updateBrandProfile(created.id, {}, db);
    expect(result).not.toBeNull();
  });

  it('updateBrandProfile rejects empty brand name', async () => {
    const db = createMockDb();

    await expect(
      updateBrandProfile('bp-1', { brandName: '' }, db),
    ).rejects.toThrow('Brand name cannot be empty');
  });

  it('updateBrandProfile builds dynamic SET clause', async () => {
    const db = createMockDb();
    db.getStore().push({
      id: 'bp-1',
      organization_id: 'org-1',
      brand_name: 'Old',
      active: true,
    });

    await updateBrandProfile(
      'bp-1',
      { brandName: 'New Name', toneKeywords: ['bold'] },
      db,
    );

    const updateCall = db.query.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('UPDATE'),
    );
    expect(updateCall?.[0]).toContain('brand_name');
    expect(updateCall?.[0]).toContain('tone_keywords');
    expect(updateCall?.[0]).toContain('updated_at');
  });

  it('updateBrandProfile filters invalid themes during update', async () => {
    const db = createMockDb();
    db.getStore().push({ id: 'bp-1', active: true });

    await updateBrandProfile(
      'bp-1',
      { preferredThemes: ['executive', 'fake_theme', 'warm'] },
      db,
    );

    const updateCall = db.query.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('UPDATE'),
    );
    const params = updateCall?.[1] as unknown[];
    const themesParam = params?.find(
      (p) => Array.isArray(p) && p.includes('executive'),
    );
    expect(themesParam).toEqual(['executive', 'warm']);
  });

  it('deleteBrandProfile soft-deletes (sets active=false)', async () => {
    const db = createMockDb();
    db.getStore().push({ id: 'bp-1', active: true });

    const deleted = await deleteBrandProfile('bp-1', db);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('active = false'),
      expect.any(Array),
    );
    expect(deleted).toBe(true);
  });

  it('deleteBrandProfile returns false for already inactive profile', async () => {
    const db = createMockDb();

    const deleted = await deleteBrandProfile('non-existent', db);
    expect(deleted).toBe(false);
  });
});

// ── Content Association ──

describe('Brand Profile — Content Association', () => {
  it('setContentBrandProfile updates the content record', async () => {
    const db = createMockDb();
    await setContentBrandProfile('content-1', 'bp-1', db);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('marketing_content'),
      ['bp-1', 'content-1'],
    );
  });

  it('setContentBrandProfile allows null to remove association', async () => {
    const db = createMockDb();
    await setContentBrandProfile('content-1', null, db);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('brand_profile_id = $1'),
      [null, 'content-1'],
    );
  });
});
