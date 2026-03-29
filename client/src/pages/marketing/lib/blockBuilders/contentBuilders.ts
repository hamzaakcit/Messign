import type {
  UnlayerRow as Va2UnlayerRow,
  UnlayerColumn as Va2UnlayerColumn,
  UnlayerContent as Va2UnlayerContent,
} from '../types/unlayerTypes';
import type {
  TextBlockContent,
  ImageContent,
  ValuePropContent,
  ValuePropItem,
} from '../types/manifestTypes';
import type { DesignTheme } from '../types/designTokenTypes';
import { generateId, VA2_SECTION_HORIZONTAL_GUTTER_PX } from '../designTokens';
import { buildSubtleCardBorder, createSingleColumnRow } from './va2Shared';
import type { BlockBuilderOptions } from './types';
import {
  getDensityTypeScale,
  getEffectiveLayoutDensity,
  scaledBodyFontSize,
  scaledSectionHeadingFromTheme,
  scaledSubheadingFontSize,
} from '../emailTypography';

/**
 * Build a simple text block — body paragraph(s).
 */
export function buildTextBlock(
  content: TextBlockContent,
  theme: DesignTheme,
  options?: BlockBuilderOptions,
): Va2UnlayerRow[] {
  if (!content.body) return [];

  const spacing = theme.spacing;
  const typo = theme.typography;
  const density = getEffectiveLayoutDensity(options?.layoutDensity);
  const densityExtra = getDensityTypeScale(density).sectionPaddingTopExtraPx;
  const align = content.alignment || 'left';
  const g = VA2_SECTION_HORIZONTAL_GUTTER_PX;
  const wantCard =
    Boolean(content.insetCard) || options?.layoutVariant === 'card';
  const isBand = options?.layoutVariant === 'band';
  const isFlush = options?.layoutVariant === 'flush';
  const padV = spacing.md + Math.min(6, densityExtra);
  const padH = `${padV}px ${g}px`;
  const bodyPx = scaledBodyFontSize(theme, density);

  const textContent: Va2UnlayerContent = {
    id: generateId('content'),
    type: 'text',
    values: {
      text: `<p style="color:${theme.colors.text};font-size:${bodyPx}px;text-align:${align};line-height:${Math.round(typo.body.lineHeight * 100)}%;font-family:${typo.body.fontFamily}">${content.body}</p>`,
      containerPadding: wantCard ? `${spacing.md}px ${spacing.md}px` : isFlush ? `${padV}px ${spacing.sm}px` : padH,
      anchor: '',
      hideDesktop: false,
      hideMobile: false,
      _meta: { htmlID: '', htmlClassNames: 'text-block' },
    },
  };

  if (wantCard) {
    return [
      createSingleColumnRow([textContent], theme, {
        backgroundColor: theme.colors.background,
        padding: `${spacing.md + Math.min(4, Math.round(densityExtra / 2))}px ${g}px`,
        className: 'text-block-row text-block-card',
        columnBgColor: theme.colors.surface,
        columnPadding: `${spacing.sm}px 0px`,
        columnBorderRadius: `${theme.borderRadius}px`,
        columnBorder: buildSubtleCardBorder(theme),
      }),
    ];
  }

  if (isBand) {
    return [
      createSingleColumnRow([textContent], theme, {
        backgroundColor: theme.colors.surface,
        padding: padH,
        className: 'text-block-row text-block-band',
      }),
    ];
  }

  if (isFlush) {
    return [
      createSingleColumnRow([textContent], theme, {
        backgroundColor: theme.colors.background,
        padding: `${padV}px ${g}px`,
        className: 'text-block-row text-block-flush',
      }),
    ];
  }

  return [
    createSingleColumnRow([textContent], theme, {
      backgroundColor: theme.colors.background,
      padding: densityExtra > 0 ? `${Math.min(8, densityExtra)}px 0` : '0px',
      className: 'text-block-row',
    }),
  ];
}

