import { describe, expect, it } from 'vitest';
import { rate, uplift } from '../../engage/analytics/stats.js';

describe('treatment versus holdout statistics (WP-21)', () => {
  it('computes the difference and its 95% interval from the normal approximation', () => {
    // 12.0% of 1000 against 10.0% of 1000: difference 2.0 points, se = sqrt(.12*.88/1000 + .10*.90/1000) ≈ 0.013985
    const u = uplift({ n: 1000, converted: 120 }, { n: 1000, converted: 100 });
    expect(u.treatmentRate).toBeCloseTo(0.12, 10);
    expect(u.holdoutRate).toBeCloseTo(0.10, 10);
    expect(u.difference).toBeCloseTo(0.02, 10);
    expect(u.low).toBeCloseTo(0.02 - 1.96 * Math.sqrt(0.12 * 0.88 / 1000 + 0.1 * 0.9 / 1000), 10);
    expect(u.high).toBeCloseTo(0.02 + 1.96 * Math.sqrt(0.12 * 0.88 / 1000 + 0.1 * 0.9 / 1000), 10);
    expect(u.relative).toBeCloseTo(0.2, 10);
    // The interval contains zero here: not significant, however large the point estimate looks.
    expect(u.low! < 0 && u.high! > 0).toBe(true);
    expect(u.significant).toBe(false);
  });

  it('is significant when the whole interval is on one side of zero', () => {
    const up = uplift({ n: 10_000, converted: 1_200 }, { n: 10_000, converted: 1_000 });
    expect(up.significant).toBe(true);
    expect(up.low!).toBeGreaterThan(0);
    const down = uplift({ n: 10_000, converted: 1_000 }, { n: 10_000, converted: 1_200 });
    expect(down.significant).toBe(true);
    expect(down.high!).toBeLessThan(0);
  });

  it('is undefined for an empty group, and the relative uplift is undefined for a zero holdout rate', () => {
    expect(rate({ n: 0, converted: 0 })).toBeNull();
    expect(uplift({ n: 0, converted: 0 }, { n: 100, converted: 10 })).toMatchObject({ difference: null, low: null, high: null, significant: false });
    expect(uplift({ n: 100, converted: 5 }, { n: 100, converted: 0 })).toMatchObject({ relative: null, difference: 0.05 });
  });

  it('a no-effect comparison centres on zero', () => {
    const u = uplift({ n: 500, converted: 50 }, { n: 500, converted: 50 });
    expect(u.difference).toBe(0);
    expect(u.low).toBeLessThan(0);
    expect(u.high).toBeGreaterThan(0);
    expect(u.significant).toBe(false);
  });
});
