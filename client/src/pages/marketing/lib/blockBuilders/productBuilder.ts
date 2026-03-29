import type {
  UnlayerRow as Va2UnlayerRow,
  UnlayerColumn as Va2UnlayerColumn,
  UnlayerContent as Va2UnlayerContent,
} from '../types/unlayerTypes';
import type { ProductGridContent, ProductItem } from '../types/manifestTypes';
import type { DesignTheme, SpacingKey } from '../types/designTokenTypes';
import { generateId, adjustBrightness, VA2_PRODUCT_IMAGE_DISPLAY_PX } from '../designTokens';
import { buildSubtleCardBorder, createSingleColumnRow } from './va2Shared';
import type { BlockBuilderOptions } from './types';
import { getDensityTypeScale, getEffectiveLayoutDensity, scaledSectionHeadingFromTheme } from '../emailTypography';

/**
 * Build an ecommerce product grid — 2 or 3 column rows of product cards.
 *
 * Edge cases:
 * - 0 items: return empty
 * - Remainder items (e.g. 7 items / 3 cols): last row has 1 card (wider)
 * - No imageUrl: gradient placeholder with product name
 * - No price: price row hidden
 * - Badge: colored ribbon above the product name
 */
export function buildProductGrid(
  content: ProductGridContent,
  theme: DesignTheme,
  options?: BlockBuilderOptions,
): Va2UnlayerRow[] {
  if (!content.items || content.items.length === 0) return [];

  const spacing = theme.spacing;
  const density = getEffectiveLayoutDensity(options?.layoutDensity);
  const densityExtra = getDensityTypeScale(density).sectionPaddingTopExtraPx;
  const lv = options?.layoutVariant;
  const gridRowBg = lv === 'band' ? theme.colors.surface : theme.colors.background;
  const sectionTop = options?.spacing?.paddingTop
    ? theme.spacing[options.spacing.paddingTop as SpacingKey]
    : 0;
  const typo = theme.typography;
  const sectionTitlePx = scaledSectionHeadingFromTheme(theme, density);
  const colCount = content.columns || 3;
  const rows: Va2UnlayerRow[] = [];

  if (content.sectionTitle) {
    const titlePadBottom = spacing.md + Math.min(4, Math.round(densityExtra / 2));
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
        fontSize: `${sectionTitlePx}px`,
        fontWeight: typo.heading.fontWeight,
        textAlign: 'center',
        lineHeight: `${Math.round(typo.heading.lineHeight * 100)}%`,
        color: theme.colors.primary,
        containerPadding: `${spacing.lg + Math.min(6, densityExtra)}px ${spacing.md}px ${titlePadBottom}px`,
        anchor: '',
        hideDesktop: false,
        hideMobile: false,
        _meta: { htmlID: '', htmlClassNames: 'pg-title' },
      },
    };
    rows.push(
      createSingleColumnRow([titleContent], theme, {
        backgroundColor: theme.colors.background,
        padding: sectionTop > 0 ? `${sectionTop}px 0px 0px 0px` : '0px',
        className: 'pg-title-row',
      }),
    );
  }

  const chunks: ProductItem[][] = [];
  for (let i = 0; i < content.items.length; i += colCount) {
    chunks.push(content.items.slice(i, i + colCount));
  }

  for (const chunk of chunks) {
    const actualCols = chunk.length;
    const cellFractions = Array<number>(actualCols).fill(1);

    const columns: Va2UnlayerColumn[] = chunk.map((product) => {
      const cardBorder = lv === 'band' || lv === 'flush' ? {} : buildSubtleCardBorder(theme);
      const cardRadius = lv === 'flush' ? '0px' : `${theme.borderRadius}px`;
      const cardPad =
        lv === 'flush' ? `${spacing.xs}px` : lv === 'band' ? `${spacing.sm}px` : `${spacing.sm}px`;
      const colContents: Va2UnlayerContent[] = [];

      if (product.imageUrl) {
        colContents.push({
          id: generateId('content'),
          type: 'image',
          values: {
            src: {
              url: product.imageUrl,
              width: VA2_PRODUCT_IMAGE_DISPLAY_PX,
              height: VA2_PRODUCT_IMAGE_DISPLAY_PX,
              autoWidth: false,
            },
            alt: product.name,
            textAlign: 'center',
            containerPadding: `0px 0px ${spacing.xs}px`,
            anchor: '',
            hideDesktop: false,
            hideMobile: false,
            action: product.linkUrl
              ? { name: 'web', values: { href: product.linkUrl, target: '_blank' } }
              : undefined,
            _meta: { htmlID: '', htmlClassNames: 'pg-img' },
          },
        });
      } else {
        const phBg = `linear-gradient(135deg,${theme.colors.surface},${theme.colors.primary}18)`;
        colContents.push({
          id: generateId('content'),
          type: 'html',
          values: {
            html: `<div style="width:100%;height:200px;background:${phBg};border-radius:${theme.borderRadius}px;display:flex;align-items:center;justify-content:center;"><p style="color:${theme.colors.textMuted};font-size:13px;text-align:center;margin:0;padding:16px;font-family:${typo.body.fontFamily}">${product.imagePrompt ? 'Image generating...' : product.name}</p></div>`,
            containerPadding: `0px 0px ${spacing.xs}px`,
            anchor: '',
            hideDesktop: false,
            hideMobile: false,
            _meta: { htmlID: '', htmlClassNames: 'pg-img-ph' },
          },
        });
      }

      if (product.badge) {
        colContents.push({
          id: generateId('content'),
          type: 'html',
          values: {
            html: `<div style="text-align:center;margin-bottom:4px"><span style="display:inline-block;background:${theme.colors.accent};color:#fff;font-size:${Math.max(typo.caption.fontSize - 1, 10)}px;font-weight:700;padding:2px 10px;border-radius:3px;text-transform:uppercase;letter-spacing:1px;font-family:${typo.caption.fontFamily}">${product.badge}</span></div>`,
            containerPadding: '0px',
            anchor: '',
            hideDesktop: false,
            hideMobile: false,
            _meta: { htmlID: '', htmlClassNames: 'pg-badge' },
          },
        });
      }

      colContents.push({
        id: generateId('content'),
        type: 'text',
        values: {
          text: `<p style="color:${theme.colors.text};font-size:${typo.subheading.fontSize}px;font-weight:${typo.subheading.fontWeight};text-align:center;line-height:${Math.round(typo.subheading.lineHeight * 100)}%;font-family:${typo.subheading.fontFamily};margin:0">${product.name}</p>`,
          containerPadding: `${spacing.xs}px ${spacing.xs}px 0px`,
          anchor: '',
          hideDesktop: false,
          hideMobile: false,
          _meta: { htmlID: '', htmlClassNames: 'pg-name' },
        },
      });

      if (product.description) {
        const desc = product.description.length > 80
          ? `${product.description.slice(0, 77)}...`
          : product.description;
        colContents.push({
          id: generateId('content'),
          type: 'text',
          values: {
            text: `<p style="color:${theme.colors.textMuted};font-size:${typo.caption.fontSize}px;text-align:center;line-height:${Math.round(typo.caption.lineHeight * 100)}%;font-family:${typo.caption.fontFamily};margin:0">${desc}</p>`,
            containerPadding: `2px ${spacing.xs}px ${spacing.xs}px`,
            anchor: '',
            hideDesktop: false,
            hideMobile: false,
            _meta: { htmlID: '', htmlClassNames: 'pg-desc' },
          },
        });
      }

      if (product.price) {
        const priceHtml = product.originalPrice
          ? `<span style="text-decoration:line-through;color:${theme.colors.textMuted};font-size:${typo.caption.fontSize}px;margin-right:6px">${product.originalPrice}</span><span style="color:${theme.colors.accent};font-weight:700">${product.price}</span>`
          : `<span style="color:${theme.colors.text};font-weight:700">${product.price}</span>`;

        colContents.push({
          id: generateId('content'),
          type: 'text',
          values: {
            text: `<p style="font-size:${typo.body.fontSize}px;text-align:center;line-height:1.4;font-family:${typo.body.fontFamily};margin:0">${priceHtml}</p>`,
            containerPadding: `${spacing.xs}px ${spacing.xs}px`,
            anchor: '',
            hideDesktop: false,
            hideMobile: false,
            _meta: { htmlID: '', htmlClassNames: 'pg-price' },
          },
        });
      }

      if (product.linkUrl) {
        colContents.push({
          id: generateId('content'),
          type: 'button',
          values: {
            text: 'Shop Now',
            href: {
              name: 'web',
              values: { href: product.linkUrl, target: '_blank' },
            },
            fontFamily: {
              label: typo.cta.fontFamily.split(',')[0].trim(),
              value: typo.cta.fontFamily,
            },
            fontSize: `${Math.max(typo.cta.fontSize - 2, 12)}px`,
            fontWeight: typo.cta.fontWeight,
            textAlign: 'center',
            lineHeight: `${Math.round(typo.cta.lineHeight * 100)}%`,
            textTransform: 'none',
            anchor: '',
            hideDesktop: false,
            hideMobile: false,
            calculatedWidth: null,
            calculatedHeight: null,
            _meta: { htmlID: '', htmlClassNames: 'pg-cta' },
            buttonColors: {
              color: theme.colors.ctaText,
              backgroundColor: theme.colors.ctaPrimary,
              hoverColor: theme.colors.ctaText,
              hoverBackgroundColor: adjustBrightness(theme.colors.ctaPrimary, -15),
            },
            size: { autoWidth: true, width: '100%' },
            padding: `${Math.round(spacing.xs * 0.8)}px ${spacing.md}px`,
            borderRadius: `${theme.borderRadius}px`,
            border: {},
            containerPadding: `${spacing.xs}px ${spacing.sm}px ${spacing.sm}px`,
          },
        });
      }

      return {
        id: generateId('col'),
        contents: colContents,
        values: {
          backgroundColor: theme.colors.surface,
          padding: cardPad,
          border: cardBorder,
          borderRadius: cardRadius,
          _meta: { htmlID: '', htmlClassNames: 'pg-card' },
        },
      };
    });

    const gridTop =
      (!content.sectionTitle && chunk === chunks[0] && sectionTop > 0
        ? sectionTop + spacing.xs
        : spacing.xs) + Math.min(4, Math.round(densityExtra / 2));
    const gridRow: Va2UnlayerRow = {
      id: generateId('row'),
      cells: cellFractions,
      columns,
      values: {
        displayCondition: null,
        columns: true,
        backgroundColor: gridRowBg,
        columnsBackgroundColor: '',
        backgroundImage: {},
        padding: `${gridTop}px ${spacing.sm}px`,
        anchor: '',
        hideDesktop: false,
        hideMobile: false,
        noStackMobile: false,
        _meta: { htmlID: '', htmlClassNames: 'pg-grid' },
      },
    };
    rows.push(gridRow);
  }

  return rows;
}
