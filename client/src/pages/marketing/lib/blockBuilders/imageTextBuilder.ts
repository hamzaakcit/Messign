import type {
  UnlayerRow as Va2UnlayerRow,
  UnlayerContent as Va2UnlayerContent,
} from '../types/unlayerTypes';
import type { ImageTextContent } from '../types/manifestTypes';
import type { DesignTheme, SpacingKey } from '../types/designTokenTypes';
import type { LayoutDensity } from '../types/designManifest.types';
import {
  generateId,
  VA2_IMAGE_TEXT_COLUMN_WIDTH_PX,
  VA2_IMAGE_TEXT_STACKED_WIDTH_PX,
  VA2_SECTION_HORIZONTAL_GUTTER_PX,
} from '../designTokens';
import { buildSubtleCardBorder, createSingleColumnRow, createTwoColumnRow } from './va2Shared';
import type { BlockBuilderOptions } from './types';
import {
  getDensityTypeScale,
  getEffectiveLayoutDensity,
  scaledBodyFontSize,
  scaledCtaFontSize,
  scaledSubheadingFontSize,
} from '../emailTypography';

/**
 * Build an image + text section with side-by-side or stacked layout.
 *
 * Layouts:
 * - `image_left`  — image column left, text column right (default)
 * - `image_right` — text column left, image column right
 * - `image_top`   — single-column stacked: image row then text row
 */
export function buildImageTextSection(
  content: ImageTextContent,
  theme: DesignTheme,
  options?: BlockBuilderOptions,
): Va2UnlayerRow[] {
  const layout = content.layout ?? 'image_left';
  const spacing = theme.spacing;
  const density = getEffectiveLayoutDensity(options?.layoutDensity);
  const densityPad = getDensityTypeScale(density).sectionPaddingTopExtraPx;
  const extraTop =
    (options?.spacing?.paddingTop ? theme.spacing[options.spacing.paddingTop as SpacingKey] : 0) +
    densityPad;

  const rowBg =
    options?.layoutVariant === 'band'
      ? theme.colors.surface
      : theme.colors.background;

  const imageContents = buildImageContents(content, theme, layout);
  const textContents = buildTextContents(content, theme, density);

  if (layout === 'image_top') {
    const imageRow = createSingleColumnRow(imageContents, theme, {
      backgroundColor: rowBg,
      padding: extraTop > 0 ? `${extraTop}px 0px 0px 0px` : '0px',
      className: 'image-text-img-row',
    });
    const textRow = createSingleColumnRow(textContents, theme, {
      backgroundColor: rowBg,
      padding: '0px',
      className: 'image-text-txt-row',
    });
    return [imageRow, textRow];
  }

  const isImageLeft = layout === 'image_left';
  const imgBorder = buildSubtleCardBorder(theme);
  const imgRadius = `${theme.borderRadius}px`;
  const imgPad = `${spacing.sm}px`;
  /** Band + airy: slightly more vertical breathing room for magazine-style alternation. */
  const bandRhythmExtra =
    options?.layoutVariant === 'band' && density === 'airy' ? Math.min(spacing.sm, 8) : 0;

  return [
    createTwoColumnRow(
      isImageLeft ? imageContents : textContents,
      isImageLeft ? textContents : imageContents,
      theme,
      {
        backgroundColor: rowBg,
        padding: `${spacing.md + extraTop + bandRhythmExtra}px 0px`,
        columnPadding: `0px ${VA2_SECTION_HORIZONTAL_GUTTER_PX}px`,
        ...(isImageLeft
          ? {
              leftColumnBgColor: theme.colors.surface,
              leftColumnBorder: imgBorder,
              leftColumnBorderRadius: imgRadius,
              leftColumnPadding: imgPad,
            }
          : {
              rightColumnBgColor: theme.colors.surface,
              rightColumnBorder: imgBorder,
              rightColumnBorderRadius: imgRadius,
              rightColumnPadding: imgPad,
            }),
        className: `image-text-row image-text-${layout}`,
      },
    ),
  ];
}

