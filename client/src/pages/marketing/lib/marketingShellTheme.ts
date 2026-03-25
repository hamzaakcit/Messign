/**
 * Marketing hub shell — aligns with app `bg-app` / surfaces; use these instead of one-off hex.
 */
export const marketingShell = {
  /** Main stack (MCC + pipeline column) */
  bgStack: 'bg-app',
  /** Slightly elevated strip (pipeline header) */
  bgStrip: 'bg-app-surface-tertiary/60',
  /** SparkBar top chrome */
  bgTop: 'bg-app',
  borderSubtle: 'border-white/[0.06]',
  borderHairline: 'border-white/[0.04]',
  /** Create / overflow menus (aligned with app surfaces, not one-off hex) */
  popoverMenu: 'border border-app-border bg-app-card shadow-xl py-1',
  /** SparkChip / mini chart stroke + gradient stops (hex for Recharts) */
  sparkChart: {
    mql: '#3b82f6',
    cpl: '#10b981',
    roi: '#8b5cf6',
    openRate: '#f59e0b',
    default: '#3b82f6',
  },
} as const;
