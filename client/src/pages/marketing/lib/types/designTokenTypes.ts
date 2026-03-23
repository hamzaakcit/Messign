// ─────────────────────────────────────────────────────────────────────────────
// Design Token Types — Visual Architect v2.0
// ─────────────────────────────────────────────────────────────────────────────

export type ThemeName =
  | 'executive'
  | 'startup'
  | 'luxury'
  | 'minimal'
  | 'bold'
  | 'nature'
  | 'tech'
  | 'warm';

export type SpacingKey = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

export interface SpacingScale {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
}

export interface ThemeTypographyEntry {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing?: number;
  textTransform?: string;
}

export interface ThemeTypography {
  hero: ThemeTypographyEntry;
  heading: ThemeTypographyEntry;
  subheading: ThemeTypographyEntry;
  body: ThemeTypographyEntry;
  caption: ThemeTypographyEntry;
  cta: ThemeTypographyEntry;
  preheader: ThemeTypographyEntry;
}

export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  ctaPrimary: string;
  ctaText: string;
  divider: string;
  heroOverlayStart: string;
  heroOverlayEnd: string;
}

export interface DesignTheme {
  name: ThemeName;
  label: string;
  description: string;
  colors: ThemeColors;
  typography: ThemeTypography;
  spacing: SpacingScale;
  borderRadius: number;
  shadowStyle: 'none' | 'soft' | 'medium' | 'sharp' | 'dramatic';
  googleFonts: string[];
}

export interface ContrastResult {
  pair: string;
  ratio: number;
  passes: boolean;
  level: 'AAA' | 'AA' | 'FAIL';
}

export interface ThemeValidation {
  theme: ThemeName;
  valid: boolean;
  results: ContrastResult[];
  failures: ContrastResult[];
}
