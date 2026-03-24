import type {
  UnlayerRow as Va2UnlayerRow,
  UnlayerContent as Va2UnlayerContent,
} from '../types/unlayerTypes';
import type { ImageTextContent } from '../types/manifestTypes';
import type { DesignTheme } from '../types/designTokenTypes';
import { generateId } from '../designTokens';
import { createSingleColumnRow, createTwoColumnRow } from './va2Shared';
import type { BlockBuilderOptions } from './types';

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
  _options?: BlockBuilderOptions,
): Va2UnlayerRow[] {
  const layout = content.layout ?? 'image_left';
  const spacing = theme.spacing;

  const imageContents = buildImageContents(content, theme);
  const textContents = buildTextContents(content, theme);

  if (layout === 'image_top') {
    const imageRow = createSingleColumnRow(imageContents, theme, {
      backgroundColor: theme.colors.background,
      padding: '0px',
      className: 'image-text-img-row',
    });
    const textRow = createSingleColumnRow(textContents, theme, {
      backgroundColor: theme.colors.background,
      padding: '0px',
      className: 'image-text-txt-row',
    });
    return [imageRow, textRow];
  }

  const isImageLeft = layout === 'image_left';

  return [
    createTwoColumnRow(
      isImageLeft ? imageContents : textContents,
      isImageLeft ? textContents : imageContents,
      theme,
      {
        backgroundColor: theme.colors.background,
        padding: `${spacing.md}px 0px`,
        columnPadding: `${spacing.sm}px`,
        className: `image-text-row image-text-${layout}`,
      },
    ),
  ];
}

function buildImageContents(
  content: ImageTextContent,
  theme: DesignTheme,
): Va2UnlayerContent[] {
  const spacing = theme.spacing;

  if (!content.imageUrl) {
    const prompt = content.imagePrompt ?? '';
    const placeholderHtml = `<div style="width:100%;min-height:200px;background:linear-gradient(135deg,${theme.colors.surface},${theme.colors.primary}22);border-radius:${theme.borderRadius}px;display:flex;align-items:center;justify-content:center;border:2px dashed ${theme.colors.textMuted}44"><p style="color:${theme.colors.textMuted};font-size:13px;text-align:center;font-family:${theme.typography.body.fontFamily};margin:0;padding:20px">${prompt ? 'Image will be generated...' : 'Add an image'}</p></div>`;
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
      src: { url: content.imageUrl, width: 300, height: 'auto' },
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
): Va2UnlayerContent[] {
  const spacing = theme.spacing;
  const typo = theme.typography;
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
        fontSize: `${typo.subheading.fontSize}px`,
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
        text: `<p style="color:${theme.colors.text};font-size:${typo.body.fontSize}px;text-align:left;line-height:${Math.round(typo.body.lineHeight * 100)}%;font-family:${typo.body.fontFamily}">${content.body}</p>`,
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
        padding: `${typo.cta.fontSize <= 14 ? 10 : 12}px 24px`,
        textAlign: 'left',
        lineHeight: '140%',
        border: {},
        borderRadius: `${Math.min(theme.borderRadius, 24)}px`,
        fontFamily: {
          label: typo.cta.fontFamily.split(',')[0].trim(),
          value: typo.cta.fontFamily,
        },
        fontSize: `${typo.cta.fontSize}px`,
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
