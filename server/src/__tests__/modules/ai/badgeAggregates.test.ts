import { describe, expect, it } from 'vitest';
import { computeBadgeAggregates } from '../../../services/ai/tools/badgeAggregates.js';

/** Reference id for fixtures (see user-provided sample). */
const REF_USER_ID = '3a733025-e96b-4ee4-9b8a-4fb6423ad4b7';

describe('computeBadgeAggregates', () => {
  it('counts badges and groups by calendar month', () => {
    const rows = [
      { name: 'First', earned_at: '2024-03-15T12:00:00.000Z', user_id: REF_USER_ID },
      { name: 'Second', earned_at: '2024-03-20T12:00:00.000Z' },
      { name: 'Third', earned_at: '2024-04-01T12:00:00.000Z' },
    ];
    const a = computeBadgeAggregates(rows);
    expect(a.count).toBe(3);
    expect(a.byMonth['2024-03']).toBe(2);
    expect(a.byMonth['2024-04']).toBe(1);
  });

  it('skips invalid earned_at', () => {
    const rows = [{ name: 'X', earned_at: 'not-a-date' }, { name: 'Y' }];
    const a = computeBadgeAggregates(rows);
    expect(a.count).toBe(2);
    expect(Object.keys(a.byMonth)).toHaveLength(0);
  });
});
