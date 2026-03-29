import type {
  UnlayerRow as Va2UnlayerRow,
  UnlayerContent as Va2UnlayerContent,
} from '../types/unlayerTypes';
import type { HeroContent } from '../types/manifestTypes';
import type { DesignTheme } from '../types/designTokenTypes';
import {
  generateId,
  adjustBrightness,
  HERO_PHOTO_MIN_HEIGHT_PX,
  VA2_SECTION_HORIZONTAL_GUTTER_PX,
} from '../designTokens';

/** Taller photo hero when manifest sets `heroLayout: editorial_tall` (token-safe). */
const EDITORIAL_TALL_HERO_MIN_HEIGHT_PX = Math.max(HERO_PHOTO_MIN_HEIGHT_PX, 400);
import {
  createSingleColumnRow,
  createTwoColumnRow,
  resolveSectionRowPadding,
} from './va2Shared';
import type { BlockBuilderOptions } from './types';
import {
  getDensityTypeScale,
  getEffectiveLayoutDensity,
  scaledCtaFontSize,
  scaledHeroHeadlineFontSize,
  scaledSubheadingFontSize,
} from '../emailTypography';

/** Escape minimal HTML for hero headline/subhead (email-safe). */
function escapeHeroHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Editorial watermark: one oversized letter behind headline (low contrast).
 */
function buildHeroWatermarkLayer(theme: DesignTheme, raw: string | undefined, opacityOverride?: number): string {
  const ch = raw?.trim().slice(0, 1);
  if (!ch) return '';
  const op =
    opacityOverride !== undefined
      ? Math.min(0.12, Math.max(0.03, opacityOverride))
      : 0.06;
  const safe = escapeHeroHtml(ch);
  const disp = theme.typography.heading.fontFamily;
  return `<div aria-hidden="true" style="position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0"><span style="position:absolute;left:4%;top:10%;font-size:140px;font-weight:800;line-height:1;font-family:${disp};color:${theme.colors.accent};opacity:${op};">${safe}</span></div>`;
}

function heroRowPadding(sectionPad: string, hasImage: boolean, densityExtraPx = 0): string {
  if (sectionPad !== '0px') return sectionPad;
  const extra = Math.min(12, densityExtraPx);
  if (hasImage) return `${56 + extra}px 0 ${72 + extra}px 0`;
  return `${48 + extra}px 0 ${56 + extra}px 0`;
}

function solidHeroBackground(theme: DesignTheme): string {
  return `linear-gradient(135deg, ${theme.colors.primary}, ${adjustBrightness(theme.colors.primary, -18)})`;
}

/**
 * Build the preheader row — hidden preview text for email clients.
 * This MUST be the first row in every assembled email.
 */
export function buildPreheader(
  content: { text: string },
  theme: DesignTheme,
  _options?: BlockBuilderOptions,
): Va2UnlayerRow[] {
  const preheaderText = content.text || 'Preview this email in your browser';

  const padding = Array(75).fill('&zwnj;&nbsp;').join('');

  const htmlContent: Va2UnlayerContent = {
    id: generateId('content'),
    type: 'html',
    values: {
      html: [
        '<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;',
        'max-height:0px;max-width:0px;opacity:0;overflow:hidden;">',
        preheaderText,
        padding,
        '</div>',
      ].join(''),
      hideDesktop: false,
      hideMobile: false,
      containerPadding: '0px',
      anchor: '',
      _meta: { htmlID: '', htmlClassNames: 'preheader' },
    },
  };

  return [
    createSingleColumnRow([htmlContent], theme, {
      backgroundColor: theme.colors.background,
      padding: '0px',
      className: 'preheader-row',
    }),
  ];
}

/**
 * Build the hero section — the eye-catching header of the email.
 *
 * Edge cases handled:
 * - No imageUrl: gradient primary background; optional editorial watermark
 * - Photo hero: min vertical frame, optional imagePosition, watermark
 * - Long headline (>80 chars): fontSize reduced by 20%
 * - No CTA: extra bottom padding
 * - No subheadline: extra spacing between headline and CTA
 *
 * @remarks Visual Architect Phase 11: headline, subhead, and CTA font sizes use density-scaled helpers
 * (`scaledHeroHeadlineFontSize`, `scaledSubheadingFontSize`, `scaledCtaFontSize`) so `layoutDensity` matches
 * other section builders.
 */
