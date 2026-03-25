import { describe, it, expect } from 'vitest';
import { gatherWorkspaceModules, emptyWorkspaceSnapshots } from '../../dal/workspaceOverview.js';
import type { CallerContext } from '../../dal/types.js';

describe('workspaceOverview', () => {
  it('emptyWorkspaceSnapshots has all modules failed', () => {
    const w = emptyWorkspaceSnapshots();
    expect(w.crm.ok).toBe(false);
    expect(w.hr.ok).toBe(false);
    expect(w.support.ok).toBe(false);
    expect(w.marketing.ok).toBe(false);
    expect(w.assets.ok).toBe(false);
    expect(w.contracts.ok).toBe(false);
    expect(w.okr.ok).toBe(false);
    expect(w.chat.ok).toBe(false);
  });

  it('gatherWorkspaceModules returns all failed when organizationId is missing', async () => {
    const ctx: CallerContext = {
      userId: '00000000-0000-0000-0000-000000000001',
      role: 'employee',
    };
    const w = await gatherWorkspaceModules(ctx);
    expect(w.crm.ok).toBe(false);
    if (!w.crm.ok) expect(w.crm.error).toContain('organization');
    expect(w.chat.ok).toBe(false);
  });
});
