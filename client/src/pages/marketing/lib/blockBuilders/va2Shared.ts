import type {
  UnlayerRow as Va2UnlayerRow,
  UnlayerContent as Va2UnlayerContent,
} from '../types/unlayerTypes';
import type { DesignTheme, SpacingKey } from '../types/designTokenTypes';
import { generateId, VA2_SECTION_HORIZONTAL_GUTTER_PX } from '../designTokens';
import type { BlockBuilderOptions } from './types';

/**
 * VA2 row/column JSON vs Unlayer UI: we emit `body.rows[].values` (row bg, padding, bgImage) and
 * `columns[].values` (backgroundColor, padding, border, borderRadius). Users can add Divider, Columns,
 * or HTML blocks manually in the sidebar; generated designs stay round-trip compatible with
 * `loadDesign` / `exportHtml`.
 *
 * Unlayer column border (4 sides) — use theme divider for a visible card edge on near-white canvases.
 * See Unlayer row/column JSON: borderTopWidth, borderTopStyle, borderTopColor, etc.
 */
export function buildSubtleCardBorder(theme: DesignTheme): Record<string, unknown> {
  const c = theme.colors.divider;
  return {
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: c,
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: c,
    borderLeftWidth: '1px',
    borderLeftStyle: 'solid',
    borderLeftColor: c,
    borderRightWidth: '1px',
    borderRightStyle: 'solid',
    borderRightColor: c,
  };
}

/**
 * Optional accent border (e.g. highlight strip). Prefer HTML bars for top accents in email.
 */
export function buildAccentOutlineBorder(theme: DesignTheme): Record<string, unknown> {
  const c = theme.colors.accent;
  return {
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: c,
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: c,
    borderLeftWidth: '1px',
    borderLeftStyle: 'solid',
    borderLeftColor: c,
    borderRightWidth: '1px',
    borderRightStyle: 'solid',
    borderRightColor: c,
  };
}

/**
 * Row padding from manifest section spacing (top/bottom rhythm between sections).
 */
export function resolveSectionRowPadding(
  theme: DesignTheme,
  options: BlockBuilderOptions | undefined,
): string {
  const pt = options?.spacing?.paddingTop
    ? `${theme.spacing[options.spacing.paddingTop as SpacingKey]}px`
    : '0';
  const pb = options?.spacing?.paddingBottom
    ? `${theme.spacing[options.spacing.paddingBottom as SpacingKey]}px`
    : '0';
  if (pt === '0' && pb === '0') return '0px';
  return `${pt} 0px ${pb} 0px`;
}

export interface RowOptions {
  backgroundColor?: string;
  backgroundImage?: { url: string; fullWidth: boolean; repeat?: string; size?: string; position?: string };
  padding?: string;
  className?: string;
  columnPadding?: string;
  columnBgColor?: string;
  columnBorderRadius?: string;
  /** Unlayer column border object (per-side width/style/color). */
  columnBorder?: Record<string, unknown>;
}

/**
 * Create a standard single-column Unlayer row.
 * Most sections are one column; multi-column sections (value_prop) build their own.
 */
export function createSingleColumnRow(
  contents: Va2UnlayerContent[],
  theme: DesignTheme,
  rowOptions: RowOptions = {},
): Va2UnlayerRow {
  return {
    id: generateId('row'),
    cells: [1],
    columns: [
      {
        id: generateId('col'),
        contents,
        values: {
          backgroundColor: rowOptions.columnBgColor ?? '',
          padding: rowOptions.columnPadding ?? '0px',
          border: rowOptions.columnBorder ?? {},
          borderRadius: rowOptions.columnBorderRadius ?? '0px',
          _meta: { htmlID: '', htmlClassNames: '' },
        },
      },
    ],
    values: {
      displayCondition: null,
      columns: false,
      backgroundColor: rowOptions.backgroundColor ?? theme.colors.background,
      columnsBackgroundColor: '',
      backgroundImage: rowOptions.backgroundImage ?? {},
      padding: rowOptions.padding ?? '0px',
      anchor: '',
      hideDesktop: false,
      hideMobile: false,
      noStackMobile: false,
      _meta: { htmlID: '', htmlClassNames: rowOptions.className ?? '' },
    },
  };
}

/**
 * Create a two-column Unlayer row (50/50 split).
 * Used by image_text sections for side-by-side text + image layouts.
 */
export function createTwoColumnRow(
  leftContents: Va2UnlayerContent[],
  rightContents: Va2UnlayerContent[],
  theme: DesignTheme,
  rowOptions: RowOptions & {
    leftColumnPadding?: string;
    rightColumnPadding?: string;
    leftColumnBgColor?: string;
    rightColumnBgColor?: string;
    leftColumnBorder?: Record<string, unknown>;
    rightColumnBorder?: Record<string, unknown>;
    leftColumnBorderRadius?: string;
    rightColumnBorderRadius?: string;
  } = {},
): Va2UnlayerRow {
  return {
    id: generateId('row'),
    cells: [1, 1],
    columns: [
      {
        id: generateId('col'),
        contents: leftContents,
        values: {
          backgroundColor: rowOptions.leftColumnBgColor ?? rowOptions.columnBgColor ?? '',
          padding: rowOptions.leftColumnPadding ?? rowOptions.columnPadding ?? '0px',
          border: rowOptions.leftColumnBorder ?? rowOptions.columnBorder ?? {},
          borderRadius: rowOptions.leftColumnBorderRadius ?? rowOptions.columnBorderRadius ?? '0px',
          _meta: { htmlID: '', htmlClassNames: '' },
        },
      },
      {
        id: generateId('col'),
        contents: rightContents,
        values: {
          backgroundColor: rowOptions.rightColumnBgColor ?? rowOptions.columnBgColor ?? '',
          padding: rowOptions.rightColumnPadding ?? rowOptions.columnPadding ?? '0px',
          border: rowOptions.rightColumnBorder ?? rowOptions.columnBorder ?? {},
          borderRadius: rowOptions.rightColumnBorderRadius ?? rowOptions.columnBorderRadius ?? '0px',
          _meta: { htmlID: '', htmlClassNames: '' },
        },
      },
    ],
    values: {
      displayCondition: null,
      columns: true,
      backgroundColor: rowOptions.backgroundColor ?? theme.colors.background,
      columnsBackgroundColor: '',
      backgroundImage: rowOptions.backgroundImage ?? {},
      padding: rowOptions.padding ?? '0px',
      anchor: '',
      hideDesktop: false,
      hideMobile: false,
      noStackMobile: false,
      _meta: { htmlID: '', htmlClassNames: rowOptions.className ?? '' },
    },
  };
}

/**
 * Centered brand logo row (below hidden preheader) for tenant `logoUrl` from marketing brand profile.
 */
export function buildBrandLogoHeaderRowVa2(
  theme: DesignTheme,
  logoUrl: string,
  altText: string,
): Va2UnlayerRow {
  const spacing = theme.spacing;
  const content: Va2UnlayerContent = {
    id: generateId('content'),
    type: 'image',
    values: {
      src: { url: logoUrl, width: 260, height: 'auto' },
      alt: altText,
      textAlign: 'center',
      containerPadding: `${spacing.md}px ${VA2_SECTION_HORIZONTAL_GUTTER_PX}px ${spacing.sm}px`,
      anchor: '',
      hideDesktop: false,
      hideMobile: false,
      _meta: { htmlID: '', htmlClassNames: 'brand-logo-header' },
    },
  };
  return createSingleColumnRow([content], theme, {
    backgroundColor: theme.colors.surface,
    padding: '0px',
    className: 'brand-logo-row',
  });
}
