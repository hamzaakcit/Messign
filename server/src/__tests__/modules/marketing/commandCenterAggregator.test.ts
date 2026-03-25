import { describe, it, expect } from 'vitest';
import { fillMissingDays } from '../../../services/marketing/commandCenterAggregator.js';

describe('fillMissingDays', () => {
  it('returns N days ending today with zeros for gaps', () => {
    const today = new Date();
    const key = today.toISOString().slice(0, 10);
    const rows = [{ d: key, v: 5 }];
    const out = fillMissingDays(rows, 3);
    expect(out).toHaveLength(3);
    expect(out[2].date).toBe(key);
    expect(out.some((p) => p.value === 5)).toBe(true);
  });

  it('maps known dates to values', () => {
    const today = new Date();
    const key = today.toISOString().slice(0, 10);
    const out = fillMissingDays([{ d: key, v: 7 }], 1);
    expect(out).toHaveLength(1);
    expect(out[0].date).toBe(key);
    expect(out[0].value).toBe(7);
  });
});
