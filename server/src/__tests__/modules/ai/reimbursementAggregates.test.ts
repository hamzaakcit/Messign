import { describe, expect, it } from 'vitest';
import { computeReimbursementAggregates } from '../../../services/ai/tools/reimbursementAggregates.js';

/** Reference id for fixtures (see user-provided sample). */
const REF_USER_ID = '3a733025-e96b-4ee4-9b8a-4fb6423ad4b7';

describe('computeReimbursementAggregates', () => {
  it('sums amounts, counts by status, and buckets by month', () => {
    const rows = [
      {
        id: REF_USER_ID,
        status: 'submitted',
        amount: 100,
        created_at: '2024-03-10T12:00:00.000Z',
      },
      {
        id: 'x2',
        status: 'manager_review',
        amount: 50.5,
        created_at: '2024-03-15T12:00:00.000Z',
      },
      {
        id: 'x3',
        status: 'paid',
        amount: 20,
        created_at: '2024-04-01T12:00:00.000Z',
      },
    ];
    const a = computeReimbursementAggregates(rows);
    expect(a.count).toBe(3);
    expect(a.totalAmount).toBeCloseTo(170.5);
    expect(a.byStatus.submitted).toBe(1);
    expect(a.byStatus.manager_review).toBe(1);
    expect(a.byStatus.paid).toBe(1);
    expect(a.byMonth['2024-03']).toBe(2);
    expect(a.byMonth['2024-04']).toBe(1);
  });
});
