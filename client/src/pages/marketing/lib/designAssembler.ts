// ─────────────────────────────────────────────────────────────────────────────
// Design Assembler — Manifest → Unlayer JSON · v2.0
//
// **VA2 path (primary):** `parseManifestFromLLMOutput` / `validateManifest` → `assembleDesign` or
// `runEmailAssemblyPipeline` (accessibility + optional UTM) → Unlayer `loadDesign`.
//
// **Legacy flat manifest:** bridged by `legacyFlatManifestToVa2` → `runEmailAssemblyPipeline` (see `emailAiDraftToDesign`).
// `assembleLegacyDesign` remains for explicit legacy-only callers — **deprecated** for new work.
// (older Visual Layout Architect JSON with `colorTheme`, `sections[].type` like `hero`/`feature-grid`).
// Use only for `buildEmailDesignFromAiDraft` / messign-architect fallback — new work should emit VA2.
// ─────────────────────────────────────────────────────────────────────────────

import type { UnlayerDesign, UnlayerRow } from './types/unlayer.types';
import type {
  DesignManifest as Va2DesignManifest,
  ManifestSection as Va2ManifestSection,
  ManifestValidationError,
  ManifestValidationResult,
  SectionType,
} from './types/manifestTypes';
import type { ThemeName, SpacingKey } from './types/designTokenTypes';
import { getEffectiveLayoutDensity } from './emailTypography';
import type { AssemblyResult, UnlayerDesign as Va2UnlayerDesign, UnlayerRow as Va2UnlayerRow } from './types/unlayerTypes';
import {
  getTheme,
  getGoogleFontsUrl,
  generateId,
  adjustBrightness,
  mergeBrandIntoTheme,
  type BrandThemeOverrides,
} from './designTokens';
import { getVa2Builder } from './blockBuilders';
import { buildBrandLogoHeaderRowVa2 } from './blockBuilders/va2Shared';
import type { BlockBuilderOptions } from './blockBuilders/types';
import { enforceAccessibility } from './accessibilityEnforcer';
import { injectUTMParameters, type UTMParams } from './utmInjector';

/** Default footer copy when the manifest omits a footer section (replaced by brand profile when provided). */
export interface AutoFooterDefaults {
  companyName: string;
  address: string;
}

export interface AssembleDesignOptions {
  /** Used when auto-injecting a footer row (manifest has no footer section). */
  footerDefaults?: AutoFooterDefaults;
  /** Tenant brand colors from org profile (email builder). */
  brandOverrides?: BrandThemeOverrides;
}
import type {
  DesignManifest,
  ManifestSection,
  ManifestHeroSection,
  ManifestHeadlineSection,
  ManifestBodySection,
  ManifestFeatureGridSection,
  ManifestDividerSection,
  ManifestCTASection,
  ManifestImageTextSection,
  ManifestSocialSection,
  ManifestFooterSection,
  ManifestTestimonialSection,
  LayoutDensity,
} from './types/designManifest.types';
import type { ColorPalette, GoogleFontConfig } from './designTokens';

import { resolvePalette, CONTENT_WIDTH, GOOGLE_FONTS } from './designTokens';
import { normalizePreheaderForEmail } from './preheaderNormalize';
import { TYPICAL_SUBJECT_MAX } from './emailInboxPreview';
import { recordEmailAssemblyPathLegacyAssembleDeprecated } from './emailAssemblyPathMetrics';

export { normalizePreheaderForEmail };
import { buildMultiPhaseOverlay, buildPaperPlaneEffect } from './specialEffects';
import {
  resolveMotionOverlayFromManifest,
  isValidMotionOverlayValue,
  isValidOverlayIntensityValue,
} from './motionOverlayManifest';
import { normalizeVa2SectionContent, upgradeVagueCtasInRaw } from './va2ManifestNormalize';
import { countImageSlotsInManifest } from './emailManifestImageSlots';
import { enrichManifestForVisualDensity, resolveTargetImageSlots } from './enrichManifestVisuals';
import { validateCopyQuality } from './validateCopyQuality.js';
import { trackVa2EmailTelemetry } from './emailMarketingTelemetry';
import {
  buildLogoHeaderRow,
  buildHeroRow,
  buildHeadlineRow,
  buildBodyRow,
  buildFeatureGridRow,
  buildCTARow,
  buildImageTextRow,
  buildDividerRow,
  buildSocialRow,
  buildFooterRow,
  buildTestimonialRow,
  type HeroConfig,
  type FeatureGridConfig,
  type ImageTextConfig,
} from './blockBuilders';

/** Maps manifest `section.variant` to layout rhythm when value is `card`, `band`, or `flush`. */
function layoutVariantFromSectionVariant(raw: string | undefined): BlockBuilderOptions['layoutVariant'] {
  if (!raw || typeof raw !== 'string') return undefined;
  const v = raw.trim().toLowerCase();
  if (v === 'card' || v === 'band' || v === 'flush') return v as 'card' | 'band' | 'flush';
  return undefined;
}

export interface ResolvedAssets {
  heroImageUrl?: string;
  featureImageUrls?: string[];
  imageTextUrls?: Record<number, string>;
}

export interface UnlayerDesignWithCounters extends UnlayerDesign {
  counters: {
    u_row: number;
    u_column: number;
    u_content_text: number;
    u_content_image: number;
  };
}

function countContentBlocks(rows: UnlayerRow[]): {
  u_row: number;
  u_column: number;
  u_content_text: number;
  u_content_image: number;
} {
  let u_content_text = 0;
  let u_content_image = 0;
  let u_column = 0;
  for (const row of rows) {
    u_column += row.columns.length;
    for (const col of row.columns) {
      for (const c of col.contents) {
        if (c.type === 'text') u_content_text += 1;
        if (c.type === 'image') u_content_image += 1;
      }
    }
  }
  return {
    u_row: rows.length,
    u_column,
    u_content_text,
    u_content_image,
  };
}

