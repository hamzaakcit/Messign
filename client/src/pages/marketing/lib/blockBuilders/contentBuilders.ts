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
import { generateId, getPremiumEffects } from '../designTokens';
import { createSingleColumnRow, createNColumnRow } from './va2Shared';
import type { BlockBuilderOptions } from './types';
import type { StatsCounterContent, LogoBarContent } from '../types/manifestTypes';

/**
 * Build a simple text block — body paragraph(s).
 */
export function buildTextBlock(
  content: TextBlockContent,
  theme: DesignTheme,
  _options?: BlockBuilderOptions,
): Va2UnlayerRow[] {
  if (!content.body) return [];

  const spacing = theme.spacing;
  const typo = theme.typography;
  const align = content.alignment || 'left';

  const textContent: Va2UnlayerContent = {
    id: generateId('content'),
    type: 'text',
    values: {
      text: `<p style="color:${theme.colors.text};font-size:${typo.body.fontSize}px;text-align:${align};line-height:${Math.round(typo.body.lineHeight * 100)}%;font-family:${typo.body.fontFamily}">${content.body}</p>`,
      containerPadding: `${spacing.md}px ${spacing.md}px`,
      anchor: '',
      hideDesktop: false,
      hideMobile: false,
      _meta: { htmlID: '', htmlClassNames: 'text-block' },
    },
  };

  return [
    createSingleColumnRow([textContent], theme, {
      backgroundColor: theme.colors.background,
      padding: '0px',
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
  _options?: BlockBuilderOptions,
): Va2UnlayerRow[] {
  if (!content.imageUrl) {
    const placeholderHtml = `<div style="width:100%;min-height:180px;background:linear-gradient(135deg,${theme.colors.surface},${theme.colors.primary}22);border-radius:8px;display:flex;align-items:center;justify-content:center;border:2px dashed ${theme.colors.textMuted}44;"><p style="color:${theme.colors.textMuted};font-size:14px;text-align:center;font-family:${theme.typography.body.fontFamily};margin:0;padding:24px;">${content.imagePrompt ? 'Image will be generated...' : 'Add an image'}</p></div>`;
    return [
      createSingleColumnRow(
        [{
          id: generateId('content'),
          type: 'html',
          values: {
            html: placeholderHtml,
            containerPadding: `${theme.spacing.md}px ${theme.spacing.sm}px`,
            anchor: '',
            hideDesktop: false,
            hideMobile: false,
            _meta: { htmlID: '', htmlClassNames: 'image-placeholder' },
          },
        }],
        theme,
        {
          backgroundColor: theme.colors.background,
          padding: '0px',
          className: 'image-block-row',
        },
      ),
    ];
  }

  const spacing = theme.spacing;
  const typo = theme.typography;

  const widthMap = { full: '600', medium: '400', small: '200' } as const;
  const imgWidth = widthMap[content.width || 'full'];
  const align = 'center';

  const contents: Va2UnlayerContent[] = [];

  const imageValues: Record<string, unknown> = {
    src: { url: content.imageUrl, width: parseInt(imgWidth, 10), height: 'auto' },
    alt: content.altText || 'Image',
    textAlign: align,
    containerPadding: `${spacing.md}px ${spacing.sm}px ${content.caption ? spacing.xs : spacing.md}px`,
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
        text: `<p style="color:${theme.colors.textMuted};font-size:${typo.caption.fontSize}px;text-align:center;line-height:${Math.round(typo.caption.lineHeight * 100)}%;font-style:italic;font-family:${typo.caption.fontFamily}">${content.caption}</p>`,
        containerPadding: `${spacing.xs}px ${spacing.md}px ${spacing.md}px`,
        anchor: '',
        hideDesktop: false,
        hideMobile: false,
        _meta: { htmlID: '', htmlClassNames: 'image-caption' },
      },
    });
  }

  return [
    createSingleColumnRow(contents, theme, {
      backgroundColor: theme.colors.background,
      padding: '0px',
      className: 'image-block-row',
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
  _options?: BlockBuilderOptions,
): Va2UnlayerRow[] {
  if (!content.items || content.items.length === 0) return [];

  const spacing = theme.spacing;
  const typo = theme.typography;
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
        fontSize: `${typo.heading.fontSize}px`,
        fontWeight: typo.heading.fontWeight,
        textAlign: 'center',
        lineHeight: `${Math.round(typo.heading.lineHeight * 100)}%`,
        color: theme.colors.primary,
        containerPadding: `${spacing.lg}px ${spacing.md}px ${spacing.sm}px`,
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
        const iconHtml = buildIconHtml(item.icon, theme);
        colContents.push({
          id: generateId('content'),
          type: 'html',
          values: {
            html: `<div style="text-align:center;padding:${spacing.sm}px 0">${iconHtml}</div>`,
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
          fontSize: `${typo.subheading.fontSize}px`,
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
          text: `<p style="color:${theme.colors.textMuted};font-size:${typo.body.fontSize}px;text-align:center;line-height:${Math.round(typo.body.lineHeight * 100)}%;font-family:${typo.body.fontFamily}">${desc}</p>`,
          containerPadding: `0px ${spacing.sm}px ${spacing.md}px`,
          anchor: '',
          hideDesktop: false,
          hideMobile: false,
          _meta: { htmlID: '', htmlClassNames: 'vp-desc' },
        },
      });

      const effects = getPremiumEffects(theme);
      return {
        id: generateId('col'),
        contents: colContents,
        values: {
          backgroundColor: theme.colors.surface,
          padding: `${spacing.md + 4}px`,
          border: {
            borderTopWidth: '1px',
            borderTopStyle: 'solid',
            borderTopColor: theme.colors.divider,
            borderBottomWidth: '1px',
            borderBottomStyle: 'solid',
            borderBottomColor: theme.colors.divider,
            borderLeftWidth: '1px',
            borderLeftStyle: 'solid',
            borderLeftColor: theme.colors.divider,
            borderRightWidth: '1px',
            borderRightStyle: 'solid',
            borderRightColor: theme.colors.divider,
          },
          borderRadius: `${Math.max(theme.borderRadius, 8)}px`,
          _meta: { htmlID: '', htmlClassNames: 'vp-col vp-card', extraStyle: `box-shadow:${effects.cardShadow};` },
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
        backgroundColor: theme.colors.background,
        columnsBackgroundColor: '',
        backgroundImage: {},
        padding: `${spacing.sm}px ${spacing.md}px`,
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

// ── Icon mapping for value prop items ──

const ICON_MAP: Record<string, string> = {
  Zap: '&#x26A1;',
  Shield: '&#x1F6E1;',
  Users: '&#x1F465;',
  Clock: '&#x1F552;',
  Star: '&#x2B50;',
  Heart: '&#x2764;',
  Target: '&#x1F3AF;',
  Rocket: '&#x1F680;',
  Globe: '&#x1F310;',
  Lock: '&#x1F512;',
  Sparkles: '&#x2728;',
  TrendingUp: '&#x1F4C8;',
  Award: '&#x1F3C6;',
  CheckCircle: '&#x2705;',
};

function buildIconHtml(iconName: string, theme: DesignTheme): string {
  const emoji = ICON_MAP[iconName];
  if (emoji) {
    return `<div style="display:inline-block;width:48px;height:48px;line-height:48px;text-align:center;font-size:24px;background:${theme.colors.accent}15;border-radius:${Math.max(theme.borderRadius, 12)}px">${emoji}</div>`;
  }
  // Fallback: colored circle with first letter
  const initial = iconName.charAt(0).toUpperCase();
  return `<div style="display:inline-block;width:48px;height:48px;line-height:48px;text-align:center;font-size:18px;font-weight:700;color:${theme.colors.accent};background:${theme.colors.accent}12;border-radius:${Math.max(theme.borderRadius, 12)}px">${initial}</div>`;
}

// ════════════════════════════════════════════════════════════
// Stats Counter Section (v2 new)
// ════════════════════════════════════════════════════════════

/**
 * Build a stats counter section — large numbers with labels.
 * Creates a visual impact strip: "10K+ Users | 99.9% Uptime | 50+ Countries"
 */
export function buildStatsCounter(
  content: StatsCounterContent,
  theme: DesignTheme,
  _options?: BlockBuilderOptions,
): Va2UnlayerRow[] {
  if (!content.items || content.items.length === 0) return [];

  const spacing = theme.spacing;
  const typo = theme.typography;
  const columnContents: Va2UnlayerContent[][] = content.items.slice(0, 4).map((item) => {
    return [
      {
        id: generateId('content'),
        type: 'html',
        values: {
          html: `<div style="text-align:center;padding:${spacing.md}px ${spacing.sm}px">
            <div style="font-family:${typo.hero.fontFamily};font-size:${typo.heading.fontSize + 8}px;font-weight:${typo.hero.fontWeight};color:${theme.colors.accent};line-height:1.2;letter-spacing:-0.5px">${item.value}</div>
            <div style="font-family:${typo.caption.fontFamily};font-size:${typo.caption.fontSize}px;color:${theme.colors.textMuted};text-transform:uppercase;letter-spacing:1px;margin-top:6px">${item.label}</div>
          </div>`,
          containerPadding: '0px',
          anchor: '',
          hideDesktop: false,
          hideMobile: false,
          _meta: { htmlID: '', htmlClassNames: 'stats-item' },
        },
      },
    ];
  });

  return [
    createNColumnRow(columnContents, theme, {
      backgroundColor: theme.colors.surface,
      padding: `${spacing.lg}px ${spacing.md}px`,
      className: 'stats-counter-row',
      columnBorderRadius: `${theme.borderRadius}px`,
    }),
  ];
}

// ════════════════════════════════════════════════════════════
// Logo Bar Section (v2 new)
// ════════════════════════════════════════════════════════════

/**
 * Build a logo bar section — "Trusted by" with partner/client logos.
 * Logos displayed horizontally with grayscale treatment option.
 */
export function buildLogoBar(
  content: LogoBarContent,
  theme: DesignTheme,
  _options?: BlockBuilderOptions,
): Va2UnlayerRow[] {
  if (!content.items || content.items.length === 0) return [];

  const spacing = theme.spacing;
  const typo = theme.typography;
  const grayscale = content.grayscale !== false;

  const contents: Va2UnlayerContent[] = [];

  // Optional headline
  if (content.headline) {
    contents.push({
      id: generateId('content'),
      type: 'text',
      values: {
        text: `<p style="color:${theme.colors.textMuted};font-size:${typo.caption.fontSize}px;text-align:center;text-transform:uppercase;letter-spacing:2px;font-family:${typo.caption.fontFamily};font-weight:500">${content.headline}</p>`,
        containerPadding: `${spacing.md}px ${spacing.lg}px ${spacing.sm}px`,
        anchor: '',
        hideDesktop: false,
        hideMobile: false,
        _meta: { htmlID: '', htmlClassNames: 'logo-bar-headline' },
      },
    });
  }

  // Logo strip as HTML for grayscale filter support
  const logoItems = content.items.slice(0, 6).map((item) => {
    const filterStyle = grayscale ? 'filter:grayscale(100%);opacity:0.5;' : 'opacity:0.7;';
    if (item.logoUrl) {
      const link = item.url ? `<a href="${item.url}" target="_blank" style="text-decoration:none">` : '';
      const linkEnd = item.url ? '</a>' : '';
      return `${link}<img src="${item.logoUrl}" alt="${item.altText ?? item.name}" style="height:28px;width:auto;${filterStyle}vertical-align:middle" />${linkEnd}`;
    }
    // Fallback: text logo
    return `<span style="font-family:${typo.heading.fontFamily};font-size:14px;font-weight:600;color:${theme.colors.textMuted};${filterStyle}vertical-align:middle">${item.name}</span>`;
  });

  contents.push({
    id: generateId('content'),
    type: 'html',
    values: {
      html: `<div style="text-align:center;padding:${spacing.sm}px ${spacing.md}px ${spacing.md}px">${logoItems.join(`<span style="display:inline-block;width:${spacing.lg}px"></span>`)}</div>`,
      containerPadding: '0px',
      anchor: '',
      hideDesktop: false,
      hideMobile: false,
      _meta: { htmlID: '', htmlClassNames: 'logo-bar-strip' },
    },
  });

  return [
    createSingleColumnRow(contents, theme, {
      backgroundColor: theme.colors.background,
      padding: `${spacing.md}px 0px`,
      className: 'logo-bar-row',
    }),
  ];
}
