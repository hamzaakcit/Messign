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
import { generateId, getPremiumEffects } from '../designTokens';
import { createSingleColumnRow } from './va2Shared';
import type { BlockBuilderOptions } from './types';

// ── Social platform icons (simple Unicode/HTML for email compatibility) ──

const SOCIAL_ICONS: Record<string, string> = {
  twitter: '&#x1D54F;', // 𝕏
  linkedin: 'in',
  instagram: '&#x1F4F7;',
  facebook: 'f',
  youtube: '&#x25B6;',
  github: '&#x2756;',
};

function buildSocialIconHtml(platform: string, url: string, theme: DesignTheme): string {
  const icon = SOCIAL_ICONS[platform.toLowerCase()] ?? platform.charAt(0).toUpperCase();
  return `<a href="${url}" target="_blank" style="display:inline-block;width:32px;height:32px;line-height:32px;text-align:center;border-radius:50%;background:${theme.colors.divider};color:${theme.colors.textMuted};text-decoration:none;font-family:${theme.typography.caption.fontFamily};font-size:13px;font-weight:700;margin:0 4px">${icon}</a>`;
}

/**
 * Build a testimonial card — v2 Pro.
 *
 * Upgrades:
 * - Large decorative opening quote mark in theme accent color
 * - Avatar circle with initials (or image placeholder)
 * - Card elevation with theme-specific shadow
 * - Star rating with filled/empty styling
 * - Better visual hierarchy
 */
