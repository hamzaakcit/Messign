import type {
  UnlayerRow,
  UnlayerColumn,
  UnlayerContentBlock,
  UnlayerTextBlock,
  UnlayerImageBlock,
  UnlayerButtonBlock,
  UnlayerDividerBlock,
  UnlayerBackgroundImage,
} from '../types/unlayer.types';
import type {
  Alignment,
  CTAStyle,
  LayoutDensity,
  ManifestCTASection,
  ManifestFeatureGridSection,
  ManifestFooterSection,
  ManifestHeadlineSection,
  ManifestBodySection,
  ManifestImageTextSection,
  ManifestSocialSection,
  ManifestTestimonialSection,
} from '../types/designManifest.types';
import type { ColorPalette } from '../designTokens';
import {
  SPACING,
  LUXURY_SPACING,
  TYPOGRAPHY,
  DEFAULT_BORDER_RADIUS,
  IMAGE_DEFAULTS,
  RADII,
  MESSIGN_BRAND,
} from '../designTokens';
import { uid, pad, wrapHtml, makeRow, makeColumn, resolveButtonStyle } from './shared';

export function buildLogoHeaderRow(palette: ColorPalette): UnlayerRow {
  const logoBlock: UnlayerImageBlock = {
    id: uid(),
    type: 'image',
    values: {
      src: {
        url: MESSIGN_BRAND.logoUrl,
        width: MESSIGN_BRAND.logoWidth,
        height: MESSIGN_BRAND.logoHeight,
        autoWidth: false,
      },
      textAlign: 'center',
      altText: MESSIGN_BRAND.logoAlt,
      containerPadding: pad(SPACING.lg, SPACING.lg, SPACING.md, SPACING.lg),
      borderRadius: RADII.none,
    },
  };

  return {
    id: uid(),
    cells: [12],
    columns: [makeColumn([logoBlock], { containerPadding: '0px' })],
    values: {
      containerPadding: pad(SPACING.lg, '0px', '0px', '0px'),
      backgroundColor: palette.surface,
    },
  };
}

export interface HeroConfig {
  imageUrl: string;
  alignment: Alignment;
  altText?: string;
  /** Primary headline displayed over the hero background */
  headline?: string;
  /** Secondary text under the headline */
  subheadline?: string;
  /** CTA button on the hero */
  cta?: {
    text: string;
    url: string;
    style?: CTAStyle;
  };
  /** @deprecated — use headline. Kept for v1 compat. */
  overlayText?: string;
}

