// ─────────────────────────────────────────────────────────────────────────────
// Unlayer JSON Types — Visual Architect v2.0
// ─────────────────────────────────────────────────────────────────────────────

import type { ThemeName } from './designTokenTypes';

export interface UnlayerContent {
  id: string;
  type: string;
  values: Record<string, unknown>;
}

export interface UnlayerColumnValues {
  backgroundColor: string;
  padding: string;
  border: Record<string, unknown>;
  borderRadius: string;
  _meta: { htmlID: string; htmlClassNames: string };
}

export interface UnlayerColumn {
  id: string;
  contents: UnlayerContent[];
  values: UnlayerColumnValues;
}

export interface UnlayerRowValues {
  displayCondition: unknown;
  columns: boolean;
  backgroundColor: string;
  columnsBackgroundColor: string;
  backgroundImage: Record<string, unknown>;
  padding: string;
  anchor: string;
  hideDesktop: boolean;
  hideMobile: boolean;
  noStackMobile: boolean;
  _meta: { htmlID: string; htmlClassNames: string };
}

export interface UnlayerRow {
  id: string;
  cells: number[];
  columns: UnlayerColumn[];
  values: UnlayerRowValues;
}

export interface UnlayerBodyValues {
  backgroundColor: string;
  backgroundImage: Record<string, unknown>;
  contentWidth: string;
  contentAlign: string;
  fontFamily: {
    label: string;
    value: string;
    url?: string;
  };
  textColor: string;
  linkStyle: {
    body: boolean;
    linkColor: string;
    linkHoverColor: string;
    linkUnderline: boolean;
    linkHoverUnderline: boolean;
  };
  preheaderText: string;
  _meta: { htmlID: string; htmlClassNames: string };
}

export interface UnlayerBody {
  id: string;
  rows: UnlayerRow[];
  headers: unknown[];
  footers: unknown[];
  values: UnlayerBodyValues;
}

export interface UnlayerDesign {
  counters: {
    u_column: number;
    u_row: number;
    u_content: number;
  };
  body: UnlayerBody;
}

export interface AssemblyResult {
  success: boolean;
  design?: UnlayerDesign;
  warnings: string[];
  skippedSections: Array<{
    order: number;
    type: string;
    reason: string;
  }>;
  metadata: {
    theme: ThemeName;
    sectionCount: number;
    assembledAt: string;
    accessibilityScore?: number;
    /** Detailed WCAG-oriented messages from `enforceAccessibility` (same strings as appended to `warnings`). */
    accessibilityWarnings?: string[];
    /** Count of image slots (prompts/URLs/items) in the manifest for layout richness hints. */
    imageSlotCount?: number;
    /** Non-blocking suggestion when slot count is below 3 or above ~12 (not shown as a toast). */
    layoutRichnessHint?: string;
  };
}
