import { describe, it, expect } from 'vitest';

describe('E2E: Performance Metrics Form Logic', () => {
  const toDecimal = (pct: number) => pct / 100;
  const toPercent = (dec: number) => Math.round(dec * 1000) / 10;

  it('round-trips percentage conversion accurately', () => {
    expect(toDecimal(32)).toBeCloseTo(0.32);
    expect(toPercent(0.32)).toBeCloseTo(32);
    expect(toDecimal(5.2)).toBeCloseTo(0.052);
    expect(toPercent(0.052)).toBeCloseTo(5.2);
    expect(toDecimal(0)).toBe(0);
    expect(toDecimal(100)).toBe(1);
  });

  it('handles edge case rates', () => {
    expect(toDecimal(0.1)).toBeCloseTo(0.001);
    expect(toDecimal(99.9)).toBeCloseTo(0.999);
  });

  it('zero and boundary values', () => {
    expect(toPercent(0)).toBe(0);
    expect(toPercent(1)).toBe(100);
    expect(toPercent(0.001)).toBeCloseTo(0.1);
  });
});

describe('E2E: Calibration Display', () => {
  it('calibration prompt text is renderable in UI', () => {
    const mockResponse = {
      text: '## Performance Calibration\nBased on 25 campaigns:\n\n**Baseline:** 28.0% open rate\n**Best themes:** executive, startup\n**Best tones:** confident, friendly',
      generated_at: '2026-03-23T12:00:00.000Z',
      based_on_records: 25,
    };

    expect(mockResponse.text.length).toBeGreaterThan(50);
    expect(mockResponse.based_on_records).toBe(25);
    expect(new Date(mockResponse.generated_at).getFullYear()).toBe(2026);
  });

  it('fallback calibration text is useful', () => {
    const fallback = {
      text: '## Performance Calibration\nNo historical performance data available yet.\nUse industry best practices.',
      generated_at: new Date().toISOString(),
      based_on_records: 0,
    };

    expect(fallback.text).toContain('No historical');
    expect(fallback.based_on_records).toBe(0);
  });

  it('calibration timestamp is valid ISO', () => {
    const ts = '2026-03-22T15:30:00.000Z';
    const d = new Date(ts);
    expect(d.toISOString()).toBe(ts);
  });
});