export function buildHeroRow(
  config: HeroConfig,
  palette: ColorPalette,
  density?: LayoutDensity,
): UnlayerRow {
  const contents: UnlayerContentBlock[] = [];
  const align = config.alignment ?? 'center';

  const displayHeadline = config.headline ?? config.overlayText;

  if (displayHeadline) {
    const headlineBlock: UnlayerTextBlock = {
      id: uid(),
      type: 'text',
      values: {
        text: wrapHtml('h1', displayHeadline, {
          margin: '0',
          padding: '0',
          'font-size': TYPOGRAPHY.fontSize.display,
          'font-weight': TYPOGRAPHY.fontWeight.black,
          color: palette.heroOverlayText,
          'letter-spacing': TYPOGRAPHY.letterSpacing.display,
          'line-height': TYPOGRAPHY.lineHeight.tight,
          'text-shadow': '0 2px 8px rgba(0,0,0,0.3)',
        }),
        textAlign: align,
        containerPadding: pad(SPACING.md, SPACING.xl),
        fontFamily: TYPOGRAPHY.fontFamily.heading,
      },
    };
    contents.push(headlineBlock);
  }

  if (config.subheadline) {
    const subBlock: UnlayerTextBlock = {
      id: uid(),
      type: 'text',
      values: {
        text: wrapHtml('p', config.subheadline, {
          margin: '0',
          'font-size': TYPOGRAPHY.fontSize.md,
          color: palette.heroOverlayText,
          'line-height': TYPOGRAPHY.lineHeight.normal,
          opacity: '0.9',
          'text-shadow': '0 1px 4px rgba(0,0,0,0.2)',
        }),
        textAlign: align,
        containerPadding: pad(SPACING.xs, SPACING.xl, SPACING.md, SPACING.xl),
        fontFamily: TYPOGRAPHY.fontFamily.primary,
      },
    };
    contents.push(subBlock);
  }

  if (config.cta) {
    const btnStyle = resolveButtonStyle(config.cta.style ?? 'pill');
    const ctaBlock: UnlayerButtonBlock = {
      id: uid(),
      type: 'button',
      values: {
        text: config.cta.text,
        href: {
          name: 'web',
          values: { href: config.cta.url, target: '_blank' },
        },
        color: palette.heroCtaText,
        backgroundColor: palette.heroCtaBg,
        borderRadius: btnStyle.borderRadius,
        padding: btnStyle.padding,
        fontSize: btnStyle.fontSize,
        fontWeight: btnStyle.fontWeight,
        fontFamily: TYPOGRAPHY.fontFamily.primary,
        lineHeight: btnStyle.lineHeight,
        textAlign: align,
        containerPadding: pad(SPACING.md, SPACING.xl),
        fullWidthOnMobile: true,
        size: { autoWidth: true },
      },
    };
    contents.push(ctaBlock);
  }

  const heroTopPad = density === 'compact' ? SPACING.xl : LUXURY_SPACING.heroTop;
  const heroBottomPad = density === 'compact' ? SPACING.xxl : LUXURY_SPACING.heroBottom;

  if (contents.length === 0) {
    contents.push({
      id: uid(),
      type: 'text',
      values: {
        text: '&nbsp;',
        containerPadding: pad(heroTopPad, '0px', heroBottomPad, '0px'),
      },
    } satisfies UnlayerTextBlock);
  }

  const bgImage: UnlayerBackgroundImage = {
    url: config.imageUrl,
    fullWidth: true,
    repeat: 'no-repeat',
    size: 'cover',
    position: 'center',
  };

  return {
    id: uid(),
    cells: [12],
    columns: [
      makeColumn(contents, {
        containerPadding: '0px',
        backgroundColor: palette.heroOverlayScrim,
      }),
    ],
    values: {
      backgroundImage: bgImage,
      containerPadding: pad(heroTopPad, '0px', heroBottomPad, '0px'),
      backgroundColor: palette.surface,
      noStackMobile: true,
    },
  };
}

export function buildHeadlineRow(
  config: ManifestHeadlineSection,
  palette: ColorPalette,
  density?: LayoutDensity,
): UnlayerRow {
  const sizeMap = {
    h1: TYPOGRAPHY.fontSize.xxl,
    h2: TYPOGRAPHY.fontSize.xl,
    h3: TYPOGRAPHY.fontSize.lg,
  };
  const weightMap = {
    h1: TYPOGRAPHY.fontWeight.extrabold,
    h2: TYPOGRAPHY.fontWeight.bold,
    h3: TYPOGRAPHY.fontWeight.semibold,
  };

  const level = config.level ?? 'h2';
  const headingBlock: UnlayerTextBlock = {
    id: uid(),
    type: 'text',
    values: {
      text: wrapHtml(level, config.text, {
        margin: '0',
        padding: '0',
        'font-size': sizeMap[level],
        'font-weight': weightMap[level],
        color: palette.text,
        'letter-spacing': TYPOGRAPHY.letterSpacing.tight,
        'line-height': TYPOGRAPHY.lineHeight.tight,
      }),
      textAlign: config.alignment,
      containerPadding: pad(SPACING.sm, SPACING.lg),
      fontFamily: TYPOGRAPHY.fontFamily.heading,
    },
  };

  return makeRow(
    [12],
    [makeColumn([headingBlock])],
    {
      containerPadding: pad(SPACING.lg, '0px', SPACING.xs, '0px'),
      backgroundColor: palette.surface,
    },
    density,
  );
}

