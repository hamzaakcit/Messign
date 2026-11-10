import { describe, expect, it } from 'vitest';
import { navGroupsFor } from '@/components/layout/LeftSidebar';

/** ADR-017: the sidebar follows the surface of the session, so a tenant on a shared build sees engage items only. */

const ids = (surface: 'engage' | 'workspace' | 'all'): string[] => navGroupsFor(surface).flatMap((g) => g.items.map((i) => i.id));

describe('sidebar items by surface', () => {
  it('engage: marketing and settings only', () => {
    expect(ids('engage').sort()).toEqual(['marketing', 'settings']);
  });

  it('workspace and shared builds: the Company-OS items, marketing and settings included', () => {
    for (const surface of ['workspace', 'all'] as const) {
      const list = ids(surface);
      for (const id of ['dashboard', 'finance', 'crm', 'marketing', 'settings', 'chat']) expect(list, `${surface} ${id}`).toContain(id);
    }
  });

  it('drops groups that end up empty', () => {
    expect(navGroupsFor('engage').every((g) => g.items.length > 0)).toBe(true);
  });
});
