import { describe, expect, it } from 'vitest';
import { computeBountyAggregates } from '../../../services/ai/tools/bountyAggregates.js';

/** Reference id for fixtures (see user-provided sample). */
const REF_USER_ID = '3a733025-e96b-4ee4-9b8a-4fb6423ad4b7';

describe('computeBountyAggregates', () => {
  it('counts status, urgency, and XP', () => {
    const rows = [
      { status: 'OPEN', urgency: 'HIGH', xp_reward: 100, creator_id: REF_USER_ID },
      { status: 'OPEN', urgency: 'LOW', xp_reward: 50 },
    ];
    const a = computeBountyAggregates(rows);
    expect(a.count).toBe(2);
    expect(a.totalXp).toBe(150);
    expect(a.byStatus.OPEN).toBe(2);
    expect(a.byUrgency.HIGH).toBe(1);
    expect(a.byUrgency.LOW).toBe(1);
  });
});
