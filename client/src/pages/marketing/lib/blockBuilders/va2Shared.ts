import type {
  UnlayerRow as Va2UnlayerRow,
  UnlayerContent as Va2UnlayerContent,
} from '../types/unlayerTypes';
import type { DesignTheme } from '../types/designTokenTypes';
import { generateId } from '../designTokens';

export interface RowOptions {
  backgroundColor?: string;
  backgroundImage?: { url: string; fullWidth: boolean; repeat?: string; size?: string; position?: string };
  padding?: string;
  className?: string;
  columnPadding?: string;
  columnBgColor?: string;
  columnBorderRadius?: string;
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
          border: {},
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
          border: {},
          borderRadius: rowOptions.columnBorderRadius ?? '0px',
          _meta: { htmlID: '', htmlClassNames: '' },
        },
      },
      {
        id: generateId('col'),
        contents: rightContents,
        values: {
          backgroundColor: rowOptions.rightColumnBgColor ?? rowOptions.columnBgColor ?? '',
          padding: rowOptions.rightColumnPadding ?? rowOptions.columnPadding ?? '0px',
          border: {},
          borderRadius: rowOptions.columnBorderRadius ?? '0px',
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
