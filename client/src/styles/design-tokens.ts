export const SPACING = {
  0: '0px',
  0.5: '4px',
  1: '8px',
  1.5: '12px',
  2: '16px',
  2.5: '20px',
  3: '24px',
  4: '32px',
  5: '40px',
  6: '48px',
  8: '64px',
} as const;

export const COLORS = {
  primary: { light: '#60A5FA', base: '#3B82F6', dark: '#1D4ED8' },
  success: { light: '#34D399', base: '#10B981', dark: '#059669' },
  warning: { light: '#FBBF24', base: '#F59E0B', dark: '#D97706' },
  danger: { light: '#F87171', base: '#EF4444', dark: '#DC2626' },
  neutral: { light: '#94A3B8', base: '#64748B', dark: '#475569' },
  bg: 'var(--app-bg)',
  card: 'var(--app-card)',
  text: 'var(--app-text)',
  muted: 'var(--app-muted)',
  border: 'var(--app-border)',
} as const;

export const TYPOGRAPHY = {
  xs: { size: '12px', lineHeight: '16px' },
  sm: { size: '14px', lineHeight: '20px' },
  base: { size: '16px', lineHeight: '24px' },
  lg: { size: '20px', lineHeight: '28px' },
  xl: { size: '28px', lineHeight: '36px' },
} as const;

export const MOTION = {
  speed: { fast: 0.12, normal: 0.22, slow: 0.38 },
  easing: {
    easeOut: [0, 0, 0.2, 1] as const,
    easeInOut: [0.4, 0, 0.2, 1] as const,
  },
  presets: {
    fast: { duration: 0.12, ease: [0, 0, 0.2, 1] as const },
    normal: { duration: 0.22, ease: [0, 0, 0.2, 1] as const },
    slow: { duration: 0.38, ease: [0.4, 0, 0.2, 1] as const },
  },
} as const;

export const RADII = {
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
} as const;

export const SHADOWS = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
  md: '0 4px 12px rgba(0, 0, 0, 0.3)',
  lg: '0 12px 40px rgba(0, 0, 0, 0.4)',
  glow: (color: string) => `0 0 20px ${color}30`,
} as const;

const designTokens = {
  SPACING,
  COLORS,
  TYPOGRAPHY,
  MOTION,
  RADII,
  SHADOWS,
} as const;

export default designTokens;
