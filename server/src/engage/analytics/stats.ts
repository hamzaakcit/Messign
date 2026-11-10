/**
 * Treatment versus holdout (WP-21): the difference between two conversion rates with a 95% confidence interval
 * (normal approximation for a difference of two proportions). Pure. Holdout is the reference group: the uplift is
 * treatment minus holdout, so a positive number means the journey helped.
 */

export const Z_95 = 1.96;

export interface Arm { n: number; converted: number }
export interface Uplift {
  treatmentRate: number | null;
  holdoutRate: number | null;
  /** Percentage points, treatment minus holdout. Null when either group is empty. */
  difference: number | null;
  low: number | null;
  high: number | null;
  /** Relative uplift (difference over the holdout rate). Null when the holdout rate is zero or unknown. */
  relative: number | null;
  /** True when the interval excludes zero. */
  significant: boolean;
}

export function rate(a: Arm): number | null {
  return a.n > 0 ? a.converted / a.n : null;
}

export function uplift(treatment: Arm, holdout: Arm): Uplift {
  const pt = rate(treatment);
  const ph = rate(holdout);
  if (pt === null || ph === null) {
    return { treatmentRate: pt, holdoutRate: ph, difference: null, low: null, high: null, relative: null, significant: false };
  }
  const difference = pt - ph;
  const se = Math.sqrt((pt * (1 - pt)) / treatment.n + (ph * (1 - ph)) / holdout.n);
  const low = difference - Z_95 * se;
  const high = difference + Z_95 * se;
  return {
    treatmentRate: pt,
    holdoutRate: ph,
    difference,
    low,
    high,
    relative: ph > 0 ? difference / ph : null,
    significant: low > 0 || high < 0,
  };
}
