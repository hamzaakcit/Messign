/**
 * Brand Profile Service — CRUD for multi-brand management
 *
 * Each workspace can have multiple brand profiles.
 * Content, campaigns, and emails can be associated with a brand.
 * The LLM system prompt uses ONLY the selected brand's data.
 */

import type { DbClient } from './performanceCollector.js';

// ── Types ──

export interface BrandProfile {
  id: string;
  organization_id: string;
  brand_name: string;
  brand_description: string | null;
  logo_url: string | null;
  tone_keywords: string[];
  forbidden_words: string[];
  required_disclaimers: string[];
  voice_examples: string[];
  style_guide_notes: string | null;
  color_palette: Record<string, string>;
  preferred_themes: string[];
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateBrandProfileInput {
  organizationId: string;
  brandName: string;
  brandDescription?: string;
  logoUrl?: string;
  toneKeywords?: string[];
  forbiddenWords?: string[];
  requiredDisclaimers?: string[];
  voiceExamples?: string[];
  styleGuideNotes?: string;
  colorPalette?: Record<string, string>;
  preferredThemes?: string[];
  createdBy?: string;
}

export interface UpdateBrandProfileInput {
  brandName?: string;
  brandDescription?: string;
  logoUrl?: string;
  toneKeywords?: string[];
  forbiddenWords?: string[];
  requiredDisclaimers?: string[];
  voiceExamples?: string[];
  styleGuideNotes?: string;
  colorPalette?: Record<string, string>;
  preferredThemes?: string[];
  active?: boolean;
}

// ── Valid VA2 theme names ──

const VALID_THEMES = [
  'executive', 'startup', 'luxury', 'minimal',
  'bold', 'nature', 'tech', 'warm',
] as const;

function filterValidThemes(themes: string[]): string[] {
  return themes.filter(
    (t): t is typeof VALID_THEMES[number] =>
      VALID_THEMES.includes(t as typeof VALID_THEMES[number]),
  );
}

// ── Service Functions ──

export async function createBrandProfile(
  input: CreateBrandProfileInput,
  db: DbClient,
): Promise<BrandProfile> {
  const {
    organizationId, brandName, brandDescription, logoUrl,
    toneKeywords, forbiddenWords, requiredDisclaimers,
    voiceExamples, styleGuideNotes, colorPalette,
    preferredThemes, createdBy,
  } = input;

  if (!brandName || brandName.trim().length === 0) {
    throw new Error('Brand name is required');
  }

  const validatedThemes = filterValidThemes(preferredThemes || []);

  const dupeCheck = await db.query(
    `SELECT id FROM brand_profiles
     WHERE organization_id = $1 AND LOWER(brand_name) = LOWER($2) AND active = true`,
    [organizationId, brandName.trim()],
  );
  if (dupeCheck.rows.length > 0) {
    throw new Error(`Brand profile "${brandName}" already exists in this workspace`);
  }

  const result = await db.query(
    `INSERT INTO brand_profiles (
      organization_id, brand_name, brand_description, logo_url,
      tone_keywords, forbidden_words, required_disclaimers,
      voice_examples, style_guide_notes,
      color_palette, preferred_themes,
      active, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, $12)
    RETURNING *`,
    [
      organizationId,
      brandName.trim(),
      brandDescription || null,
      logoUrl || null,
      toneKeywords || [],
      forbiddenWords || [],
      requiredDisclaimers || [],
      voiceExamples || [],
      styleGuideNotes || null,
      JSON.stringify(colorPalette || {}),
      validatedThemes,
      createdBy || null,
    ],
  );

  return result.rows[0] as unknown as BrandProfile;
}

export async function getBrandProfile(
  profileId: string,
  db: DbClient,
): Promise<BrandProfile | null> {
  const result = await db.query(
    'SELECT * FROM brand_profiles WHERE id = $1',
    [profileId],
  );
  if (result.rows.length === 0) return null;
  return result.rows[0] as unknown as BrandProfile;
}

export async function listBrandProfiles(
  organizationId: string,
  options: {
    includeInactive?: boolean;
    limit?: number;
    offset?: number;
  },
  db: DbClient,
): Promise<{ profiles: BrandProfile[]; total: number }> {
  const { includeInactive = false, limit = 50, offset = 0 } = options;

  let where = 'WHERE organization_id = $1';
  const countParams: unknown[] = [organizationId];

  if (!includeInactive) {
    where += ' AND active = true';
  }

  const countResult = await db.query(
    `SELECT COUNT(*) as total FROM brand_profiles ${where}`,
    countParams,
  );

  const listResult = await db.query(
    `SELECT * FROM brand_profiles ${where}
     ORDER BY brand_name ASC
     LIMIT $2 OFFSET $3`,
    [organizationId, limit, offset],
  );

  return {
    profiles: listResult.rows as unknown as BrandProfile[],
    total: parseInt(String(countResult.rows[0]?.total ?? 0), 10),
  };
}

export async function updateBrandProfile(
  profileId: string,
  updates: UpdateBrandProfileInput,
  db: DbClient,
): Promise<BrandProfile | null> {
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (updates.brandName !== undefined) {
    if (!updates.brandName || updates.brandName.trim().length === 0) {
      throw new Error('Brand name cannot be empty');
    }
    setClauses.push(`brand_name = $${paramIndex++}`);
    params.push(updates.brandName.trim());
  }
  if (updates.brandDescription !== undefined) {
    setClauses.push(`brand_description = $${paramIndex++}`);
    params.push(updates.brandDescription);
  }
  if (updates.logoUrl !== undefined) {
    setClauses.push(`logo_url = $${paramIndex++}`);
    params.push(updates.logoUrl);
  }
  if (updates.toneKeywords !== undefined) {
    setClauses.push(`tone_keywords = $${paramIndex++}`);
    params.push(updates.toneKeywords);
  }
  if (updates.forbiddenWords !== undefined) {
    setClauses.push(`forbidden_words = $${paramIndex++}`);
    params.push(updates.forbiddenWords);
  }
  if (updates.requiredDisclaimers !== undefined) {
    setClauses.push(`required_disclaimers = $${paramIndex++}`);
    params.push(updates.requiredDisclaimers);
  }
  if (updates.voiceExamples !== undefined) {
    setClauses.push(`voice_examples = $${paramIndex++}`);
    params.push(updates.voiceExamples);
  }
  if (updates.styleGuideNotes !== undefined) {
    setClauses.push(`style_guide_notes = $${paramIndex++}`);
    params.push(updates.styleGuideNotes);
  }
  if (updates.colorPalette !== undefined) {
    setClauses.push(`color_palette = $${paramIndex++}`);
    params.push(JSON.stringify(updates.colorPalette));
  }
  if (updates.preferredThemes !== undefined) {
    setClauses.push(`preferred_themes = $${paramIndex++}`);
    params.push(filterValidThemes(updates.preferredThemes));
  }
  if (updates.active !== undefined) {
    setClauses.push(`active = $${paramIndex++}`);
    params.push(updates.active);
  }

  if (setClauses.length === 0) {
    return getBrandProfile(profileId, db);
  }

  setClauses.push('updated_at = now()');

  params.push(profileId);
  const result = await db.query(
    `UPDATE brand_profiles SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    params,
  );

  if (result.rows.length === 0) return null;
  return result.rows[0] as unknown as BrandProfile;
}

export async function deleteBrandProfile(
  profileId: string,
  db: DbClient,
): Promise<boolean> {
  const result = await db.query(
    'UPDATE brand_profiles SET active = false, updated_at = now() WHERE id = $1 AND active = true RETURNING id',
    [profileId],
  );
  return result.rows.length > 0;
}

export async function getContentBrandProfile(
  contentId: string,
  db: DbClient,
): Promise<BrandProfile | null> {
  const result = await db.query(
    `SELECT bp.* FROM brand_profiles bp
     INNER JOIN marketing_content mc ON mc.brand_profile_id = bp.id
     WHERE mc.id = $1`,
    [contentId],
  );
  if (result.rows.length === 0) return null;
  return result.rows[0] as unknown as BrandProfile;
}

export async function setContentBrandProfile(
  contentId: string,
  brandProfileId: string | null,
  db: DbClient,
): Promise<void> {
  await db.query(
    'UPDATE marketing_content SET brand_profile_id = $1 WHERE id = $2',
    [brandProfileId, contentId],
  );
}

export function formatBrandProfileAsMd(profile: BrandProfile): string {
  const parts = [`## Brand voice profile: ${profile.brand_name}\n`];
  if (profile.brand_description) parts.push(`${profile.brand_description}\n`);
  if (profile.tone_keywords.length) parts.push(`- Tone: ${profile.tone_keywords.join(', ')}`);
  if (profile.forbidden_words.length) parts.push(`- Forbidden words: ${profile.forbidden_words.join(', ')}`);
  if (profile.required_disclaimers.length) parts.push(`- Required disclaimers: ${profile.required_disclaimers.join('; ')}`);
  if (profile.voice_examples.length) {
    parts.push('- Voice examples:');
    for (const ex of profile.voice_examples) parts.push(`  - "${ex}"`);
  }
  if (profile.style_guide_notes) parts.push(`- Style notes: ${profile.style_guide_notes}`);
  if (profile.preferred_themes.length) parts.push(`- Preferred themes: ${profile.preferred_themes.join(', ')}`);
  return parts.join('\n');
}

export async function getBrandProfileContentCounts(
  organizationId: string,
  db: DbClient,
): Promise<Array<{ brand_profile_id: string; brand_name: string; content_count: number }>> {
  const result = await db.query(
    `SELECT
       bp.id as brand_profile_id,
       bp.brand_name,
       COUNT(mc.id)::integer as content_count
     FROM brand_profiles bp
     LEFT JOIN marketing_content mc ON mc.brand_profile_id = bp.id
     WHERE bp.organization_id = $1 AND bp.active = true
     GROUP BY bp.id, bp.brand_name
     ORDER BY content_count DESC`,
    [organizationId],
  );
  return result.rows as unknown as Array<{
    brand_profile_id: string;
    brand_name: string;
    content_count: number;
  }>;
}