export function buildBodyRow(
  config: ManifestBodySection,
  palette: ColorPalette,
  density?: LayoutDensity,
): UnlayerRow {
  const bodyBlock: UnlayerTextBlock = {
    id: uid(),
    type: 'text',
    values: {
      text: wrapHtml('p', config.text, {
        margin: '0',
        'font-size': TYPOGRAPHY.fontSize.base,
        color: palette.text,
        'line-height': TYPOGRAPHY.lineHeight.relaxed,
      }),
      textAlign: config.alignment,
      containerPadding: pad(SPACING.xs, SPACING.lg),
      fontFamily: TYPOGRAPHY.fontFamily.primary,
      lineHeight: TYPOGRAPHY.lineHeight.relaxed,
    },
  };

  return makeRow(
    [12],
    [makeColumn([bodyBlock])],
    {
      containerPadding: pad(SPACING.xs, '0px'),
      backgroundColor: palette.surface,
    },
    density,
  );
}

export interface FeatureGridConfig extends ManifestFeatureGridSection {
  imageUrls?: string[];
}

export function buildFeatureGridRow(
  config: FeatureGridConfig,
  palette: ColorPalette,
  density?: LayoutDensity,
): UnlayerRow {
  const colCount = config.columns;
  const cellWidth = Math.floor(12 / colCount);
  const cells = Array(colCount).fill(cellWidth) as number[];
  const remainder = 12 - cellWidth * colCount;
  if (remainder > 0 && cells.length > 0) {
    cells[cells.length - 1] += remainder;
  }

  const isGlass = !!palette.glassCardBg;
  const cardBg = isGlass ? palette.glassCardBg! : palette.surface;
  const cardBorderProps: Partial<UnlayerColumn['values']> = isGlass
    ? {
        border: {
          borderTopWidth: '1px',
          borderTopStyle: 'solid',
          borderTopColor: palette.glassCardBorder ?? 'transparent',
          borderLeftWidth: '1px',
          borderLeftStyle: 'solid',
          borderLeftColor: palette.glassCardBorder ?? 'transparent',
          borderRightWidth: '1px',
          borderRightStyle: 'solid',
          borderRightColor: palette.glassCardBorder ?? 'transparent',
          borderBottomWidth: '1px',
          borderBottomStyle: 'solid',
          borderBottomColor: palette.glassCardBorder ?? 'transparent',
        },
      }
    : {};

  const columns: UnlayerColumn[] = config.items.slice(0, colCount).map((feature, i) => {
    const contents: UnlayerContentBlock[] = [];

    const imageUrl = config.imageUrls?.[i];
    if (imageUrl) {
      contents.push({
        id: uid(),
        type: 'image',
        values: {
          src: {
            url: imageUrl,
            width: IMAGE_DEFAULTS.featureIconWidth,
            height: IMAGE_DEFAULTS.featureIconHeight,
            autoWidth: false,
          },
          textAlign: 'center',
          altText: feature.title,
          containerPadding: pad(SPACING.sm),
          borderRadius: RADII.md,
        },
      } satisfies UnlayerImageBlock);
    } else if ((feature as { iconEmoji?: string }).iconEmoji) {
      contents.push({
        id: uid(),
        type: 'text',
        values: {
          text: wrapHtml('p', (feature as { iconEmoji?: string }).iconEmoji!, {
            'font-size': '40px',
            'text-align': 'center',
            margin: '0',
            'line-height': '1.2',
          }),
          textAlign: 'center',
          containerPadding: pad(SPACING.sm),
        },
      } satisfies UnlayerTextBlock);
    }

    contents.push({
      id: uid(),
      type: 'text',
      values: {
        text: wrapHtml('p', feature.title, {
          margin: '0',
          'font-size': TYPOGRAPHY.fontSize.md,
          'font-weight': TYPOGRAPHY.fontWeight.semibold,
          color: palette.text,
          'text-align': 'center',
        }),
        textAlign: 'center',
        containerPadding: pad(SPACING.xs, SPACING.sm),
        fontFamily: TYPOGRAPHY.fontFamily.heading,
      },
    } satisfies UnlayerTextBlock);

    contents.push({
      id: uid(),
      type: 'text',
      values: {
        text: wrapHtml('p', feature.description, {
          margin: '0',
          'font-size': TYPOGRAPHY.fontSize.sm,
          color: palette.textMuted,
          'text-align': 'center',
          'line-height': TYPOGRAPHY.lineHeight.normal,
        }),
        textAlign: 'center',
        containerPadding: pad('0px', SPACING.sm, SPACING.md, SPACING.sm),
        fontFamily: TYPOGRAPHY.fontFamily.primary,
      },
    } satisfies UnlayerTextBlock);

    return makeColumn(contents, {
      containerPadding: isGlass ? LUXURY_SPACING.cardInner : pad(SPACING.md),
      backgroundColor: cardBg,
      borderRadius: isGlass ? RADII.xl : DEFAULT_BORDER_RADIUS,
      ...cardBorderProps,
    });
  });

  return makeRow(
    cells,
    columns,
    {
      containerPadding: pad(SPACING.lg, SPACING.md),
      backgroundColor: palette.background,
    },
    density,
  );
}