export function buildHeroSection(
  content: HeroContent,
  theme: DesignTheme,
  options?: BlockBuilderOptions,
): Va2UnlayerRow[] {
  const spacing = theme.spacing;
  const typo = theme.typography;
  const align = content.alignment ?? 'center';
  const gutter = VA2_SECTION_HORIZONTAL_GUTTER_PX;
  const density = getEffectiveLayoutDensity(options?.layoutDensity);
  const heroPadExtra = getDensityTypeScale(density).sectionPaddingTopExtraPx;

  const baseHeroPx =
    content.headline.length > 80 ? Math.round(typo.hero.fontSize * 0.8) : typo.hero.fontSize;
  const heroFontSize = scaledHeroHeadlineFontSize(theme, density, baseHeroPx);

  const hasImage = Boolean(content.imageUrl);
  const splitHero = content.heroLayout === 'split' && hasImage;
  const editorialTall = content.heroLayout === 'editorial_tall' && hasImage && !splitHero;
  const photoMinHeightPx = editorialTall ? EDITORIAL_TALL_HERO_MIN_HEIGHT_PX : HERO_PHOTO_MIN_HEIGHT_PX;

  if (splitHero) {
    const heroSubPx = scaledSubheadingFontSize(theme, density);
    const heroCtaPx = scaledCtaFontSize(theme, density);
    const heroHeadlineColor = theme.colors.ctaText;
    const heroSubColor = `${theme.colors.ctaText}E6`;
    const padExtra = getDensityTypeScale(density).sectionPaddingTopExtraPx;
    const h1Split = `<h1 style="margin:0;padding:0;font-family:${typo.hero.fontFamily};font-size:${heroFontSize}px;font-weight:${typo.hero.fontWeight};line-height:${Math.round(typo.hero.lineHeight * 100)}%;letter-spacing:${typo.hero.letterSpacing !== undefined ? `${typo.hero.letterSpacing}px` : '0'};text-transform:${typo.hero.textTransform ?? 'none'};color:${heroHeadlineColor};text-align:${align};">${escapeHeroHtml(content.headline)}</h1>`;
    const subSplit =
      content.subheadline !== undefined && content.subheadline !== ''
        ? `<p style="margin:${spacing.xs + padExtra}px 0 0;padding:0;font-size:${heroSubPx}px;color:${heroSubColor};text-align:${align};line-height:${Math.round(typo.subheading.lineHeight * 100)}%;font-family:${typo.subheading.fontFamily};">${escapeHeroHtml(content.subheadline)}</p>`
        : '';
    const leftHtml = `<div style="padding:0;">${h1Split}${subSplit}</div>`;
    const leftContents: Va2UnlayerContent[] = [
      {
        id: generateId('content'),
        type: 'html',
        values: {
          html: leftHtml,
          containerPadding: `${spacing.md}px 0`,
          anchor: '',
          hideDesktop: false,
          hideMobile: false,
          _meta: { htmlID: '', htmlClassNames: 'hero-split-copy' },
        },
      },
    ];
    if (content.ctaText) {
      leftContents.push({
        id: generateId('content'),
        type: 'button',
        values: {
          text: content.ctaText,
          href: {
            name: 'web',
            values: { href: content.ctaUrl ?? '#', target: '_blank' },
          },
          buttonColors: {
            color: theme.colors.ctaText,
            backgroundColor: theme.colors.ctaPrimary,
            hoverColor: theme.colors.ctaText,
            hoverBackgroundColor: adjustBrightness(theme.colors.ctaPrimary, -15),
          },
          size: { autoWidth: true, width: '100%' },
          padding: `${spacing.sm}px ${spacing.lg}px`,
          borderRadius: `${theme.borderRadius}px`,
          fontFamily: {
            label: typo.cta.fontFamily.split(',')[0].trim(),
            value: typo.cta.fontFamily,
          },
          fontSize: `${heroCtaPx}px`,
          fontWeight: typo.cta.fontWeight,
          textAlign: 'center',
          lineHeight: `${Math.round(typo.cta.lineHeight * 100)}%`,
          letterSpacing: typo.cta.letterSpacing !== undefined ? `${typo.cta.letterSpacing}px` : undefined,
          textTransform: typo.cta.textTransform ?? 'none',
          containerPadding: `${spacing.md}px 0 0`,
          anchor: '',
          hideDesktop: false,
          hideMobile: false,
          calculatedWidth: null,
          calculatedHeight: null,
          _meta: { htmlID: '', htmlClassNames: 'hero-split-cta' },
        },
      });
    }
    const rightContents: Va2UnlayerContent[] = [
      {
        id: generateId('content'),
        type: 'image',
        values: {
          src: { url: content.imageUrl!, width: 280, height: 'auto' },
          alt: typeof content.altText === 'string' ? content.altText : 'Hero',
          textAlign: 'center',
          containerPadding: '0px',
          anchor: '',
          hideDesktop: false,
          hideMobile: false,
          _meta: { htmlID: '', htmlClassNames: 'hero-split-image' },
        },
      },
    ];
    const sectionPad = resolveSectionRowPadding(theme, options);
    return [
      createTwoColumnRow(leftContents, rightContents, theme, {
        backgroundColor: theme.colors.background,
        padding: heroRowPadding(sectionPad, false, heroPadExtra),
        leftColumnPadding: `${spacing.lg}px ${gutter}px`,
        rightColumnPadding: `${spacing.sm}px ${gutter}px`,
        className: 'hero-section hero-split',
      }),
    ];
  }

  /** On solid primary use theme CTA text color; on photo hero use white + shadow for contrast. */
  const heroHeadlineColor = hasImage ? '#FFFFFF' : theme.colors.ctaText;
  const heroSubColor = hasImage ? 'rgba(255,255,255,0.92)' : `${theme.colors.ctaText}E6`;
  const subPx = scaledSubheadingFontSize(theme, density);
  const ctaPxHero = scaledCtaFontSize(theme, density);

  const watermarkOpacity =
    typeof content.watermarkOpacity === 'number' ? content.watermarkOpacity : undefined;
  const explicitInitial =
    typeof content.decorativeInitial === 'string' ? content.decorativeInitial.trim().slice(0, 1) : '';
  const inferredInitial =
    watermarkOpacity !== undefined && !explicitInitial && content.headline?.trim()
      ? content.headline.trim().slice(0, 1)
      : '';
  const watermarkRaw = explicitInitial || inferredInitial || undefined;
  const showWatermark = Boolean(watermarkRaw?.trim());

  const contents: Va2UnlayerContent[] = [];

  const headlinePadTop = spacing.xl + Math.min(12, heroPadExtra);
  const headlinePadding = `${headlinePadTop}px ${gutter}px ${content.subheadline ? spacing.xs : spacing.md}px`;

  const heroPhotoShadow =
    '0 1px 2px rgba(0,0,0,0.55),0 2px 18px rgba(0,0,0,0.4)';
  const h1Inner = `<h1 style="margin:0;padding:0;position:relative;z-index:1;font-family:${typo.hero.fontFamily};font-size:${heroFontSize}px;font-weight:${typo.hero.fontWeight};line-height:${Math.round(typo.hero.lineHeight * 100)}%;letter-spacing:${typo.hero.letterSpacing !== undefined ? `${typo.hero.letterSpacing}px` : '0'};text-transform:${typo.hero.textTransform ?? 'none'};color:${heroHeadlineColor};text-align:${align};text-shadow:${hasImage ? heroPhotoShadow : 'none'};">${escapeHeroHtml(content.headline)}</h1>`;

  if (hasImage) {
    const panelBottom =
      content.subheadline !== undefined && content.subheadline !== ''
        ? content.ctaText
          ? spacing.md
          : spacing.lg
        : content.ctaText
          ? spacing.md
          : spacing.xl;
    /** Lighter bottom stop keeps the photo readable; headline shadow covers contrast (WCAG on white text). */
    const panelBg = `linear-gradient(180deg, ${theme.colors.heroOverlayStart} 0%, ${theme.colors.heroOverlayEnd} 45%, rgba(0,0,0,0.28) 100%)`;
    const panelPad = `${spacing.xl + Math.min(12, heroPadExtra)}px ${gutter}px ${panelBottom}px`;
    const subHtml =
      content.subheadline !== undefined && content.subheadline !== ''
        ? `<p style="margin:${spacing.xs}px 0 0;padding:0;font-size:${subPx}px;color:${heroSubColor};text-align:${align};line-height:${Math.round(typo.subheading.lineHeight * 100)}%;font-family:${typo.subheading.fontFamily};text-shadow:${heroPhotoShadow};">${escapeHeroHtml(content.subheadline)}</p>`
        : '';
    const wm = showWatermark ? buildHeroWatermarkLayer(theme, watermarkRaw, watermarkOpacity) : '';
    const wrapOpen = showWatermark
      ? `<div style="position:relative;min-height:${photoMinHeightPx}px;display:block;">`
      : '';
    const wrapClose = showWatermark ? '</div>' : '';
    const h1Block = showWatermark ? `${wrapOpen}${wm}${h1Inner}${wrapClose}` : h1Inner;
    const panelMinStyle = editorialTall ? `min-height:${photoMinHeightPx}px;` : '';
    const panelHtml = [
      `<div style="background:${panelBg};padding:${panelPad};margin:0 -${gutter}px;position:relative;z-index:1;${panelMinStyle}">`,
      h1Block,
      subHtml,
      '</div>',
    ].join('');
    contents.push({
      id: generateId('content'),
      type: 'html',
      values: {
        html: panelHtml,
        containerPadding: '0px',
        anchor: '',
        hideDesktop: false,
        hideMobile: false,
        _meta: { htmlID: '', htmlClassNames: 'hero-headline hero-text-panel' },
      },
    });
  } else if (showWatermark) {
    const wm = buildHeroWatermarkLayer(theme, watermarkRaw, watermarkOpacity);
    const h1Html = `<div style="position:relative;display:block;min-height:240px;">${wm}${h1Inner}</div>`;
    contents.push({
      id: generateId('content'),
      type: 'html',
      values: {
        html: h1Html,
        containerPadding: headlinePadding,
        anchor: '',
        hideDesktop: false,
        hideMobile: false,
        _meta: { htmlID: '', htmlClassNames: 'hero-headline' },
      },
    });
  } else {
    contents.push({
      id: generateId('content'),
      type: 'heading',
      values: {
        text: content.headline,
        headingType: 'h1',
        fontFamily: {
          label: typo.hero.fontFamily.split(',')[0].trim(),
          value: typo.hero.fontFamily,
        },
        fontSize: `${heroFontSize}px`,
        fontWeight: typo.hero.fontWeight,
        textAlign: align,
        lineHeight: `${Math.round(typo.hero.lineHeight * 100)}%`,
        letterSpacing: typo.hero.letterSpacing !== undefined ? `${typo.hero.letterSpacing}px` : undefined,
        textTransform: typo.hero.textTransform ?? 'none',
        color: heroHeadlineColor,
        containerPadding: headlinePadding,
        anchor: '',
        hideDesktop: false,
        hideMobile: false,
        _meta: { htmlID: '', htmlClassNames: 'hero-headline' },
      },
    });
  }

  if (content.subheadline && !hasImage) {
    contents.push({
      id: generateId('content'),
      type: 'text',
      values: {
        text: `<p style="font-size:${subPx}px;color:${heroSubColor};text-align:${align};line-height:${Math.round(typo.subheading.lineHeight * 100)}%;font-family:${typo.subheading.fontFamily};">${escapeHeroHtml(content.subheadline)}</p>`,
        containerPadding: `${spacing.xs}px ${gutter}px ${content.ctaText ? spacing.md : spacing.lg}px`,
        anchor: '',
        hideDesktop: false,
        hideMobile: false,
        _meta: { htmlID: '', htmlClassNames: 'hero-subheadline' },
      },
    });
  }

  if (content.ctaText) {
    contents.push({
      id: generateId('content'),
      type: 'button',
      values: {
        text: content.ctaText,
        href: {
          name: 'web',
          values: { href: content.ctaUrl ?? '#', target: '_blank' },
        },
        buttonColors: {
          color: theme.colors.ctaText,
          backgroundColor: theme.colors.ctaPrimary,
          hoverColor: theme.colors.ctaText,
          hoverBackgroundColor: adjustBrightness(theme.colors.ctaPrimary, -15),
        },
        size: { autoWidth: true, width: '100%' },
        padding: `${spacing.sm}px ${spacing.lg}px`,
        borderRadius: `${theme.borderRadius}px`,
        fontFamily: {
          label: typo.cta.fontFamily.split(',')[0].trim(),
          value: typo.cta.fontFamily,
        },
        fontSize: `${ctaPxHero}px`,
        fontWeight: typo.cta.fontWeight,
        textAlign: 'center',
        lineHeight: `${Math.round(typo.cta.lineHeight * 100)}%`,
        letterSpacing: typo.cta.letterSpacing !== undefined ? `${typo.cta.letterSpacing}px` : undefined,
        textTransform: typo.cta.textTransform ?? 'none',
        containerPadding: `${spacing.sm}px ${gutter}px ${spacing.xl}px`,
        anchor: '',
        hideDesktop: false,
        hideMobile: false,
        calculatedWidth: null,
        calculatedHeight: null,
        _meta: { htmlID: '', htmlClassNames: 'hero-cta' },
      },
    });
  }

  if (!content.ctaText && !content.subheadline && !hasImage) {
    const headlineValues = contents[0].values as Record<string, unknown>;
    headlineValues.containerPadding = `${spacing.xl}px ${gutter}px ${spacing.xl}px`;
  }

  const sectionPad = resolveSectionRowPadding(theme, options);
  const rowPad = heroRowPadding(sectionPad, hasImage, heroPadExtra);
  const imgPos = typeof content.imagePosition === 'string' && content.imagePosition.trim()
    ? content.imagePosition.trim()
    : 'center center';

  const rowBg = hasImage ? theme.colors.primary : solidHeroBackground(theme);

  return [
    createSingleColumnRow(contents, theme, {
      backgroundColor: rowBg,
      backgroundImage: hasImage
        ? {
            url: content.imageUrl!,
            fullWidth: true,
            repeat: 'no-repeat',
            size: 'cover',
            position: imgPos,
          }
        : undefined,
      padding: rowPad,
      columnPadding: `0px ${gutter}px`,
      className: 'hero-section',
    }),
  ];
}