export function buildTestimonialCard(
  content: TestimonialContent,
  theme: DesignTheme,
  _options?: BlockBuilderOptions,
): Va2UnlayerRow[] {
  const spacing = theme.spacing;
  const typo = theme.typography;
  const effects = getPremiumEffects(theme);
  const contents: Va2UnlayerContent[] = [];

  // ── Decorative quote mark ──
  contents.push({
    id: generateId('content'),
    type: 'html',
    values: {
      html: `<div style="text-align:center;font-size:72px;line-height:0.8;color:${effects.quoteMarkColor};opacity:0.2;font-family:Georgia,'Times New Roman',serif;padding:${spacing.md}px 0 0">\u201C</div>`,
      containerPadding: '0px',
      anchor: '',
      hideDesktop: false,
      hideMobile: false,
      _meta: { htmlID: '', htmlClassNames: 'testimonial-deco-quote' },
    },
  });

  // ── Star rating ──
  if (content.rating && content.rating >= 1 && content.rating <= 5) {
    const filledStar = `<span style="color:${theme.colors.accent}">&#x2605;</span>`;
    const emptyStar = `<span style="color:${theme.colors.divider}">&#x2605;</span>`;
    const stars = filledStar.repeat(content.rating) + emptyStar.repeat(5 - content.rating);
    contents.push({
      id: generateId('content'),
      type: 'html',
      values: {
        html: `<div style="text-align:center;font-size:18px;padding:${spacing.xs}px 0;letter-spacing:3px">${stars}</div>`,
        containerPadding: '0px',
        anchor: '',
        hideDesktop: false,
        hideMobile: false,
        _meta: { htmlID: '', htmlClassNames: 'testimonial-stars' },
      },
    });
  }

  // ── Quote text ──
  const quoteFontSize =
    content.quote.length > 250 ? Math.round(typo.body.fontSize * 0.9) : typo.body.fontSize;

  contents.push({
    id: generateId('content'),
    type: 'text',
    values: {
      text: `<p style="color:${theme.colors.text};font-size:${quoteFontSize}px;text-align:center;line-height:${Math.round(typo.body.lineHeight * 110)}%;font-style:italic;font-family:${typo.body.fontFamily}">\u201C${content.quote}\u201D</p>`,
      containerPadding: `${spacing.sm}px ${spacing.lg}px ${spacing.md}px`,
      anchor: '',
      hideDesktop: false,
      hideMobile: false,
      _meta: { htmlID: '', htmlClassNames: 'testimonial-quote' },
    },
  });

  // ── Avatar + Author attribution ──
  const initials = content.authorName
    .split(' ')
    .map((n) => n.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const avatarHtml = `<div style="display:inline-block;width:44px;height:44px;line-height:44px;border-radius:50%;background:${theme.colors.accent}18;border:2px solid ${theme.colors.accent}30;color:${theme.colors.accent};font-family:${typo.heading.fontFamily};font-size:16px;font-weight:700;text-align:center;vertical-align:middle">${initials}</div>`;

  const roleParts: string[] = [];
  if (content.authorRole) roleParts.push(content.authorRole);
  if (content.authorCompany) roleParts.push(content.authorCompany);
  const roleText = roleParts.length > 0
    ? `<div style="color:${theme.colors.textMuted};font-size:${typo.caption.fontSize}px;font-family:${typo.caption.fontFamily};margin-top:2px">${roleParts.join(', ')}</div>`
    : '';

  contents.push({
    id: generateId('content'),
    type: 'html',
    values: {
      html: `<div style="text-align:center;padding:0 0 ${spacing.sm}px">
        <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto"><tr>
          <td style="vertical-align:middle;padding-right:12px">${avatarHtml}</td>
          <td style="vertical-align:middle;text-align:left">
            <div style="color:${theme.colors.primary};font-size:${typo.subheading.fontSize}px;font-weight:${typo.subheading.fontWeight};font-family:${typo.subheading.fontFamily};line-height:1.3">${content.authorName}</div>
            ${roleText}
          </td>
        </tr></table>
      </div>`,
      containerPadding: '0px',
      anchor: '',
      hideDesktop: false,
      hideMobile: false,
      _meta: { htmlID: '', htmlClassNames: 'testimonial-author' },
    },
  });

  return [
    createSingleColumnRow(contents, theme, {
      backgroundColor: theme.colors.background,
      padding: `${spacing.lg}px ${spacing.md}px`,
      className: 'testimonial-section',
      columnBgColor: theme.colors.surface,
      columnPadding: `${spacing.lg}px ${spacing.md}px`,
      columnBorderRadius: `${Math.max(theme.borderRadius, 8)}px`,
    }),
  ];
}

/**
 * Build a social proof bar — metrics or logos in a horizontal strip.
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
              text: `<p style="color:${theme.colors.accent};font-size:${typo.heading.fontSize + 4}px;font-weight:${typo.heading.fontWeight};text-align:center;line-height:1.2;font-family:${typo.heading.fontFamily}">${item.value || item.label}</p>`,
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
              text: `<p style="color:${theme.colors.textMuted};font-size:${typo.caption.fontSize}px;text-align:center;line-height:${Math.round(typo.caption.lineHeight * 100)}%;font-family:${typo.caption.fontFamily};text-transform:uppercase;letter-spacing:0.5px">${item.label}</p>`,
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
              html: `<div style="text-align:center;padding:${spacing.sm}px"><img src="${item.logoUrl || ''}" alt="${item.label}" style="max-height:36px;filter:grayscale(100%);opacity:0.5;-webkit-filter:grayscale(100%)" /></div>`,
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
 * Build the email footer — v2 Pro.
 *
 * Upgrades:
 * - Social media icon circles
 * - Gradient top border accent
 * - Better typography hierarchy
 * - Cleaner visual separation
 */
export function buildFooterBlock(
  content: FooterContent,
  theme: DesignTheme,
  _options?: BlockBuilderOptions,
): Va2UnlayerRow[] {
  const spacing = theme.spacing;
  const typo = theme.typography;
  const effects = getPremiumEffects(theme);
  const contents: Va2UnlayerContent[] = [];

  // ── Top accent line ──
  if (effects.gradientDividers) {
    const gradStart = theme.colors.gradientStart ?? theme.colors.accent;
    const gradEnd = theme.colors.gradientEnd ?? theme.colors.ctaPrimary;
    contents.push({
      id: generateId('content'),
      type: 'html',
      values: {
        html: `<div style="height:3px;background:linear-gradient(90deg,${gradStart},${gradEnd});margin:0 ${spacing.lg}px ${spacing.md}px"></div>`,
        containerPadding: '0px',
        anchor: '',
        hideDesktop: false,
        hideMobile: false,
        _meta: { htmlID: '', htmlClassNames: 'footer-accent-line' },
      },
    });
  }

  // ── Company name ──
  contents.push({
    id: generateId('content'),
    type: 'text',
    values: {
      text: `<p style="color:${theme.colors.primary};font-size:${typo.subheading.fontSize - 2}px;font-weight:700;text-align:center;line-height:${Math.round(typo.subheading.lineHeight * 100)}%;font-family:${typo.heading.fontFamily};letter-spacing:0.5px">${content.companyName}</p>`,
      containerPadding: `${spacing.md}px ${spacing.md}px ${spacing.xs}px`,
      anchor: '',
      hideDesktop: false,
      hideMobile: false,
      _meta: { htmlID: '', htmlClassNames: 'footer-company' },
    },
  });

  // ── Address ──
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

  // ── Social icons ──
  if (content.socialLinks && content.socialLinks.length > 0) {
    const socialHtml = content.socialLinks
      .map((s) => buildSocialIconHtml(s.platform, s.url, theme))
      .join(' ');

    contents.push({
      id: generateId('content'),
      type: 'html',
      values: {
        html: `<div style="text-align:center;padding:${spacing.sm}px 0">${socialHtml}</div>`,
        containerPadding: '0px',
        anchor: '',
        hideDesktop: false,
        hideMobile: false,
        _meta: { htmlID: '', htmlClassNames: 'footer-social-icons' },
      },
    });
  }

  // ── Footer links ──
  if (content.links && content.links.length > 0) {
    const linkHtml = content.links
      .map(
        (l) =>
          `<a href="${l.url}" style="color:${theme.colors.textMuted};text-decoration:underline;font-size:${typo.caption.fontSize}px">${l.text}</a>`,
      )
      .join(` <span style="color:${theme.colors.divider};margin:0 6px">&#x2022;</span> `);

    contents.push({
      id: generateId('content'),
      type: 'text',
      values: {
        text: `<p style="text-align:center;line-height:${Math.round(typo.caption.lineHeight * 100)}%;font-family:${typo.caption.fontFamily}">${linkHtml}</p>`,
        containerPadding: `0px ${spacing.md}px ${spacing.sm}px`,
        anchor: '',
        hideDesktop: false,
        hideMobile: false,
        _meta: { htmlID: '', htmlClassNames: 'footer-links' },
      },
    });
  }

  // ── Unsubscribe ──
  const unsubText =
    content.unsubscribeText ||
    `You're receiving this because you signed up. <a href="{{unsubscribe_url}}" style="color:${theme.colors.accent};text-decoration:underline">Unsubscribe</a>`;

  contents.push({
    id: generateId('content'),
    type: 'text',
    values: {
      text: `<p style="color:${theme.colors.textMuted};font-size:${Math.max(typo.caption.fontSize - 1, 11)}px;text-align:center;line-height:${Math.round(typo.caption.lineHeight * 100)}%;font-family:${typo.caption.fontFamily};opacity:0.8">${unsubText}</p>`,
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
