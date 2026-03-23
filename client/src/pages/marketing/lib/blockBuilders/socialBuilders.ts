import type {
  UnlayerRow as Va2UnlayerRow,
  UnlayerColumn as Va2UnlayerColumn,
  UnlayerContent as Va2UnlayerContent,
} from '../types/unlayerTypes';
import type {
  TestimonialContent,
  SocialProofContent,
  FooterContent,
} from '../types/manifestTypes';
import type { DesignTheme } from '../types/designTokenTypes';
import { generateId } from '../designTokens';
import { createSingleColumnRow } from './va2Shared';
import type { BlockBuilderOptions } from './types';

/**
 * Build a testimonial card — customer quote with attribution.
 *
 * Edge cases:
 * - No rating: skip stars block
 * - No authorRole and no authorCompany: skip that text block
 * - Very long quote (>250 chars): reduce font to body.fontSize * 0.9
 */
export function buildTestimonialCard(
  content: TestimonialContent,
  theme: DesignTheme,
  _options?: BlockBuilderOptions,
): Va2UnlayerRow[] {
  const spacing = theme.spacing;
  const typo = theme.typography;
  const contents: Va2UnlayerContent[] = [];

  if (content.rating && content.rating >= 1 && content.rating <= 5) {
    const stars = '★'.repeat(content.rating) + '☆'.repeat(5 - content.rating);
    contents.push({
      id: generateId('content'),
      type: 'html',
      values: {
        html: `<div style="text-align:center;font-size:20px;color:${theme.colors.accent};padding:${spacing.sm}px 0 ${spacing.xs}px;letter-spacing:4px">${stars}</div>`,
        containerPadding: '0px',
        anchor: '',
        hideDesktop: false,
        hideMobile: false,
        _meta: { htmlID: '', htmlClassNames: 'testimonial-stars' },
      },
    });
  }

  contents.push({
    id: generateId('content'),
    type: 'html',
    values: {
      html: `<div style="text-align:center;font-size:48px;line-height:1;color:${theme.colors.accent};font-family:Georgia,serif">\u201C</div>`,
      containerPadding: `${spacing.sm}px 0 0`,
      anchor: '',
      hideDesktop: false,
      hideMobile: false,
      _meta: { htmlID: '', htmlClassNames: 'testimonial-quote-mark' },
    },
  });

  const quoteFontSize =
    content.quote.length > 250 ? Math.round(typo.body.fontSize * 0.9) : typo.body.fontSize;

  contents.push({
    id: generateId('content'),
    type: 'text',
    values: {
      text: `<p style="color:${theme.colors.text};font-size:${quoteFontSize}px;text-align:center;line-height:${Math.round(typo.body.lineHeight * 100)}%;font-style:italic;font-family:${typo.body.fontFamily}">${content.quote}</p>`,
      containerPadding: `${spacing.xs}px ${spacing.lg}px ${spacing.md}px`,
      anchor: '',
      hideDesktop: false,
      hideMobile: false,
      _meta: { htmlID: '', htmlClassNames: 'testimonial-quote' },
    },
  });

  contents.push({
    id: generateId('content'),
    type: 'html',
    values: {
      html: `<div style="width:40px;height:1px;background:${theme.colors.divider};margin:0 auto"></div>`,
      containerPadding: `0px 0px ${spacing.sm}px`,
      anchor: '',
      hideDesktop: false,
      hideMobile: false,
      _meta: { htmlID: '', htmlClassNames: 'testimonial-divider' },
    },
  });

  contents.push({
    id: generateId('content'),
    type: 'text',
    values: {
      text: `<p style="color:${theme.colors.primary};font-size:${typo.subheading.fontSize}px;font-weight:${typo.subheading.fontWeight};text-align:center;line-height:${Math.round(typo.subheading.lineHeight * 100)}%;font-family:${typo.subheading.fontFamily}">${content.authorName}</p>`,
      containerPadding: `0px ${spacing.lg}px ${spacing.xs}px`,
      anchor: '',
      hideDesktop: false,
      hideMobile: false,
      _meta: { htmlID: '', htmlClassNames: 'testimonial-author' },
    },
  });

  const roleParts: string[] = [];
  if (content.authorRole) roleParts.push(content.authorRole);
  if (content.authorCompany) roleParts.push(content.authorCompany);

  if (roleParts.length > 0) {
    contents.push({
      id: generateId('content'),
      type: 'text',
      values: {
        text: `<p style="color:${theme.colors.textMuted};font-size:${typo.caption.fontSize}px;text-align:center;line-height:${Math.round(typo.caption.lineHeight * 100)}%;font-family:${typo.caption.fontFamily}">${roleParts.join(', ')}</p>`,
        containerPadding: `0px ${spacing.lg}px ${spacing.md}px`,
        anchor: '',
        hideDesktop: false,
        hideMobile: false,
        _meta: { htmlID: '', htmlClassNames: 'testimonial-role' },
      },
    });
  }

  return [
    createSingleColumnRow(contents, theme, {
      backgroundColor: theme.colors.background,
      padding: `${spacing.lg}px ${spacing.md}px`,
      className: 'testimonial-section',
      columnBgColor: theme.colors.surface,
      columnPadding: `${spacing.lg}px`,
      columnBorderRadius: `${theme.borderRadius}px`,
    }),
  ];
}