export function withUnlayerCounters(design: UnlayerDesign): UnlayerDesignWithCounters {
  const c = countContentBlocks(design.body.rows);
  return {
    ...design,
    counters: {
      u_row: c.u_row,
      u_column: c.u_column,
      u_content_text: c.u_content_text,
      u_content_image: c.u_content_image,
    },
  };
}

function buildFontFamilies(fonts: GoogleFontConfig[]): Array<{
  label: string;
  value: string;
  url: string;
  weights: number[];
}> {
  return fonts.map((f) => ({
    label: f.label,
    value: f.value,
    url: f.url,
    weights: f.weights,
  }));
}

function bodyShell(
  rows: UnlayerRow[],
  palette: ColorPalette,
  preheaderText: string,
  manifestMeta: Pick<DesignManifest, 'colorTheme' | 'layout' | 'visualStyle' | 'layoutDensity'>,
): UnlayerDesign['body'] {
  const headingFont = GOOGLE_FONTS.find((f) => f.label === 'Montserrat') ?? GOOGLE_FONTS[0];

  return {
    id: `va_design_${Date.now().toString(36)}`,
    rows,
    headers: [],
    footers: [],
    values: {
      _meta: {
        htmlID: 'u_body',
        htmlClassNames: 'u_body',
        visualArchitectVersion: '2.0',
        colorTheme: manifestMeta.colorTheme,
        layoutPreset: manifestMeta.layout,
        visualStyle: manifestMeta.visualStyle,
        layoutDensity: manifestMeta.layoutDensity,
        googleFonts: buildFontFamilies(GOOGLE_FONTS),
      },
      textColor: palette.text,
      linkColor: palette.primary,
      backgroundColor: palette.background,
      backgroundImage: {
        url: '',
        fullWidth: true,
        repeat: 'no-repeat',
        size: 'custom',
        position: 'center',
      },
      contentWidth: CONTENT_WIDTH,
      contentAlign: 'center',
      fontFamily: {
        label: headingFont.label,
        value: headingFont.value,
        url: headingFont.url,
        weights: headingFont.weights,
      },
      linkStyle: {
        body: true,
        linkColor: palette.primary,
        linkHoverColor: palette.primaryHover,
        linkUnderline: false,
        linkHoverUnderline: true,
      },
      preheaderText,
      popupWidth: '600px',
      popupHeight: 'auto',
      popupPosition: 'center',
      popupDisplay: 'modal',
      popupCloseButton: { backgroundColor: '#CCCCCC', icon: 'close' },
    },
  };
}

/**
 * @deprecated Prefer `legacyFlatManifestToVa2` + `runEmailAssemblyPipeline` so all emails use the VA2 pipeline.
 * Kept for tests and any code that must render legacy JSON without bridging.
 */