/**
 * Build a standalone image block with optional caption and link.
 *
 * Width options:
 * - "full": 600px (full content width)
 * - "medium": 400px centered
 * - "small": 200px centered
 */
export function buildImageBlock(
  content: ImageContent,
  theme: DesignTheme,
  options?: BlockBuilderOptions,
): Va2UnlayerRow[] {
  const spacing = theme.spacing;
  const typo = theme.typography;
  const g = VA2_SECTION_HORIZONTAL_GUTTER_PX;
  const layout = options?.layoutVariant ?? 'card';
  const density = getEffectiveLayoutDensity(options?.layoutDensity);
  const extraTop = getDensityTypeScale(density).sectionPaddingTopExtraPx;
  const bodyPx = scaledBodyFontSize(theme, density);
  const captionPx = Math.max(12, Math.round(bodyPx * 0.88));

  const rowBg =
    layout === 'band' ? theme.colors.surface : theme.colors.background;

  const padTopBase = spacing.md + extraTop;
  const placeholderFontPx = bodyPx;

  if (!content.imageUrl) {
    const placeholderHtml = `<div style="width:100%;min-height:180px;background:linear-gradient(135deg,${theme.colors.surface},${theme.colors.primary}22);border-radius:8px;display:flex;align-items:center;justify-content:center;border:2px dashed ${theme.colors.textMuted}44;"><p style="color:${theme.colors.textMuted};font-size:${placeholderFontPx}px;text-align:center;font-family:${theme.typography.body.fontFamily};margin:0;padding:24px;">${content.imagePrompt ? 'Image will be generated...' : 'Add an image'}</p></div>`;
    const placeholderPad =
      layout === 'flush'
        ? `${padTopBase}px 0px`
        : layout === 'band'
          ? `${padTopBase}px ${g}px`
          : `${padTopBase}px ${g}px`;
    const flushCls =
      layout === 'flush'
        ? 'image-block-row image-block-flush'
        : layout === 'band'
          ? 'image-block-row image-block-band'
          : 'image-block-row image-block-placeholder-card';
    return [
      createSingleColumnRow(
        [{
          id: generateId('content'),
          type: 'html',
          values: {
            html: placeholderHtml,
            containerPadding: `${spacing.sm}px ${g}px`,
            anchor: '',
            hideDesktop: false,
            hideMobile: false,
            _meta: { htmlID: '', htmlClassNames: 'image-placeholder' },
          },
        }],
        theme,
        {
          backgroundColor: rowBg,
          padding: placeholderPad,
          className: flushCls,
        },
      ),
    ];
  }

  const widthMap = { full: '600', medium: '400', small: '200' } as const;
  const imgWidth = widthMap[content.width || 'full'];
  const align = 'center';

  const contents: Va2UnlayerContent[] = [];

  const imgTopPad = Math.max(spacing.sm, spacing.md + Math.min(4, extraTop));
  const imageValues: Record<string, unknown> = {
    src: { url: content.imageUrl, width: parseInt(imgWidth, 10), height: 'auto' },
    alt: content.altText || 'Image',
    textAlign: align,
    containerPadding: `${imgTopPad}px ${g}px ${content.caption ? spacing.xs : spacing.md}px`,
    anchor: '',
    hideDesktop: false,
    hideMobile: false,
    _meta: { htmlID: '', htmlClassNames: 'image-block' },
  };

  if (content.linkUrl) {
    imageValues.action = {
      name: 'web',
      values: { href: content.linkUrl, target: '_blank' },
    };
  }

  contents.push({
    id: generateId('content'),
    type: 'image',
    values: imageValues,
  });

  if (content.caption) {
    contents.push({
      id: generateId('content'),
      type: 'text',
      values: {
        text: `<p style="color:${theme.colors.textMuted};font-size:${captionPx}px;text-align:center;line-height:${Math.round(typo.caption.lineHeight * 100)}%;font-style:italic;font-family:${typo.caption.fontFamily}">${content.caption}</p>`,
        containerPadding: `${spacing.xs}px ${spacing.md}px ${spacing.md}px`,
        anchor: '',
        hideDesktop: false,
        hideMobile: false,
        _meta: { htmlID: '', htmlClassNames: 'image-caption' },
      },
    });
  }

  const rowPadFlush = `${spacing.xl + extraTop}px 0px`;
  const rowPadBand = `${spacing.md + extraTop}px ${g}px`;
  const rowPadCard = `${spacing.md + extraTop}px ${g}px`;

  if (layout === 'flush') {
    return [
      createSingleColumnRow(contents, theme, {
        backgroundColor: theme.colors.background,
        padding: rowPadFlush,
        className: 'image-block-row image-block-flush',
      }),
    ];
  }

  if (layout === 'band') {
    return [
      createSingleColumnRow(contents, theme, {
        backgroundColor: theme.colors.surface,
        padding: rowPadBand,
        className: 'image-block-row image-block-band',
      }),
    ];
  }

  return [
    createSingleColumnRow(contents, theme, {
      backgroundColor: theme.colors.background,
      padding: rowPadCard,
      className: 'image-block-row image-block-framed',
      columnBgColor: theme.colors.surface,
      columnPadding: `${spacing.sm}px`,
      columnBorderRadius: `${theme.borderRadius}px`,
      columnBorder: buildSubtleCardBorder(theme),
    }),
  ];
}

