import { describe, it, expect } from 'vitest';
import { getCandidatePoolMetrics } from '../../modules/hr/dal/recruitment/candidates.js';
import type { CallerContext } from '../../dal/types.js';

describe('getCandidatePoolMetrics', () => {
  it('throws when tenant organizationId is missing', async () => {
    const ctx: CallerContext = {
      userId: '00000000-0000-0000-0000-000000000001',
      role: 'employee',
    };
    await expect(getCandidatePoolMetrics(ctx)).rejects.toThrow(/Tenant context required/);
  });
});