/**
 * Build a social proof bar — metrics or logos in a horizontal strip.
 *
 * Three style variants:
 * - "metrics": equal columns, each with large value + small label
 * - "logos": equal columns, each with a logo image placeholder
 * - "mixed": metrics row on top, logos row below
 */
export function buildSocialProofBar(
  content: SocialProofContent,
  theme: DesignTheme,
  _options?: BlockBuilderOptions,
): Va2UnlayerRow[] {
  if (!content.items || content.items.length === 0) return [];

  const spacing = theme.spacing;
  const typo = theme.typography;
  const items = content.items.slice(0, 5);

  const metricItems = items.filter((i) => i.value);
  const logoItems = items.filter((i) => i.logoUrl);

  const rows: Va2UnlayerRow[] = [];

  if (content.style === 'metrics' || content.style === 'mixed') {
    const displayItems = content.style === 'mixed' ? metricItems : items;
    if (displayItems.length > 0) {
      const cellFractions = displayItems.map(() => 1);
      const columns: Va2UnlayerColumn[] = displayItems.map((item) => ({
        id: generateId('col'),
        contents: [
          {
            id: generateId('content'),
            type: 'text' as const,
            values: {
              text: `<p style="color:${theme.colors.primary};font-size:${typo.heading.fontSize}px;font-weight:${typo.heading.fontWeight};text-align:center;line-height:1.2;font-family:${typo.heading.fontFamily}">${item.value || item.label}</p>`,
              containerPadding: `${spacing.sm}px ${spacing.xs}px ${spacing.xs}px`,
              anchor: '',
              hideDesktop: false,
              hideMobile: false,
              _meta: { htmlID: '', htmlClassNames: 'sp-value' },
            },
          },
          {
            id: generateId('content'),
            type: 'text' as const,
            values: {
              text: `<p style="color:${theme.colors.textMuted};font-size:${typo.caption.fontSize}px;text-align:center;line-height:${Math.round(typo.caption.lineHeight * 100)}%;font-family:${typo.caption.fontFamily}">${item.label}</p>`,
              containerPadding: `0px ${spacing.xs}px ${spacing.sm}px`,
              anchor: '',
              hideDesktop: false,
              hideMobile: false,
              _meta: { htmlID: '', htmlClassNames: 'sp-label' },
            },
          },
        ],
        values: {
          backgroundColor: '',
          padding: `${spacing.sm}px`,
          border: {},
          borderRadius: '0px',
          _meta: { htmlID: '', htmlClassNames: 'sp-metric-col' },
        },
      }));

      rows.push({
        id: generateId('row'),
        cells: cellFractions,
        columns,
        values: {
          displayCondition: null,
          columns: true,
          backgroundColor: theme.colors.surface,
          columnsBackgroundColor: '',
          backgroundImage: {},
          padding: `${spacing.sm}px ${spacing.md}px`,
          anchor: '',
          hideDesktop: false,
          hideMobile: false,
          noStackMobile: false,
          _meta: { htmlID: '', htmlClassNames: 'sp-metrics-row' },
        },
      });
    }
  }

  if (content.style === 'logos' || content.style === 'mixed') {
    const displayItems = content.style === 'mixed' ? logoItems : items;
    if (displayItems.length > 0) {
      const cellFractions = displayItems.map(() => 1);
      const columns: Va2UnlayerColumn[] = displayItems.map((item) => ({
        id: generateId('col'),
        contents: [
          {
            id: generateId('content'),
            type: 'html' as const,
            values: {
              html: `<div style="text-align:center;padding:${spacing.sm}px"><img src="${item.logoUrl || ''}" alt="${item.label}" style="max-height:40px;filter:grayscale(100%) opacity(0.6);-webkit-filter:grayscale(100%) opacity(0.6)" /></div>`,
              containerPadding: '0px',
              anchor: '',
              hideDesktop: false,
              hideMobile: false,
              _meta: { htmlID: '', htmlClassNames: 'sp-logo' },
            },
          },
        ],
        values: {
          backgroundColor: '',
          padding: `${spacing.sm}px`,
          border: {},
          borderRadius: '0px',
          _meta: { htmlID: '', htmlClassNames: 'sp-logo-col' },
        },
      }));

      rows.push({
        id: generateId('row'),
        cells: cellFractions,
        columns,
        values: {
          displayCondition: null,
          columns: true,
          backgroundColor: theme.colors.surface,
          columnsBackgroundColor: '',
          backgroundImage: {},
          padding: `${spacing.xs}px ${spacing.md}px`,
          anchor: '',
          hideDesktop: false,
          hideMobile: false,
          noStackMobile: false,
          _meta: { htmlID: '', htmlClassNames: 'sp-logos-row' },
        },
      });
    }
  }

  return rows;
}