function buildImageContents(
  content: ImageTextContent,
  theme: DesignTheme,
  layout: ImageTextContent['layout'],
): Va2UnlayerContent[] {
  const spacing = theme.spacing;
  const isStacked = layout === 'image_top';
  const imgDisplayW = isStacked ? VA2_IMAGE_TEXT_STACKED_WIDTH_PX : VA2_IMAGE_TEXT_COLUMN_WIDTH_PX;
  const placeholderMinH = isStacked ? 320 : 220;

  if (!content.imageUrl) {
    const prompt = content.imagePrompt ?? '';
    const placeholderHtml = `<div style="width:100%;min-height:${placeholderMinH}px;background:linear-gradient(135deg,${theme.colors.surface},${theme.colors.primary}22);border-radius:${theme.borderRadius}px;display:flex;align-items:center;justify-content:center;border:2px dashed ${theme.colors.textMuted}44"><p style="color:${theme.colors.textMuted};font-size:13px;text-align:center;font-family:${theme.typography.body.fontFamily};margin:0;padding:20px">${prompt ? 'Image will be generated...' : 'Add an image'}</p></div>`;
    return [{
      id: generateId('content'),
      type: 'html',
      values: {
        html: placeholderHtml,
        containerPadding: `${spacing.sm}px`,
        anchor: '',
        hideDesktop: false,
        hideMobile: false,
        _meta: { htmlID: '', htmlClassNames: 'it-image-placeholder' },
      },
    }];
  }

  return [{
    id: generateId('content'),
    type: 'image',
    values: {
      src: { url: content.imageUrl, width: imgDisplayW, height: 'auto' },
      alt: content.altText || content.headline || 'Image',
      textAlign: 'center',
      containerPadding: `${spacing.sm}px`,
      anchor: '',
      hideDesktop: false,
      hideMobile: false,
      fullWidthOnMobile: true,
      _meta: { htmlID: '', htmlClassNames: 'it-image' },
    },
  }];
}

function buildTextContents(
  content: ImageTextContent,
  theme: DesignTheme,
  density: LayoutDensity,
): Va2UnlayerContent[] {
  const spacing = theme.spacing;
  const typo = theme.typography;
  const headlinePx = scaledSubheadingFontSize(theme, density);
  const bodyPx = scaledBodyFontSize(theme, density);
  const ctaPx = scaledCtaFontSize(theme, density);
  const blocks: Va2UnlayerContent[] = [];

  if (content.headline) {
    blocks.push({
      id: generateId('content'),
      type: 'heading',
      values: {
        text: content.headline,
        headingType: 'h3',
        fontFamily: {
          label: typo.heading.fontFamily.split(',')[0].trim(),
          value: typo.heading.fontFamily,
        },
        fontSize: `${headlinePx}px`,
        fontWeight: typo.heading.fontWeight,
        textAlign: 'left',
        lineHeight: `${Math.round(typo.heading.lineHeight * 100)}%`,
        color: theme.colors.primary,
        containerPadding: `${spacing.md}px ${spacing.sm}px ${spacing.xs}px`,
        anchor: '',
        hideDesktop: false,
        hideMobile: false,
        _meta: { htmlID: '', htmlClassNames: 'it-headline' },
      },
    });
  }

  if (content.body) {
    blocks.push({
      id: generateId('content'),
      type: 'text',
      values: {
        text: `<p style="color:${theme.colors.text};font-size:${bodyPx}px;text-align:left;line-height:${Math.round(typo.body.lineHeight * 100)}%;font-family:${typo.body.fontFamily}">${content.body}</p>`,
        containerPadding: `${spacing.xs}px ${spacing.sm}px ${content.ctaText ? spacing.xs : spacing.md}px`,
        anchor: '',
        hideDesktop: false,
        hideMobile: false,
        _meta: { htmlID: '', htmlClassNames: 'it-body' },
      },
    });
  }

  if (content.ctaText) {
    blocks.push({
      id: generateId('content'),
      type: 'button',
      values: {
        text: content.ctaText,
        href: content.ctaUrl || '#',
        target: '_blank',
        size: { autoWidth: true, width: '100%' },
        padding: `${ctaPx <= 14 ? 10 : 12}px 24px`,
        textAlign: 'left',
        lineHeight: '140%',
        border: {},
        borderRadius: `${Math.min(theme.borderRadius, 24)}px`,
        fontFamily: {
          label: typo.cta.fontFamily.split(',')[0].trim(),
          value: typo.cta.fontFamily,
        },
        fontSize: `${ctaPx}px`,
        fontWeight: typo.cta.fontWeight,
        color: theme.colors.ctaText,
        backgroundColor: theme.colors.ctaPrimary,
        ...(typo.cta.textTransform ? { textTransform: typo.cta.textTransform } : {}),
        ...(typo.cta.letterSpacing ? { letterSpacing: `${typo.cta.letterSpacing}px` } : {}),
        containerPadding: `${spacing.xs}px ${spacing.sm}px ${spacing.md}px`,
        anchor: '',
        hideDesktop: false,
        hideMobile: false,
        _meta: { htmlID: '', htmlClassNames: 'it-cta' },
      },
    });
  }

  return blocks;
}