export function assembleLegacyDesign(
  manifest: DesignManifest,
  assets: ResolvedAssets = {},
): UnlayerDesignWithCounters {
  recordEmailAssemblyPathLegacyAssembleDeprecated();
  const palette = resolvePalette(manifest.colorTheme);
  const density = manifest.layoutDensity;
  const rows: UnlayerRow[] = [];

  const showHeader = manifest.showBrandHeader !== false;
  if (showHeader) {
    rows.push(buildLogoHeaderRow(palette));
  }

  const legacyMotion = resolveMotionOverlayFromManifest({
    easterEgg: manifest.easterEgg === 'paper_plane' ? 'paper_plane' : undefined,
  });
  if (legacyMotion.enabled) {
    const effectRow = buildPaperPlaneEffect(
      manifest.colorTheme as import('./types/designTokenTypes').ThemeName,
      legacyMotion.intensity,
      undefined,
    );
    rows.unshift(effectRow as unknown as UnlayerRow);
  }

  let imageTextIndex = 0;

  for (const section of manifest.sections) {
    try {
      const row = buildSection(section, palette, assets, imageTextIndex, density);
      if (row) {
        if (Array.isArray(row)) rows.push(...row);
        else rows.push(row);
      }
      if (section.type === 'image-text') imageTextIndex += 1;
    } catch (err) {
      console.warn(
        `[VisualArchitect] Failed to build section "${section.type}":`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (rows.length === 0) {
    return buildSafeMinimalist(assets.heroImageUrl);
  }

  const design: UnlayerDesign = {
    body: bodyShell(rows, palette, manifest.meta.preheader, manifest),
  };

  return withUnlayerCounters(design);
}

function buildSection(
  section: ManifestSection,
  palette: ColorPalette,
  assets: ResolvedAssets,
  imageTextIndex: number,
  density?: LayoutDensity,
): UnlayerRow | UnlayerRow[] | null {
  switch (section.type) {
    case 'hero': {
      const s = section as ManifestHeroSection;
      const heroConfig: HeroConfig = {
        imageUrl:
          assets.heroImageUrl ??
          'https://placehold.co/800x450/1a1a2e/e2e8f0?text=Hero+Background',
        alignment: s.alignment ?? 'center',
        altText: 'Hero',
        headline: s.headline,
        subheadline: s.subheadline,
        cta: s.cta,
        overlayText: s.overlayText,
      };
      return buildHeroRow(heroConfig, palette, density);
    }

    case 'headline':
      return buildHeadlineRow(section as ManifestHeadlineSection, palette, density);

    case 'body':
      return buildBodyRow(section as ManifestBodySection, palette, density);

    case 'feature-grid': {
      const s = section as ManifestFeatureGridSection;
      const gridConfig: FeatureGridConfig = {
        ...s,
        imageUrls: assets.featureImageUrls,
      };
      return buildFeatureGridRow(gridConfig, palette, density);
    }

    case 'divider': {
      const s = section as ManifestDividerSection;
      return buildDividerRow(s.style ?? 'line', palette, density);
    }

    case 'cta':
      return buildCTARow(section as ManifestCTASection, palette, density);

    case 'image-text': {
      const s = section as ManifestImageTextSection;
      const config: ImageTextConfig = {
        ...s,
        imageUrl: assets.imageTextUrls?.[imageTextIndex],
      };
      return buildImageTextRow(config, palette, density);
    }

    case 'testimonial':
      return buildTestimonialRow(section as ManifestTestimonialSection, palette, density);

    case 'social':
      return buildSocialRow(section as ManifestSocialSection, palette);

    case 'footer':
      return buildFooterRow(section as ManifestFooterSection, palette);

    default:
      console.warn(`[VisualArchitect] Unknown section type: "${(section as { type?: string }).type}"`);
      return null;
  }
}

export function buildSafeMinimalist(heroImageUrl?: string): UnlayerDesignWithCounters {
  const palette = resolvePalette('messign_blue');
  const rows: UnlayerRow[] = [];

  rows.push(buildLogoHeaderRow(palette));

  if (heroImageUrl) {
    rows.push(
      buildHeroRow(
        {
          imageUrl: heroImageUrl,
          alignment: 'center',
          headline: 'Your Message Here',
          cta: { text: 'Get Started', url: 'https://messign.com', style: 'pill' },
        },
        palette,
      ),
    );
  } else {
    rows.push(
      buildHeadlineRow(
        { type: 'headline', text: 'Your Message Here', alignment: 'center', level: 'h1' },
        palette,
      ),
    );
  }

  rows.push(
    buildBodyRow(
      {
        type: 'body',
        text: 'Start editing this email to craft your perfect message. The Visual Architect has generated a clean foundation for you.',
        alignment: 'center',
      },
      palette,
    ),
  );

  if (!heroImageUrl) {
    rows.push(
      buildCTARow(
        {
          type: 'cta',
          text: 'Get Started',
          url: 'https://messign.com',
          style: 'rounded',
          alignment: 'center',
        },
        palette,
      ),
    );
  }

  rows.push(buildDividerRow('line', palette));

  rows.push(
    buildFooterRow(
      {
        type: 'footer',
        companyName: 'Messign',
        unsubscribeUrl: '#unsubscribe',
      },
      palette,
    ),
  );

  const minimalManifest: Pick<
    DesignManifest,
    'colorTheme' | 'layout' | 'visualStyle' | 'layoutDensity'
  > = {
    colorTheme: 'messign_blue',
    layout: 'minimalist',
    visualStyle: undefined,
    layoutDensity: undefined,
  };

  const design: UnlayerDesign = {
    body: {
      ...bodyShell(rows, palette, '', minimalManifest),
      id: 'va_safe_minimalist',
    },
  };

  return withUnlayerCounters(design);
}

// ════════════════════════════════════════════════════════════
// Visual Architect v2 — Manifest validation + assembly
// ════════════════════════════════════════════════════════════

/** All valid theme names for validation */
const VALID_THEMES: ThemeName[] = [
  'executive',
  'startup',
  'luxury',
  'minimal',
  'bold',
  'nature',
  'tech',
  'warm',
];

/** All valid section types for validation */
const VALID_SECTION_TYPES: SectionType[] = [
  'hero',
  'value_prop',
  'testimonial',
  'social_proof',
  'cta',
  'divider',
  'footer',
  'text_block',
  'image',
  'image_text',
  'preheader',
  'product_grid',
];

/**
 * When two consecutive `image_text` rows share `image_left` or `image_right`, flip the later row
 * so magazine-style alternation holds (matches strategist guidance; avoids validateManifest noise).
 */
function fixConsecutiveImageTextLayoutsInPlace(sorted: Array<Record<string, unknown>>): void {
  const imageTexts = sorted.filter((s) => s.type === 'image_text');
  for (let j = 1; j < imageTexts.length; j++) {
    const cPrev = imageTexts[j - 1].content as Record<string, unknown>;
    const cCur = imageTexts[j].content as Record<string, unknown>;
    const prev = typeof cPrev.layout === 'string' ? cPrev.layout : 'image_left';
    const cur = typeof cCur.layout === 'string' ? cCur.layout : 'image_left';
    if (prev === cur && (prev === 'image_left' || prev === 'image_right')) {
      cCur.layout = prev === 'image_left' ? 'image_right' : 'image_left';
    }
  }
}

/**
 * Validate a raw input as a DesignManifest (VA2).
 * Returns validation result with errors, warnings, and a normalized manifest if valid.
 */
export function validateManifest(input: unknown): ManifestValidationResult {
  const errors: ManifestValidationError[] = [];
  const warnings: ManifestValidationError[] = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      valid: false,
      errors: [{ field: 'root', message: 'Manifest must be a non-null object', severity: 'error' }],
      warnings: [],
    };
  }

  const raw = input as Record<string, unknown>;

  if (raw.version !== '2.0') {
    warnings.push({
      field: 'version',
      message: `Expected version "2.0", got "${String(raw.version)}". Proceeding anyway.`,
      severity: 'warning',
    });
  }

  let theme = raw.theme as string;
  if (!theme || !VALID_THEMES.includes(theme as ThemeName)) {
    warnings.push({
      field: 'theme',
      message: `Invalid theme "${theme}", defaulting to "minimal"`,
      severity: 'warning',
    });
    theme = 'minimal';
  }

  if (!raw.subject || typeof raw.subject !== 'string' || raw.subject.trim() === '') {
    errors.push({
      field: 'subject',
      message: 'Subject line is required',
      severity: 'error',
    });
  }

  if (!raw.preheader || typeof raw.preheader !== 'string' || raw.preheader.trim() === '') {
    warnings.push({
      field: 'preheader',
      message: 'Preheader missing — will auto-generate from subject line',
      severity: 'warning',
    });
  }

  if (!Array.isArray(raw.sections) || raw.sections.length === 0) {
    errors.push({
      field: 'sections',
      message: 'At least one section is required',
      severity: 'error',
    });
  } else {
    const orders = new Set<number>();

    for (let i = 0; i < raw.sections.length; i++) {
      const section = raw.sections[i] as Record<string, unknown>;

      if (!section.type || typeof section.type !== 'string') {
        errors.push({
          field: `sections[${i}].type`,
          message: `Section at index ${i} is missing a type`,
          severity: 'error',
        });
      } else if (!VALID_SECTION_TYPES.includes(section.type as SectionType)) {
        warnings.push({
          field: `sections[${i}].type`,
          message: `Unknown section type "${section.type}" — will be skipped during assembly`,
          severity: 'warning',
        });
      }

      if (typeof section.order !== 'number') {
        warnings.push({
          field: `sections[${i}].order`,
          message: `Section "${String(section.type)}" has no order — will use index ${i}`,
          severity: 'warning',
        });
        section.order = i;
      }

      if (orders.has(section.order as number)) {
        errors.push({
          field: `sections[${i}].order`,
          message: `Duplicate order ${String(section.order)} — each section must have a unique order (images and layout depend on it)`,
          severity: 'error',
        });
      }
      orders.add(section.order as number);

      if (!section.content || typeof section.content !== 'object' || Array.isArray(section.content)) {
        errors.push({
          field: `sections[${i}].content`,
          message: `Section "${String(section.type)}" at index ${i} has no content`,
          severity: 'error',
        });
      }
    }

    /** Document order (section.order) must match assembly — JSON array order can differ. */
    const sectionsSorted = [...(raw.sections as Array<Record<string, unknown>>)].sort((a, b) => {
      const ao = typeof a.order === 'number' ? a.order : 0;
      const bo = typeof b.order === 'number' ? b.order : 0;
      return ao - bo;
    });
    fixConsecutiveImageTextLayoutsInPlace(sectionsSorted);
    const imageTextLayouts: string[] = [];
    for (const sec of sectionsSorted) {
      if (sec.type === 'image_text') {
        const c = sec.content as Record<string, unknown>;
        imageTextLayouts.push(typeof c.layout === 'string' ? c.layout : 'image_left');
      }
    }
    for (let j = 1; j < imageTextLayouts.length; j++) {
      const prev = imageTextLayouts[j - 1];
      const cur = imageTextLayouts[j];
      if (
        prev === cur &&
        (prev === 'image_left' || prev === 'image_right')
      ) {
        warnings.push({
          field: 'sections',
          message:
            'Multiple image_text sections use the same left/right layout in a row. Alternate image_left and image_right for magazine-style rhythm.',
          severity: 'warning',
        });
        break;
      }
    }
  }

  if (raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)) {
    const meta = raw.metadata as Record<string, unknown>;
    if (meta.channel && meta.channel !== 'email') {
      warnings.push({
        field: 'metadata.channel',
        message: `Channel "${String(meta.channel)}" is not "email" — Visual Architect is email-only`,
        severity: 'warning',
      });
    }
  }

  const isValid = errors.length === 0;
  let normalizedManifest: Va2DesignManifest | undefined;

  if (isValid) {
    if (Array.isArray(raw.sections)) {
      upgradeVagueCtasInRaw(raw);
    }
    const rawMeta =
      raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)
        ? (raw.metadata as Record<string, unknown>)
        : {};

    const subjectStr = raw.subject as string;
    const rawPre = (raw.preheader as string) || subjectStr;
    const rawTis = rawMeta.target_image_slots;
    const targetSlots =
      typeof rawTis === 'number' && Number.isFinite(rawTis) ? Math.floor(rawTis) : undefined;
    const rawVd = rawMeta.visual_density;
    const visualDensity =
      rawVd === 'minimal' || rawVd === 'rich' ? (rawVd as 'minimal' | 'rich') : undefined;

    const rawLd = raw.layoutDensity;
    const layoutDensity: LayoutDensity | undefined =
      typeof rawLd === 'string' ? getEffectiveLayoutDensity(rawLd) : undefined;

    normalizedManifest = {
      version: '2.0',
      theme: theme as ThemeName,
      subject: subjectStr,
      preheader: normalizePreheaderForEmail(rawPre, subjectStr),
      ...(layoutDensity !== undefined ? { layoutDensity } : {}),
      sections: (raw.sections as Va2ManifestSection[]).map((s, i) => {
        const st = String(s.type);
        const content = normalizeVa2SectionContent(st, (s.content as Record<string, unknown>) || {});
        return {
          ...s,
          order: typeof s.order === 'number' ? s.order : i,
          content,
        };
      }),
      metadata: {
        channel: 'email',
        tone: (typeof rawMeta.tone === 'string' ? rawMeta.tone : '') || '',
        audience: (typeof rawMeta.audience === 'string' ? rawMeta.audience : '') || '',
        campaign_id: typeof rawMeta.campaign_id === 'string' ? rawMeta.campaign_id : undefined,
        brand_profile_id: typeof rawMeta.brand_profile_id === 'string' ? rawMeta.brand_profile_id : undefined,
        ab_variant:
          rawMeta.ab_variant === 'A' || rawMeta.ab_variant === 'B'
            ? (rawMeta.ab_variant as 'A' | 'B')
            : undefined,
        ...(visualDensity !== undefined ? { visual_density: visualDensity } : {}),
        ...(targetSlots !== undefined ? { target_image_slots: targetSlots } : {}),
        ...(rawMeta.visual_slots_auto_enriched === true ? { visual_slots_auto_enriched: true } : {}),
      },
      artDirection: raw.artDirection as Va2DesignManifest['artDirection'],
      ...normalizeMotionOverlayFields(raw, warnings),
    };
  }

  if (isValid && normalizedManifest) {
    pushShortPreheaderWarnings(raw as Record<string, unknown>, warnings);
    pushSubjectLengthWarnings(raw as Record<string, unknown>, warnings);
    pushHighTargetImageSlotsWarnings(raw as Record<string, unknown>, warnings);
    pushThinPromotionalManifestWarnings(normalizedManifest, warnings);
    pushRichVisualDensityWarnings(normalizedManifest, warnings);
    pushDuplicateImagePromptWarnings(normalizedManifest, warnings);

    for (const cw of validateCopyQuality(raw as Record<string, unknown>)) {
      warnings.push({
        field: cw.field,
        message: `[Copy Quality · ${cw.severity}] ${cw.message}`,
        severity: 'warning',
      });
    }
  }

  const dedupedWarnings = dedupeManifestValidationWarnings(warnings);
  return { valid: isValid, errors, warnings: dedupedWarnings, normalizedManifest };
}

