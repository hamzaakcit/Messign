/** Rarity-based color system for badge showcase */

export type RarityKey = 'common' | 'rare' | 'epic' | 'legendary';

export interface RarityTheme {
  primary: string;
  gradient: string;
  glow: string;
  glowStrong: string;
  rgb: { r: number; g: number; b: number };
}

export const RARITY_THEMES: Record<RarityKey, RarityTheme> = {
  common: {
    primary: '#94a3b8',
    gradient: 'linear-gradient(135deg, #64748b, #475569)',
    glow: 'rgba(148, 163, 184, 0.3)',
    glowStrong: 'rgba(148, 163, 184, 0.5)',
    rgb: { r: 148, g: 163, b: 184 },
  },
  rare: {
    primary: '#3b82f6',
    gradient: 'linear-gradient(135deg, #60a5fa, #3b82f6)',
    glow: 'rgba(59, 130, 246, 0.4)',
    glowStrong: 'rgba(59, 130, 246, 0.6)',
    rgb: { r: 59, g: 130, b: 246 },
  },
  epic: {
    primary: '#a855f7',
    gradient: 'linear-gradient(135deg, #c084fc, #9333ea)',
    glow: 'rgba(168, 85, 247, 0.5)',
    glowStrong: 'rgba(168, 85, 247, 0.7)',
    rgb: { r: 168, g: 85, b: 247 },
  },
  legendary: {
    primary: '#f59e0b',
    gradient: 'linear-gradient(135deg, #fbbf24, #f59e0b, #d97706)',
    glow: 'rgba(245, 158, 11, 0.6)',
    glowStrong: 'rgba(245, 158, 11, 0.8)',
    rgb: { r: 245, g: 158, b: 11 },
  },
};

/** Default MP reward by rarity for display when badge has no xpReward */
export const RARITY_XP: Record<RarityKey, number> = {
  common: 50,
  rare: 150,
  epic: 300,
  legendary: 1000,
};

export function getRarityTheme(rarity: string): RarityTheme {
  const key = (rarity?.toLowerCase() || 'common') as RarityKey;
  return RARITY_THEMES[key] ?? RARITY_THEMES.common;
}