export function buildCTARow(
  config: ManifestCTASection,
  palette: ColorPalette,
  density?: LayoutDensity,
): UnlayerRow {
  const btnStyle = resolveButtonStyle(config.style ?? 'rounded');
  const contents: UnlayerContentBlock[] = [];

  const primaryBtn: UnlayerButtonBlock = {
    id: uid(),
    type: 'button',
    values: {
      text: config.text,
      href: {
        name: 'web',
        values: { href: config.url, target: '_blank' },
      },
      color: palette.textOnPrimary,
      backgroundColor: palette.primary,
      borderRadius: btnStyle.borderRadius,
      padding: btnStyle.padding,
      fontSize: btnStyle.fontSize,
      fontWeight: btnStyle.fontWeight,
      fontFamily: TYPOGRAPHY.fontFamily.primary,
      lineHeight: btnStyle.lineHeight,
      textAlign: config.alignment,
      containerPadding: pad(SPACING.sm, SPACING.lg),
      fullWidthOnMobile: btnStyle.fullWidthOnMobile,
      size: { autoWidth: true },
    },
  };
  contents.push(primaryBtn);

  if (config.secondary) {
    const secondaryLink: UnlayerTextBlock = {
      id: uid(),
      type: 'text',
      values: {
        text: wrapHtml(
          'a',
          config.secondary.text,
          {
            color: palette.primary,
            'font-size': TYPOGRAPHY.fontSize.sm,
            'text-decoration': 'underline',
            'font-weight': TYPOGRAPHY.fontWeight.medium,
          },
        ).replace('<a', `<a href="${config.secondary.url}"`),
        textAlign: config.alignment,
        containerPadding: pad(SPACING.sm, SPACING.lg),
      },
    };
    contents.push(secondaryLink);
  }

  return makeRow(
    [12],
    [makeColumn(contents)],
    {
      containerPadding: pad(
        density === 'airy' ? LUXURY_SPACING.ctaBlock : SPACING.xl,
        '0px',
      ),
      backgroundColor: palette.surface,
    },
    density,
  );
}

export interface ImageTextConfig extends ManifestImageTextSection {
  imageUrl?: string;
}