/** Same field+message should not appear twice (e.g. merged pipelines or duplicate pushes). */
function dedupeManifestValidationWarnings(
  warnings: ManifestValidationError[],
): ManifestValidationError[] {
  const seen = new Set<string>();
  const out: ManifestValidationError[] = [];
  for (const w of warnings) {
    const key = `${w.field}\0${w.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

/**
 * Warn when the **effective** preheader (same expansion as {@link normalizePreheaderForEmail} / assembly)
 * is still short for non-minimal campaigns. Raw LLM output may be brief; the pipeline pads previews to
 * ~100+ chars — we do not warn when normalization already yields a substantive snippet.
 */
function pushShortPreheaderWarnings(
  raw: Record<string, unknown>,
  warnings: ManifestValidationError[],
): void {
  const rawPre = raw.preheader;
  if (typeof rawPre !== 'string' || !rawPre.trim()) return;
  const meta =
    raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)
      ? (raw.metadata as Record<string, unknown>)
      : {};
  if (meta.visual_density === 'minimal') return;
  const subjectStr = typeof raw.subject === 'string' ? raw.subject : '';
  const effective = normalizePreheaderForEmail(rawPre, subjectStr);
  if (effective.trim().length >= 40) return;
  warnings.push({
    field: 'preheader',
    message:
      'Preheader is shorter than 40 characters while visual_density is not minimal; extend copy or set metadata.visual_density to minimal for transactional mail.',
    severity: 'warning',
  });
}

/**
 * Soft warning when subject exceeds typical mobile truncation (aligns with inbox preview guidance).
 */
function pushSubjectLengthWarnings(
  raw: Record<string, unknown>,
  warnings: ManifestValidationError[],
): void {
  const subj = raw.subject;
  if (typeof subj !== 'string' || !subj.trim()) return;
  const len = subj.trim().length;
  if (len > TYPICAL_SUBJECT_MAX) {
    warnings.push({
      field: 'subject',
      message: `Subject is ${len} characters — many mobile clients truncate around ${TYPICAL_SUBJECT_MAX}; put key words first or shorten.`,
      severity: 'warning',
    });
  }
}

/**
 * Warn when target_image_slots approaches the campaign cap (export size / generation cost).
 */
function pushHighTargetImageSlotsWarnings(
  raw: Record<string, unknown>,
  warnings: ManifestValidationError[],
): void {
  const meta =
    raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)
      ? (raw.metadata as Record<string, unknown>)
      : {};
  const tis = meta.target_image_slots;
  if (typeof tis !== 'number' || !Number.isFinite(tis)) return;
  const n = Math.floor(tis);
  if (n >= 11) {
    warnings.push({
      field: 'metadata.target_image_slots',
      message:
        'target_image_slots is 11 or higher (max clamped to 12)—high image counts increase HTML export size and generation time; prefer 6 unless the brief truly needs maximum visuals.',
      severity: 'warning',
    });
  }
}

/** Collect trimmed imagePrompt strings from countable visual slots (same coverage as slot contract). */
function collectImagePromptStrings(manifest: Va2DesignManifest): string[] {
  const out: string[] = [];
  for (const s of manifest.sections) {
    const c = s.content as Record<string, unknown>;
    if (s.type === 'hero' || s.type === 'image_text' || s.type === 'image') {
      const p = c.imagePrompt;
      if (typeof p === 'string' && p.trim()) out.push(p.trim());
    } else if (s.type === 'value_prop' && Array.isArray(c.items)) {
      for (const item of c.items as Record<string, unknown>[]) {
        const p = item.imagePrompt;
        if (typeof p === 'string' && p.trim()) out.push(p.trim());
      }
    } else if (s.type === 'product_grid' && Array.isArray(c.items)) {
      for (const item of c.items as Record<string, unknown>[]) {
        const p = item.imagePrompt;
        if (typeof p === 'string' && p.trim()) out.push(p.trim());
      }
    }
  }
  return out;
}

/**
 * Non-blocking warning when the same imagePrompt string appears on more than one slot.
 */
function pushDuplicateImagePromptWarnings(
  manifest: Va2DesignManifest,
  warnings: ManifestValidationError[],
): void {
  const prompts = collectImagePromptStrings(manifest);
  if (prompts.length < 2) return;
  const counts = new Map<string, number>();
  for (const p of prompts) {
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  const dups = [...counts.entries()].filter(([, n]) => n > 1);
  if (dups.length === 0) return;
  const parts = dups.map(([text, n]) => {
    const short = text.length > 72 ? `${text.slice(0, 69)}…` : text;
    return `${n}× "${short}"`;
  });
  warnings.push({
    field: 'sections',
    message: `Duplicate imagePrompt text across slots (${parts.join('; ')}). Use distinct prompts per hero, image_text, image, value_prop item, or product_grid item so generation and layout stay varied.`,
    severity: 'warning',
  });
}

/**
 * Non-blocking warnings when a promotional manifest has few image slots or little visual section variety.
 * Skips when `metadata.visual_density === 'minimal'`.
 *
 * Emits **one** combined warning when multiple depth checks fail — avoids redundant toasts (slots vs target,
 * visual section count, distinct types with hero) that restate the same fix.
 */
function pushThinPromotionalManifestWarnings(
  manifest: Va2DesignManifest,
  warnings: ManifestValidationError[],
): void {
  if (manifest.metadata?.visual_density === 'minimal') return;

  const slots = countImageSlotsInManifest(manifest);
  const target = resolveTargetImageSlots(manifest);
  const slotGap = slots < target;

  const visualTypes = new Set(['image_text', 'image', 'product_grid', 'value_prop']);
  const visualSectionCount = manifest.sections.filter((s) => visualTypes.has(s.type)).length;
  const lowVisualSections = visualSectionCount < 2;

  const hasHero = manifestHasHeroSection(manifest);
  const transactional = isLikelyTransactionalEmailManifest(manifest);
  const distinctBodyTypes = countDistinctNonStructuralSectionTypes(manifest);
  const lowDistinctWithHero = hasHero && !transactional && distinctBodyTypes < 4;

  if (!slotGap && !lowVisualSections && !lowDistinctWithHero) return;

  const parts: string[] = [];
  if (slotGap) {
    parts.push(`${slots} countable image slot(s) vs target ${target}`);
  }
  if (lowVisualSections) {
    parts.push(
      `only ${visualSectionCount} visual section(s) of type image_text, image, product_grid, or value_prop (use at least two for gallery-style depth; alternate image_left / image_right on image_text when appropriate)`,
    );
  }
  if (lowDistinctWithHero) {
    parts.push(
      `${distinctBodyTypes} distinct section types with a hero (prefer at least four excluding preheader/footer — e.g. value_prop, image_text, product_grid, testimonial, social_proof)`,
    );
  }

  warnings.push({
    field: 'sections',
    message: `Layout richness: ${parts.join(' · ')}. Add sections with distinct imagePrompts per slot, lower metadata.target_image_slots if fewer images are intended, or set metadata.visual_density to "minimal" for text-first mail.`,
    severity: 'warning',
  });
}

/** True when the manifest includes a hero row (promotional “thin depth” rules apply). */
function manifestHasHeroSection(manifest: Va2DesignManifest): boolean {
  return manifest.sections.some((s) => s.type === 'hero');
}

/**
 * Distinct section types excluding preheader and footer — used to nudge Unlayer-gallery-style variety.
 */
function countDistinctNonStructuralSectionTypes(manifest: Va2DesignManifest): number {
  const types = new Set<SectionType>();
  for (const s of manifest.sections) {
    if (s.type === 'preheader' || s.type === 'footer') continue;
    types.add(s.type);
  }
  return types.size;
}

/** Heuristic aligned with enrichManifestVisuals — transactional/system mail should not get promotional depth warnings. */
function isLikelyTransactionalEmailManifest(manifest: Va2DesignManifest): boolean {
  const blob = `${manifest.metadata?.tone ?? ''} ${manifest.subject} ${manifest.preheader}`.toLowerCase();
  return /\b(receipt|order\s+confirm|password\s+reset|reset\s+your\s+password|verify\s+your\s+email|verification\s+code|invoice|shipping\s+confirm|your\s+code\s+is)\b/.test(
    blob,
  );
}

/**
 * When `metadata.visual_density` is explicitly `rich`, nudge magazine-style depth: at least one
 * non-hero section of `image_text`, standalone `image`, or `product_grid` (value_prop-only grids are not enough).
 */
function pushRichVisualDensityWarnings(
  manifest: Va2DesignManifest,
  warnings: ManifestValidationError[],
): void {
  if (manifest.metadata?.visual_density !== 'rich') return;

  const hasMagazineSection = manifest.sections.some((s) => {
    const t = s.type;
    return t === 'image_text' || t === 'image' || t === 'product_grid';
  });
  if (hasMagazineSection) return;

  warnings.push({
    field: 'metadata.visual_density',
    message:
      'visual_density is "rich" but the manifest has no image_text, image, or product_grid section — add at least one for magazine-style layouts (alternate image_left / image_right for multiple image_text rows), or use product_grid waves; value_prop alone is insufficient for rich campaigns.',
    severity: 'warning',
  });
}

/**
 * Map manifest validation warnings to strings for assembly UI (`runEmailAssemblyPipeline` consumers).
 */
export function formatManifestValidationWarningsAsStrings(v: ManifestValidationResult): string[] {
  return v.warnings.map((w) => `Manifest: ${w.message}`);
}

/**
 * Merge motionOverlay / overlayIntensity with legacy easterEgg into normalized VA2 fields.
 */
function normalizeMotionOverlayFields(
  raw: Record<string, unknown>,
  warnings: ManifestValidationError[],
): Pick<Va2DesignManifest, 'motionOverlay' | 'overlayIntensity' | 'easterEgg'> {
  const motionRaw = raw.motionOverlay;
  const intRaw = raw.overlayIntensity;
  const eggRaw = raw.easterEgg;

  let motionOverlay: Va2DesignManifest['motionOverlay'] = 'off';
  let overlayIntensity: Va2DesignManifest['overlayIntensity'] = 'signature';

  if (motionRaw !== undefined && motionRaw !== null && String(motionRaw).trim() !== '') {
    if (isValidMotionOverlayValue(motionRaw)) {
      motionOverlay = motionRaw;
    } else {
      warnings.push({
        field: 'motionOverlay',
        message: `Invalid motionOverlay "${String(motionRaw)}" — use "off" or "paper_plane_sweep"`,
        severity: 'warning',
      });
    }
  }

  if (motionOverlay === 'off' && eggRaw === 'paper_plane') {
    motionOverlay = 'paper_plane_sweep';
    if (raw.motionOverlay === 'off') {
      warnings.push({
        field: 'easterEgg',
        message:
          'Conflicts with motionOverlay: "off" — paper_plane from easterEgg wins; use motionOverlay: "paper_plane_sweep" only',
        severity: 'warning',
      });
    }
  }

  if (intRaw !== undefined && intRaw !== null && String(intRaw).trim() !== '') {
    if (isValidOverlayIntensityValue(intRaw)) {
      overlayIntensity = intRaw;
    } else {
      warnings.push({
        field: 'overlayIntensity',
        message: `Invalid overlayIntensity "${String(intRaw)}" — use "signature" or "subtle"`,
        severity: 'warning',
      });
    }
  }

  return {
    motionOverlay,
    overlayIntensity: motionOverlay === 'paper_plane_sweep' ? overlayIntensity : undefined,
    easterEgg: motionOverlay === 'paper_plane_sweep' ? 'paper_plane' : undefined,
  };
}

/**
 * Assemble a complete Unlayer design from a VA2 DesignManifest.
 */
export function assembleDesign(manifest: Va2DesignManifest, options?: AssembleDesignOptions): AssemblyResult {
  const theme = mergeBrandIntoTheme(getTheme(manifest.theme), options?.brandOverrides);
  const warnings: string[] = [];
  const skippedSections: AssemblyResult['skippedSections'] = [];

  const allRows: Va2UnlayerRow[] = [];

  const sorted = [...manifest.sections].sort((a, b) => a.order - b.order);

  const rootDensity = getEffectiveLayoutDensity(manifest.layoutDensity);

  const hasPreheader = sorted.some((s) => s.type === 'preheader');
  if (!hasPreheader) {
    const preheaderBuilder = getVa2Builder('preheader');
    if (preheaderBuilder) {
      try {
        const preheaderRows = preheaderBuilder({ text: manifest.preheader || manifest.subject }, theme);
        allRows.push(...preheaderRows);
        /* Intentionally no warning: omitting a preheader *section* is normal; manifest.preheader is still applied. */
      } catch (err) {
        warnings.push(`Failed to auto-inject preheader: ${String(err)}`);
      }
    }
  }

  if (options?.brandOverrides?.logoUrl?.trim()) {
    try {
      allRows.push(
        buildBrandLogoHeaderRowVa2(
          theme,
          options.brandOverrides.logoUrl.trim(),
          options.brandOverrides.logoAlt ?? 'Brand logo',
        ),
      );
    } catch (err) {
      warnings.push(`Brand logo row skipped: ${String(err)}`);
    }
  }

  const sectionStartRowMap: number[] = [];

  let sectionRenderIndex = 0;
  for (const section of sorted) {
    sectionStartRowMap.push(allRows.length);

    const builder = getVa2Builder(section.type);

    if (!builder) {
      skippedSections.push({
        order: section.order,
        type: section.type,
        reason: `No builder registered for type "${section.type}"`,
      });
      continue;
    }

    try {
      const spacingOpt =
        typeof section.spacing === 'object' && section.spacing != null
          ? (section.spacing as { paddingTop?: SpacingKey; paddingBottom?: SpacingKey })
          : undefined;
      const densityExtra =
        rootDensity === 'airy' ? ('lg' as SpacingKey) : rootDensity === 'compact' ? ('sm' as SpacingKey) : undefined;
      const mergedSpacing: BlockBuilderOptions['spacing'] | undefined =
        sectionRenderIndex > 0 && section.type !== 'preheader'
          ? {
              ...spacingOpt,
              paddingTop:
                spacingOpt?.paddingTop ??
                (densityExtra !== undefined ? densityExtra : 'md'),
            }
          : spacingOpt;
      const sectionRows = builder(section.content, theme, {
        variant: section.variant,
        layoutVariant: layoutVariantFromSectionVariant(section.variant),
        layoutDensity: rootDensity,
        spacing: mergedSpacing,
      });
      allRows.push(...sectionRows);
      sectionRenderIndex += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      skippedSections.push({
        order: section.order,
        type: section.type,
        reason: message,
      });
      warnings.push(`Section ${section.order} (${section.type}) skipped: ${message}`);
    }
  }

  const hasFooter = sorted.some((s) => s.type === 'footer');
  if (!hasFooter) {
    const footerBuilder = getVa2Builder('footer');
    if (footerBuilder) {
      try {
        const fd = options?.footerDefaults;
        const footerRows = footerBuilder(
          {
            companyName: fd?.companyName ?? 'Company Name',
            address: fd?.address ?? 'Company Address',
            unsubscribeText: `You received this email because you subscribed. <a href="{{unsubscribe_url}}" style="color:${theme.colors.accent};text-decoration:underline">Unsubscribe</a>`,
          },
          theme,
          { layoutDensity: rootDensity },
        );
        allRows.push(...footerRows);
        /* Intentionally no warning: missing footer is common; footerDefaults / Unlayer edit cover branding. */
      } catch (err) {
        warnings.push(`Failed to auto-inject footer: ${String(err)}`);
      }
    }
  }

  const motion = resolveMotionOverlayFromManifest(manifest);
  if (motion.enabled) {
    const brandHex = options?.brandOverrides?.primaryHex;
    const plan = buildMultiPhaseOverlay(
      manifest.sections,
      manifest.theme,
      sectionStartRowMap,
      allRows.length,
      { intensity: motion.intensity, brandPrimaryHex: brandHex },
    );
    if (plan) {
      for (let i = plan.insertionIndices.length - 1; i >= 0; i--) {
        const idx = Math.min(plan.insertionIndices[i], allRows.length);
        allRows.splice(idx, 0, plan.rows[i]);
      }
      warnings.push(
        `Paper plane overlay (${motion.intensity}): ${plan.rows.length} phase(s) injected`,
      );
    }
  }

  const design = wrapInUnlayerBody(allRows, theme, manifest.preheader || manifest.subject);

  return {
    success: true,
    design,
    warnings,
    skippedSections,
    metadata: {
      theme: theme.name as ThemeName,
      sectionCount: allRows.length,
      assembledAt: new Date().toISOString(),
    },
  };
}

function wrapInUnlayerBody(
  rows: Va2UnlayerRow[],
  theme: ReturnType<typeof getTheme>,
  preheaderText: string,
): Va2UnlayerDesign {
  let u_row = 0;
  let u_column = 0;
  let u_content = 0;

  for (const row of rows) {
    u_row += 1;
    for (const col of row.columns) {
      u_column += 1;
      u_content += col.contents.length;
    }
  }

  const fontName = theme.typography.body.fontFamily.split(',')[0].trim();
  const googleFontsUrl = getGoogleFontsUrl(theme);

  const bg = theme.colors.background;
  const bodyBgGradient = `linear-gradient(180deg, ${adjustBrightness(bg, -4)} 0%, ${adjustBrightness(bg, -10)} 100%)`;

  return {
    counters: { u_column, u_row, u_content },
    body: {
      id: generateId('body'),
      rows,
      headers: [],
      footers: [],
      values: {
        backgroundColor: bodyBgGradient,
        backgroundImage: {},
        contentWidth: '600px',
        contentAlign: 'center',
        fontFamily: {
          label: fontName,
          value: theme.typography.body.fontFamily,
          ...(googleFontsUrl ? { url: googleFontsUrl } : {}),
        },
        textColor: theme.colors.text,
        linkStyle: {
          body: true,
          linkColor: theme.colors.accent,
          linkHoverColor: adjustBrightness(theme.colors.accent, -20),
          linkUnderline: true,
          linkHoverUnderline: true,
        },
        preheaderText: preheaderText || '',
        _meta: { htmlID: 'u_body', htmlClassNames: 'v2-architect' },
      },
    },
  };
}

/**
 * Build UTM params when the manifest includes `metadata.campaign_id` (email tracking).
 */
export function utmParamsFromManifestMetadata(manifest: Va2DesignManifest): UTMParams | undefined {
  const id = manifest.metadata?.campaign_id?.trim();
  if (!id) return undefined;
  return {
    utm_source: 'messign',
    utm_medium: 'email',
    utm_campaign: id,
  };
}

/**
 * VA2 assembly + accessibility checks + optional UTM injection (used by the email builder).
 */
export function runEmailAssemblyPipeline(
  manifest: Va2DesignManifest,
  pipeline?: {
    footerDefaults?: AutoFooterDefaults;
    skipUTM?: boolean;
    brandOverrides?: BrandThemeOverrides;
    /** From `validateManifest` — prepended to assembly warnings (thin layout, motion hints). */
    manifestValidationWarnings?: string[];
  },
): AssemblyResult {
  const utm = pipeline?.skipUTM ? undefined : utmParamsFromManifestMetadata(manifest);
  return assembleDesignFull(manifest, {
    utmParams: utm,
    footerDefaults: pipeline?.footerDefaults,
    brandOverrides: pipeline?.brandOverrides,
    manifestValidationWarnings: pipeline?.manifestValidationWarnings,
  });
}

/**
 * Full assembly pipeline with post-processing.
 * Calls assembleDesign, then accessibility enforcement, then optional UTM injection.
 */
export function assembleDesignFull(
  manifest: Va2DesignManifest,
  options?: {
    utmParams?: UTMParams;
    skipAccessibility?: boolean;
    skipUTM?: boolean;
    footerDefaults?: AutoFooterDefaults;
    brandOverrides?: BrandThemeOverrides;
    manifestValidationWarnings?: string[];
  },
): AssemblyResult {
  const manifestForBuild = enrichManifestForVisualDensity(manifest);
  const result = assembleDesign(manifestForBuild, {
    footerDefaults: options?.footerDefaults,
    brandOverrides: options?.brandOverrides,
  });
  if (!result.success || !result.design) return result;

  if (options?.manifestValidationWarnings?.length) {
    result.warnings = [...new Set([...options.manifestValidationWarnings, ...result.warnings])];
  }

  const imageSlotCount = countImageSlotsInManifest(manifestForBuild);
  result.metadata.imageSlotCount = imageSlotCount;
  if (imageSlotCount < 3) {
    result.metadata.layoutRichnessHint = `${imageSlotCount} campaign image slot(s) in this manifest (brand header logo is separate). Add image_text, image, value_prop, or product_grid — aim for 3+ slots for a richer email.`;
  } else if (imageSlotCount > 12) {
    result.metadata.layoutRichnessHint = `${imageSlotCount} image slots — consider trimming toward ~12 for faster generation and load times.`;
  }

  if (!options?.skipAccessibility) {
    const heroSection = manifestForBuild.sections.find((s) => s.type === 'hero');
    const headline = heroSection
      ? (heroSection.content as Record<string, unknown>)?.headline as string | undefined
      : undefined;

    const a11y = enforceAccessibility(result.design, {
      subject: manifest.subject,
      headline,
    });
    result.metadata.accessibilityScore = a11y.score;
    if (a11y.fixes.length > 0) {
      result.warnings.push(`Accessibility: ${a11y.fixes.length} auto-fixes applied`);
    }
    if (a11y.warnings.length > 0) {
      result.metadata.accessibilityWarnings = [...a11y.warnings];
      for (const line of a11y.warnings) {
        result.warnings.push(`Accessibility: ${line}`);
      }
    }
  }

  if (!options?.skipUTM && options?.utmParams) {
    const utm = injectUTMParameters(result.design, options.utmParams);
    if (utm.modifiedCount > 0) {
      result.warnings.push(`UTM: added tracking to ${utm.modifiedCount} links`);
    }
  }

  trackVa2EmailTelemetry('email_assembly_complete', {
    theme: result.metadata.theme,
    sectionCount: result.metadata.sectionCount,
    imageSlotCount: result.metadata.imageSlotCount,
    accessibilityScore: result.metadata.accessibilityScore,
  });

  return result;
}
