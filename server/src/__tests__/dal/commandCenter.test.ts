import { describe, it, expect } from 'vitest';
import { getCommandCenterData } from '../../dal/commandCenter.js';
import type { CallerContext } from '../../dal/types.js';

describe('getCommandCenterData', () => {
  it('returns empty core metrics when organizationId is missing', async () => {
    const ctx: CallerContext = {
      userId: '00000000-0000-0000-0000-000000000001',
      role: 'employee',
    };
    const data = await getCommandCenterData(ctx);
    expect(data.pulse.activeProjects).toBe(0);
    expect(data.pulse.velocityTrend).toEqual([]);
    expect(data.brain.publishedDocCount).toBe(0);
    expect(data.future.okrs.overallProgress).toBe(0);
    expect(data.workspace.crm.ok).toBe(false);
    expect(typeof data.generatedAt).toBe('string');
  });
});