export function buildImageTextRow(
  config: ImageTextConfig,
  palette: ColorPalette,
  density?: LayoutDensity,
): UnlayerRow {
  const imageCol: UnlayerColumn = makeColumn(
    [
      {
        id: uid(),
        type: 'image',
        values: {
          src: {
            url: config.imageUrl ?? 'https://placehold.co/360x240/e2e8f0/94a3b8?text=Image',
            width: IMAGE_DEFAULTS.inlineWidth,
            height: IMAGE_DEFAULTS.inlineHeight,
            autoWidth: false,
          },
          textAlign: 'center',
          altText: (config.headline ?? ''),
          containerPadding: pad(SPACING.sm),
          borderRadius: DEFAULT_BORDER_RADIUS,
          fullWidthOnMobile: true,
        },
      } satisfies UnlayerImageBlock,
    ],
    { containerPadding: pad(SPACING.md) },
  );

  const textCol: UnlayerColumn = makeColumn(
    [
      {
        id: uid(),
        type: 'text',
        values: {
          text:
            wrapHtml('h3', (config.headline ?? ''), {
              margin: '0 0 12px 0',
              'font-size': TYPOGRAPHY.fontSize.lg,
              'font-weight': TYPOGRAPHY.fontWeight.bold,
              color: palette.text,
              'line-height': TYPOGRAPHY.lineHeight.tight,
            }) +
            wrapHtml('p', (config.text ?? ''), {
              margin: '0',
              'font-size': TYPOGRAPHY.fontSize.base,
              color: palette.textMuted,
              'line-height': TYPOGRAPHY.lineHeight.relaxed,
            }),
          textAlign: 'left',
          containerPadding: pad(SPACING.md),
          fontFamily: TYPOGRAPHY.fontFamily.primary,
        },
      } satisfies UnlayerTextBlock,
    ],
    { containerPadding: pad(SPACING.md) },
  );

  const isLeft = config.imagePosition === 'left';
  return makeRow(
    [6, 6],
    isLeft ? [imageCol, textCol] : [textCol, imageCol],
    {
      containerPadding: pad(SPACING.lg, '0px'),
      backgroundColor: palette.surface,
    },
    density,
  );
}

export function buildDividerRow(
  style: 'line' | 'spacer' | 'dotted',
  palette: ColorPalette,
  density?: LayoutDensity,
): UnlayerRow {
  if (style === 'spacer') {
    return makeRow(
      [12],
      [makeColumn([
        {
          id: uid(),
          type: 'text',
          values: {
            text: '&nbsp;',
            containerPadding: pad(
              density === 'airy' ? LUXURY_SPACING.sectionGap : SPACING.lg,
            ),
          },
        } satisfies UnlayerTextBlock,
      ])],
      { containerPadding: '0px' },
    );
  }

  const dividerBlock: UnlayerDividerBlock = {
    id: uid(),
    type: 'divider',
    values: {
      width: '100%',
      border: {
        borderTopWidth: '1px',
        borderTopStyle: style === 'dotted' ? 'dotted' : 'solid',
        borderTopColor: palette.border,
      },
      textAlign: 'center',
      containerPadding: pad(SPACING.xs, SPACING.xl),
    },
  };

  return makeRow(
    [12],
    [makeColumn([dividerBlock])],
    {
      containerPadding: pad(SPACING.md, '0px'),
      backgroundColor: palette.surface,
    },
    density,
  );
}