/**
 * Build a value proposition grid — 2 or 3 column layout with icon + heading + description.
 *
 * Edge cases:
 * - 2 items for 3-column grid: render 2 columns only
 * - 4+ items: split into multiple rows
 * - 0 items: return empty array
 * - Item description >150 chars: truncate with "..."
 */
export function buildValuePropGrid(
  content: ValuePropContent,
  theme: DesignTheme,
  options?: BlockBuilderOptions,
): Va2UnlayerRow[] {
  if (!content.items || content.items.length === 0) return [];

  const spacing = theme.spacing;
  const typo = theme.typography;
  const density = getEffectiveLayoutDensity(options?.layoutDensity);
  const densityExtra = getDensityTypeScale(density).sectionPaddingTopExtraPx;
  const lv = options?.layoutVariant;
  const rowBg = lv === 'band' ? theme.colors.surface : theme.colors.background;
  const titlePx = scaledSectionHeadingFromTheme(theme, density);
  const itemHeadingPx = scaledSubheadingFontSize(theme, density);
  const itemBodyPx = scaledBodyFontSize(theme, density);
  const rows: Va2UnlayerRow[] = [];

  if (content.sectionTitle) {
    const titleContent: Va2UnlayerContent = {
      id: generateId('content'),
      type: 'heading',
      values: {
        text: content.sectionTitle,
        headingType: 'h2',
        fontFamily: {
          label: typo.heading.fontFamily.split(',')[0].trim(),
          value: typo.heading.fontFamily,
        },
        fontSize: `${titlePx}px`,
        fontWeight: typo.heading.fontWeight,
        textAlign: 'center',
        lineHeight: `${Math.round(typo.heading.lineHeight * 100)}%`,
        color: theme.colors.primary,
        containerPadding: `${spacing.lg + Math.min(6, densityExtra)}px ${spacing.md}px ${spacing.sm + Math.min(4, Math.round(densityExtra / 2))}px`,
        anchor: '',
        hideDesktop: false,
        hideMobile: false,
        _meta: { htmlID: '', htmlClassNames: 'vp-title' },
      },
    };
    rows.push(
      createSingleColumnRow([titleContent], theme, {
        backgroundColor: theme.colors.background,
        padding: '0px',
        className: 'vp-title-row',
      }),
    );
  }

  const colCount = content.columns;
  const chunks: ValuePropItem[][] = [];
  for (let i = 0; i < content.items.length; i += colCount) {
    chunks.push(content.items.slice(i, i + colCount));
  }

  const hasAnyIcon = content.items.some((item) => Boolean(item.icon));

  for (const chunk of chunks) {
    const actualCols = chunk.length;
    const cellFractions = Array<number>(actualCols).fill(1);

    const columns: Va2UnlayerColumn[] = chunk.map((item) => {
      const colContents: Va2UnlayerContent[] = [];

      if (item.icon) {
        colContents.push({
          id: generateId('content'),
          type: 'html',
          values: {
            html: `<div style="text-align:center;padding:${spacing.sm}px 0"><span style="font-size:32px;color:${theme.colors.primary}">&#x25CF;</span></div>`,
            containerPadding: '0px',
            anchor: '',
            hideDesktop: false,
            hideMobile: false,
            _meta: { htmlID: '', htmlClassNames: 'vp-icon' },
          },
        });
      }

      colContents.push({
        id: generateId('content'),
        type: 'heading',
        values: {
          text: item.heading,
          headingType: 'h3',
          fontFamily: {
            label: typo.subheading.fontFamily.split(',')[0].trim(),
            value: typo.subheading.fontFamily,
          },
          fontSize: `${itemHeadingPx}px`,
          fontWeight: typo.subheading.fontWeight,
          textAlign: 'center',
          lineHeight: `${Math.round(typo.subheading.lineHeight * 100)}%`,
          color: theme.colors.primary,
          containerPadding:
            hasAnyIcon && !item.icon
              ? `${spacing.lg}px ${spacing.sm}px ${spacing.xs}px`
              : `${spacing.xs}px ${spacing.sm}px ${spacing.xs}px`,
          anchor: '',
          hideDesktop: false,
          hideMobile: false,
          _meta: { htmlID: '', htmlClassNames: 'vp-heading' },
        },
      });

      let desc = item.description;
      if (desc.length > 150) {
        desc = `${desc.slice(0, 147)}...`;
      }
      colContents.push({
        id: generateId('content'),
        type: 'text',
        values: {
          text: `<p style="color:${theme.colors.textMuted};font-size:${itemBodyPx}px;text-align:center;line-height:${Math.round(typo.body.lineHeight * 100)}%;font-family:${typo.body.fontFamily}">${desc}</p>`,
          containerPadding: `0px ${spacing.sm}px ${spacing.md}px`,
          anchor: '',
          hideDesktop: false,
          hideMobile: false,
          _meta: { htmlID: '', htmlClassNames: 'vp-desc' },
        },
      });

      const colBorder = lv === 'band' || lv === 'flush' ? {} : buildSubtleCardBorder(theme);
      const colRadius = lv === 'flush' ? '0px' : `${theme.borderRadius}px`;
      const colPad =
        lv === 'flush' ? `${spacing.sm}px` : lv === 'band' ? `${spacing.md}px` : `${spacing.md}px`;

      return {
        id: generateId('col'),
        contents: colContents,
        values: {
          backgroundColor: theme.colors.surface,
          padding: colPad,
          border: colBorder,
          borderRadius: colRadius,
          _meta: { htmlID: '', htmlClassNames: 'vp-col' },
        },
      };
    });

    const gridRow: Va2UnlayerRow = {
      id: generateId('row'),
      cells: cellFractions,
      columns,
      values: {
        displayCondition: null,
        columns: true,
        backgroundColor: rowBg,
        columnsBackgroundColor: '',
        backgroundImage: {},
        padding: `${spacing.sm + Math.min(4, Math.round(densityExtra / 2))}px ${spacing.md}px`,
        anchor: '',
        hideDesktop: false,
        hideMobile: false,
        noStackMobile: false,
        _meta: { htmlID: '', htmlClassNames: 'vp-grid' },
      },
    };
    rows.push(gridRow);
  }

  return rows;
}
