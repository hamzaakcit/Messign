import { effectiveSidebarCollapsed } from '@/components/layout/sidebarLayout';

describe('effectiveSidebarCollapsed', () => {
  it('desktop: follows the persisted collapsed setting', () => {
    expect(effectiveSidebarCollapsed(true, false)).toBe(true);
    expect(effectiveSidebarCollapsed(false, false)).toBe(false);
  });

  it('mobile: the drawer is never the collapsed strip, whatever was saved on desktop', () => {
    expect(effectiveSidebarCollapsed(true, true)).toBe(false);
    expect(effectiveSidebarCollapsed(false, true)).toBe(false);
  });
});
