// ─────────────────────────────────────────────────────────────────────────────
// Unlayer JSON Schema — Strict TypeScript Definitions
// Messign Visual Architect · v1.0
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Top-level Unlayer design object passed to `unlayer.loadDesign()`
 *
 * @deprecated Use types from `./unlayerTypes` (Visual Architect v2) instead.
 */
export interface UnlayerDesign {
  body: UnlayerBody;
}

export interface UnlayerBody {
  id?: string;
  rows: UnlayerRow[];
  headers?: unknown[];
  footers?: unknown[];
  values?: UnlayerBodyValues;
}

export interface UnlayerBodyValues {
  backgroundColor?: string;
  backgroundImage?: UnlayerBackgroundImage;
  contentWidth?: string;
  contentAlign?: 'center' | 'left';
  fontFamily?: UnlayerFontFamily;
  textColor?: string;
  linkColor?: string;
  linkStyle?: UnlayerLinkStyle;
  popupWidth?: string;
  popupHeight?: string;
  popupBackgroundColor?: string;
  popupCloseButtonColor?: string;
  popupOverlayBackgroundColor?: string;
  preheaderText?: string;
  popupPosition?: string;
  popupDisplay?: string;
  popupCloseButton?: { backgroundColor?: string; icon?: string };
  _meta?: Record<string, unknown>;
}

export interface UnlayerBackgroundImage {
  url: string;
  fullWidth: boolean;
  repeat: 'no-repeat' | 'repeat' | 'repeat-x' | 'repeat-y';
  size: 'cover' | 'contain' | 'auto' | 'custom';
  /** Unlayer accepts center/top/bottom or compound e.g. center center */
  position: 'center' | 'top' | 'bottom' | string;
}

export interface UnlayerFontFamily {
  label: string;
  value: string;
  url?: string;
  weights?: number[];
}

export interface UnlayerLinkStyle {
  body: boolean;
  linkColor: string;
  linkHoverColor: string;
  linkUnderline: boolean;
  linkHoverUnderline: boolean;
}

// ── Row ──────────────────────────────────────────────────────────────────────

/**
 * @deprecated Use types from `./unlayerTypes` (Visual Architect v2) instead.
 */
export interface UnlayerRow {
  id?: string;
  cells: number[];
  columns: UnlayerColumn[];
  values: UnlayerRowValues;
}

export interface UnlayerRowValues {
  displayCondition?: unknown;
  columns?: boolean;
  backgroundColor?: string;
  backgroundImage?: Partial<UnlayerBackgroundImage>;
  columnsBackgroundColor?: string;
  padding?: string;
  containerPadding?: string;
  anchor?: string;
  hideDesktop?: boolean;
  hideMobile?: boolean;
  noStackMobile?: boolean;
  _meta?: Record<string, unknown>;
}

// ── Column ───────────────────────────────────────────────────────────────────

/**
 * @deprecated Use types from `./unlayerTypes` (Visual Architect v2) instead.
 */
export interface UnlayerColumn {
  id?: string;
  contents: UnlayerContentBlock[];
  values?: UnlayerColumnValues;
}

export interface UnlayerColumnValues {
  backgroundColor?: string;
  padding?: string;
  containerPadding?: string;
  border?: UnlayerBorder;
  borderRadius?: string;
  _meta?: Record<string, unknown>;
}

export interface UnlayerBorder {
  borderTopWidth?: string;
  borderTopStyle?: string;
  borderTopColor?: string;
  borderLeftWidth?: string;
  borderLeftStyle?: string;
  borderLeftColor?: string;
  borderRightWidth?: string;
  borderRightStyle?: string;
  borderRightColor?: string;
  borderBottomWidth?: string;
  borderBottomStyle?: string;
  borderBottomColor?: string;
}

// ── Content Blocks ───────────────────────────────────────────────────────────

export type UnlayerContentBlock =
  | UnlayerTextBlock
  | UnlayerImageBlock
  | UnlayerButtonBlock
  | UnlayerDividerBlock
  | UnlayerSocialBlock
  | UnlayerHtmlBlock;

export interface UnlayerTextBlock {
  id?: string;
  type: 'text';
  values: UnlayerTextValues;
}

export interface UnlayerTextValues {
  text: string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  fontSize?: string;
  fontFamily?: string;
  fontWeight?: string;
  lineHeight?: string;
  letterSpacing?: string;
  color?: string;
  containerPadding?: string;
  anchor?: string;
  hideDesktop?: boolean;
  hideMobile?: boolean;
  _meta?: Record<string, unknown>;
}

export interface UnlayerImageBlock {
  id?: string;
  type: 'image';
  values: UnlayerImageValues;
}

export interface UnlayerImageValues {
  src: {
    url: string;
    width?: number;
    height?: number;
    autoWidth?: boolean;
    maxWidth?: string;
  };
  textAlign?: 'left' | 'center' | 'right';
  altText?: string;
  action?: { name: string; values: Record<string, string> };
  containerPadding?: string;
  anchor?: string;
  borderRadius?: string;
  hideDesktop?: boolean;
  hideMobile?: boolean;
  fullWidthOnMobile?: boolean;
  _meta?: Record<string, unknown>;
}

export interface UnlayerButtonBlock {
  id?: string;
  type: 'button';
  values: UnlayerButtonValues;
}

export interface UnlayerButtonValues {
  text: string;
  href?: {
    name: string;
    values: {
      href: string;
      target: '_blank' | '_self';
    };
  };
  url?: string;
  size?: { autoWidth: boolean; width?: string };
  textAlign?: 'left' | 'center' | 'right';
  lineHeight?: string;
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  color?: string;
  backgroundColor?: string;
  borderRadius?: string;
  padding?: string;
  containerPadding?: string;
  anchor?: string;
  hideDesktop?: boolean;
  hideMobile?: boolean;
  fullWidthOnMobile?: boolean;
  calculatedWidth?: number;
  calculatedHeight?: number;
  _meta?: Record<string, unknown>;
}

export interface UnlayerDividerBlock {
  id?: string;
  type: 'divider';
  values: UnlayerDividerValues;
}

export interface UnlayerDividerValues {
  width?: string;
  border?: {
    borderTopWidth: string;
    borderTopStyle: string;
    borderTopColor: string;
  };
  textAlign?: 'center' | 'left' | 'right';
  containerPadding?: string;
  anchor?: string;
  hideDesktop?: boolean;
  hideMobile?: boolean;
  _meta?: Record<string, unknown>;
}

export interface UnlayerSocialBlock {
  id?: string;
  type: 'social';
  values: {
    icons: Array<{
      name: string;
      url: string;
      icon: string;
    }>;
    iconSize?: string;
    iconSpacing?: string;
    textAlign?: 'left' | 'center' | 'right';
    containerPadding?: string;
    _meta?: Record<string, unknown>;
  };
}

export interface UnlayerHtmlBlock {
  id?: string;
  type: 'html';
  values: {
    html: string;
    containerPadding?: string;
    anchor?: string;
    hideDesktop?: boolean;
    hideMobile?: boolean;
    _meta?: Record<string, unknown>;
  };
}
