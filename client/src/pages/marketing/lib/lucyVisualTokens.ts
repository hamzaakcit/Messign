/**
 * Lucy v2 visual tokens — pilot mark, purple→fuchsia energy (Dora: cyan→blue→violet).
 * Dark obsidian glass aligns with Dora; motion in lucy-tokens.css.
 */
export const lucyTokens = {
  colors: {
    primary: '#7C3AED',
    secondary: '#9333EA',
    tertiary: '#C026D3',
    glow: '#A855F7',
    bgDeep: '#020617',
    bgMid: '#0f172a',
    bgSurface: '#1e293b',
    textPrimary: '#f8fafc',
    textSecondary: '#94a3b8',
    border: 'rgba(124, 58, 237, 0.18)',
    borderHover: 'rgba(168, 85, 247, 0.45)',
  },
  gradients: {
    lucy: 'linear-gradient(135deg, #7C3AED 0%, #9333EA 55%, #C026D3 100%)',
    lucySubtle: 'linear-gradient(135deg, rgba(124,58,237,0.15) 0%, rgba(192,38,211,0.08) 100%)',
    lucyGlow: 'radial-gradient(ellipse at center, rgba(124,58,237,0.28) 0%, transparent 70%)',
    text: 'linear-gradient(135deg, #7C3AED, #9333EA, #C026D3)',
  },
  motion: {
    pulseRing: 'lucy-pulse-ring 2.8s ease-in-out infinite',
    shimmer: 'lucy-shimmer 3s ease-in-out infinite',
    entrance: 'lucy-entrance 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
  },
} as const;
