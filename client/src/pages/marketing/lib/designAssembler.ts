// ─────────────────────────────────────────────────────────────────────────────
// Design Assembler — Manifest → Unlayer JSON · v2.0
// ─────────────────────────────────────────────────────────────────────────────

import type { UnlayerDesign, UnlayerRow } from './types/unlayer.types';
import type {
  DesignManifest as Va2DesignManifest,
  ManifestSection as Va2ManifestSection,
  ManifestValidationError,
  ManifestValidationResult,
  SectionType,
} from './types/manifestTypes';
import type { ThemeName } from './types/designTokenTypes';
import type { AssemblyResult, UnlayerDesign as Va2UnlayerDesign, UnlayerRow as Va2UnlayerRow } from './types/unlayerTypes';
import {
  getTheme,
  getGoogleFontsUrl,
  generateId,
  adjustBrightness,
} from './designTokens';
import { getVa2Builder } from './blockBuilders';
import { enforceAccessibility } from './accessibilityEnforcer';
import { injectUTMParameters, type UTMParams } from './utmInjector';
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
import { buildMultiPhaseOverlay, buildPaperPlaneEffect, isValidEasterEgg } from './specialEffects';

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

export function assembleLegacyDesign(
  manifest: DesignManifest,
  assets: ResolvedAssets = {},
): UnlayerDesignWithCounters {
  const palette = resolvePalette(manifest.colorTheme);
  const density = manifest.layoutDensity;
  const rows: UnlayerRow[] = [];

  const showHeader = manifest.showBrandHeader !== false;
  if (showHeader) {
    rows.push(buildLogoHeaderRow(palette));
  }

  if (manifest.easterEgg === 'paper_plane') {
    const effectRow = buildPaperPlaneEffect(manifest.colorTheme as import('./types/designTokenTypes').ThemeName);
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
  'stats_counter',
  'logo_bar',
];

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
        warnings.push({
          field: `sections[${i}].order`,
          message: `Duplicate order ${String(section.order)} — may cause unpredictable ordering`,
          severity: 'warning',
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
    const rawMeta =
      raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)
        ? (raw.metadata as Record<string, unknown>)
        : {};

    normalizedManifest = {
      version: '2.0',
      theme: theme as ThemeName,
      subject: raw.subject as string,
      preheader: (raw.preheader as string) || (raw.subject as string),
      sections: (raw.sections as Va2ManifestSection[]).map((s, i) => ({
        ...s,
        order: typeof s.order === 'number' ? s.order : i,
      })),
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
      },
      artDirection: raw.artDirection as Va2DesignManifest['artDirection'],
      easterEgg: isValidEasterEgg(raw.easterEgg) ? raw.easterEgg : undefined,
    };
  }

  return { valid: isValid, errors, warnings, normalizedManifest };
}

/**
 * Assemble a complete Unlayer design from a VA2 DesignManifest.
 */
export function assembleDesign(manifest: Va2DesignManifest): AssemblyResult {
  const theme = getTheme(manifest.theme);
  const warnings: string[] = [];
  const skippedSections: AssemblyResult['skippedSections'] = [];

  const allRows: Va2UnlayerRow[] = [];

  const sorted = [...manifest.sections].sort((a, b) => a.order - b.order);

  const hasPreheader = sorted.some((s) => s.type === 'preheader');
  if (!hasPreheader) {
    const preheaderBuilder = getVa2Builder('preheader');
    if (preheaderBuilder) {
      try {
        const preheaderRows = preheaderBuilder({ text: manifest.preheader || manifest.subject }, theme);
        allRows.push(...preheaderRows);
        warnings.push('Auto-injected preheader section (not in manifest)');
      } catch (err) {
        warnings.push(`Failed to auto-inject preheader: ${String(err)}`);
      }
    }
  }

  const sectionStartRowMap: number[] = [];

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
      const spacingOpt = typeof section.spacing === 'object' && section.spacing != null
        ? (section.spacing as { paddingTop?: import('./types/designTokenTypes').SpacingKey; paddingBottom?: import('./types/designTokenTypes').SpacingKey })
        : undefined;
      const sectionRows = builder(section.content, theme, {
        variant: section.variant,
        spacing: spacingOpt,
      });
      allRows.push(...sectionRows);
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
        const footerRows = footerBuilder(
          {
            companyName: 'Company Name',
            address: 'Company Address',
            unsubscribeText: `You received this email because you subscribed. <a href="{{unsubscribe_url}}" style="color:${theme.colors.accent};text-decoration:underline">Unsubscribe</a>`,
          },
          theme,
        );
        allRows.push(...footerRows);
        warnings.push('Auto-injected default footer (update company details in Unlayer)');
      } catch (err) {
        warnings.push(`Failed to auto-inject footer: ${String(err)}`);
      }
    }
  }

  if (manifest.easterEgg && manifest.easterEgg !== 'none') {
    const plan = buildMultiPhaseOverlay(
      manifest.sections,
      manifest.theme,
      sectionStartRowMap,
      allRows.length,
    );
    if (plan) {
      for (let i = plan.insertionIndices.length - 1; i >= 0; i--) {
        const idx = Math.min(plan.insertionIndices[i], allRows.length);
        allRows.splice(idx, 0, plan.rows[i]);
      }
      warnings.push(`Paper plane overlay: ${plan.rows.length} phases injected`);
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

  return {
    counters: { u_column, u_row, u_content },
    body: {
      id: generateId('body'),
      rows,
      headers: [],
      footers: [],
      values: {
        backgroundColor: adjustBrightness(theme.colors.background, -8),
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
 * Full assembly pipeline with post-processing.
 * Calls assembleDesign, then accessibility enforcement, then optional UTM injection.
 */
export function assembleDesignFull(
  manifest: Va2DesignManifest,
  options?: {
    utmParams?: UTMParams;
    skipAccessibility?: boolean;
    skipUTM?: boolean;
  },
): AssemblyResult {
  const result = assembleDesign(manifest);
  if (!result.success || !result.design) return result;

  if (!options?.skipAccessibility) {
    const heroSection = manifest.sections.find((s) => s.type === 'hero');
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
      result.warnings.push(`Accessibility: ${a11y.warnings.length} issues need manual review`);
    }
  }

  if (!options?.skipUTM && options?.utmParams) {
    const utm = injectUTMParameters(result.design, options.utmParams);
    if (utm.modifiedCount > 0) {
      result.warnings.push(`UTM: added tracking to ${utm.modifiedCount} links`);
    }
  }

  return result;
}
