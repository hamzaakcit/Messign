import type {
  UnlayerColumn,
  UnlayerContentBlock,
} from '../types/unlayer.types';
import type { CTAStyle, LayoutDensity } from '../types/designManifest.types';
import {
  SPACING,
  BUTTON_DEFAULTS,
  BUTTON_PILL,
  BUTTON_SHARP,
  resolveRowPadding,
} from '../designTokens';
import type { UnlayerRow } from '../types/unlayer.types';

let _blockId = 0;

export function uid(): string {
  return `va_${Date.now().toString(36)}_${(++_blockId).toString(36)}`;
}

export function pad(top: string, right?: string, bottom?: string, left?: string): string {
  if (!right && !bottom && !left) return top;
  return `${top} ${right ?? top} ${bottom ?? top} ${left ?? right ?? top}`;
}

export function wrapHtml(tag: string, text: string, styles: Record<string, string> = {}): string {
  const styleStr = Object.entries(styles)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
  return `<${tag}${styleStr ? ` style="${styleStr}"` : ''}>${text}</${tag}>`;
}

export function makeRow(
  cells: number[],
  columns: UnlayerColumn[],
  rowValues: Partial<UnlayerRow['values']> = {},
  density?: LayoutDensity,
): UnlayerRow {
  return {
    id: uid(),
    cells,
    columns,
    values: {
      containerPadding: pad(resolveRowPadding(density), '0px'),
      backgroundColor: '',
      ...rowValues,
    },
  };
}

export function makeColumn(
  contents: UnlayerContentBlock[],
  values: Partial<UnlayerColumn['values']> = {},
): UnlayerColumn {
  return {
    id: uid(),
    contents,
    values: {
      padding: '0px',
      containerPadding: pad(SPACING.md),
      ...values,
    },
  };
}

export function resolveButtonStyle(style: CTAStyle) {
  switch (style) {
    case 'pill': return BUTTON_PILL;
    case 'sharp': return BUTTON_SHARP;
    default: return BUTTON_DEFAULTS;
  }
}