export function buildTestimonialRow(
  config: ManifestTestimonialSection,
  palette: ColorPalette,
  density?: LayoutDensity,
): UnlayerRow {
  const align = config.alignment ?? 'center';
  const body =
    wrapHtml('p', `"${config.quote}"`, {
      margin: '0',
      'font-size': TYPOGRAPHY.fontSize.lg,
      'font-style': 'italic',
      'font-weight': TYPOGRAPHY.fontWeight.medium,
      color: palette.text,
      'line-height': TYPOGRAPHY.lineHeight.relaxed,
      'text-align': align,
    }) +
    wrapHtml(
      'p',
      `— ${(config.attribution ?? config.author ?? 'Unknown')}${config.role ? `, ${config.role}` : ''}`,
      {
        margin: '16px 0 0 0',
        'font-size': TYPOGRAPHY.fontSize.sm,
        color: palette.textMuted,
        'text-align': align,
      },
    );

  const block: UnlayerTextBlock = {
    id: uid(),
    type: 'text',
    values: {
      text: body,
      textAlign: align,
      containerPadding: pad(
        density === 'airy' ? LUXURY_SPACING.cardInner : SPACING.xl,
        SPACING.xl,
      ),
      fontFamily: TYPOGRAPHY.fontFamily.display,
    },
  };

  return makeRow(
    [12],
    [
      makeColumn([block], {
        backgroundColor: palette.glassCardBg ?? palette.surface,
        borderRadius: palette.glassCardBg ? RADII.xl : RADII.lg,
        ...(palette.glassCardBorder
          ? {
              border: {
                borderTopWidth: '1px',
                borderTopStyle: 'solid',
                borderTopColor: palette.glassCardBorder,
                borderLeftWidth: '1px',
                borderLeftStyle: 'solid',
                borderLeftColor: palette.glassCardBorder,
                borderRightWidth: '1px',
                borderRightStyle: 'solid',
                borderRightColor: palette.glassCardBorder,
                borderBottomWidth: '1px',
                borderBottomStyle: 'solid',
                borderBottomColor: palette.glassCardBorder,
              },
            }
          : {}),
      }),
    ],
    {
      containerPadding: pad(SPACING.lg, '0px'),
      backgroundColor: palette.background,
    },
    density,
  );
}

export function buildSocialRow(
  config: ManifestSocialSection,
  palette: ColorPalette,
): UnlayerRow {
  const linksHtml = (config.platforms ?? [])
    .map(
      (p) =>
        `<a href="${p.url}" style="color:${palette.primary};font-size:${TYPOGRAPHY.fontSize.sm};text-decoration:none;margin:0 12px;font-weight:${TYPOGRAPHY.fontWeight.medium}">${p.name}</a>`,
    )
    .join(' &middot; ');

  const textBlock: UnlayerTextBlock = {
    id: uid(),
    type: 'text',
    values: {
      text: wrapHtml('p', linksHtml, { 'text-align': 'center', margin: '0' }),
      textAlign: 'center',
      containerPadding: pad(SPACING.md, SPACING.lg),
    },
  };

  return makeRow(
    [12],
    [makeColumn([textBlock])],
    { containerPadding: pad(SPACING.md, '0px'), backgroundColor: palette.surface },
  );
}

export function buildFooterRow(
  config: ManifestFooterSection,
  palette: ColorPalette,
): UnlayerRow {
  let footerHtml = wrapHtml('p', `© ${new Date().getFullYear()} ${config.companyName}`, {
    margin: '0',
    'font-size': TYPOGRAPHY.fontSize.xs,
    color: palette.footerText,
    'text-align': 'center',
  });

  if (config.address) {
    footerHtml += wrapHtml('p', config.address, {
      margin: `${SPACING.xs} 0 0 0`,
      'font-size': TYPOGRAPHY.fontSize.xs,
      color: palette.footerText,
      'text-align': 'center',
    });
  }

  if (config.unsubscribeUrl) {
    footerHtml += wrapHtml('p', '', {
      margin: `${SPACING.sm} 0 0 0`,
      'text-align': 'center',
    }).replace(
      '</p>',
      `<a href="${config.unsubscribeUrl}" style="color:${palette.footerText};font-size:${TYPOGRAPHY.fontSize.xs};text-decoration:underline">Unsubscribe</a></p>`,
    );
  }

  const footerBlock: UnlayerTextBlock = {
    id: uid(),
    type: 'text',
    values: {
      text: footerHtml,
      textAlign: 'center',
      containerPadding: pad(SPACING.lg),
    },
  };

  return makeRow(
    [12],
    [makeColumn([footerBlock])],
    { containerPadding: pad(SPACING.xl, '0px'), backgroundColor: palette.footerBg },
  );
}