/**
 * Build the email footer — company info, links, social, unsubscribe.
 * This MUST be the last row in every assembled email.
 */
export function buildFooterBlock(
  content: FooterContent,
  theme: DesignTheme,
  _options?: BlockBuilderOptions,
): Va2UnlayerRow[] {
  const spacing = theme.spacing;
  const typo = theme.typography;
  const contents: Va2UnlayerContent[] = [];

  contents.push({
    id: generateId('content'),
    type: 'text',
    values: {
      text: `<p style="color:${theme.colors.primary};font-size:${typo.caption.fontSize}px;font-weight:600;text-align:center;line-height:${Math.round(typo.caption.lineHeight * 100)}%;font-family:${typo.caption.fontFamily}">${content.companyName}</p>`,
      containerPadding: `${spacing.md}px ${spacing.md}px ${spacing.xs}px`,
      anchor: '',
      hideDesktop: false,
      hideMobile: false,
      _meta: { htmlID: '', htmlClassNames: 'footer-company' },
    },
  });

  contents.push({
    id: generateId('content'),
    type: 'text',
    values: {
      text: `<p style="color:${theme.colors.textMuted};font-size:${typo.caption.fontSize}px;text-align:center;line-height:${Math.round(typo.caption.lineHeight * 100)}%;font-family:${typo.caption.fontFamily}">${content.address}</p>`,
      containerPadding: `0px ${spacing.md}px ${spacing.sm}px`,
      anchor: '',
      hideDesktop: false,
      hideMobile: false,
      _meta: { htmlID: '', htmlClassNames: 'footer-address' },
    },
  });

  if (content.links && content.links.length > 0) {
    const linkHtml = content.links
      .map(
        (l) =>
          `<a href="${l.url}" style="color:${theme.colors.accent};text-decoration:underline">${l.text}</a>`,
      )
      .join(` <span style="color:${theme.colors.divider}">|</span> `);

    contents.push({
      id: generateId('content'),
      type: 'text',
      values: {
        text: `<p style="font-size:${typo.caption.fontSize}px;text-align:center;line-height:${Math.round(typo.caption.lineHeight * 100)}%;font-family:${typo.caption.fontFamily}">${linkHtml}</p>`,
        containerPadding: `0px ${spacing.md}px ${spacing.sm}px`,
        anchor: '',
        hideDesktop: false,
        hideMobile: false,
        _meta: { htmlID: '', htmlClassNames: 'footer-links' },
      },
    });
  }

  if (content.socialLinks && content.socialLinks.length > 0) {
    const socialHtml = content.socialLinks
      .map(
        (s) =>
          `<a href="${s.url}" style="color:${theme.colors.textMuted};text-decoration:none;margin:0 8px;font-size:${typo.caption.fontSize}px">${s.platform}</a>`,
      )
      .join('');

    contents.push({
      id: generateId('content'),
      type: 'text',
      values: {
        text: `<p style="text-align:center;line-height:2">${socialHtml}</p>`,
        containerPadding: `0px ${spacing.md}px ${spacing.sm}px`,
        anchor: '',
        hideDesktop: false,
        hideMobile: false,
        _meta: { htmlID: '', htmlClassNames: 'footer-social' },
      },
    });
  }

  const unsubText =
    content.unsubscribeText ||
    `You're receiving this because you signed up. <a href="{{unsubscribe_url}}" style="color:${theme.colors.accent};text-decoration:underline">Unsubscribe</a>`;

  contents.push({
    id: generateId('content'),
    type: 'text',
    values: {
      text: `<p style="color:${theme.colors.textMuted};font-size:${Math.max(typo.caption.fontSize - 1, 11)}px;text-align:center;line-height:${Math.round(typo.caption.lineHeight * 100)}%;font-family:${typo.caption.fontFamily}">${unsubText}</p>`,
      containerPadding: `${spacing.sm}px ${spacing.md}px ${spacing.md}px`,
      anchor: '',
      hideDesktop: false,
      hideMobile: false,
      _meta: { htmlID: '', htmlClassNames: 'footer-unsubscribe' },
    },
  });

  return [
    createSingleColumnRow(contents, theme, {
      backgroundColor: theme.colors.surface,
      padding: `${spacing.lg}px 0px`,
      className: 'footer-section',
    }),
  ];
}
