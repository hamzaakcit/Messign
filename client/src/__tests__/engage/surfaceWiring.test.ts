import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * ADR-017: the session surface only works if the app is drawn behind the gate and nothing computes the surface once at
 * load (before the gate has answered). Those are properties of how the files are wired, which a component test of the
 * gate cannot see, so they are checked on the source.
 */
const src = (path: string): string => readFileSync(resolve(__dirname, '../..', path), 'utf8');

describe('session surface wiring', () => {
  it('the main app is drawn behind the surface gate', () => {
    expect(src('App.tsx')).toMatch(/<SurfaceGate>\s*<MainAppPages\s*\/>\s*<\/SurfaceGate>/);
  });

  it('the shell and the sidebar follow the session surface and do not fix it at load', () => {
    for (const file of ['components/layout/AppShell.tsx', 'components/layout/LeftSidebar.tsx']) {
      const text = src(file);
      expect(text, file).toMatch(/useEffectiveSurface\(\)/);
      // No module-level constant derived from the build surface.
      expect(text, file).not.toMatch(/^const \w+\s*(:[^=]+)?=\s*[^;\n]*(getProductSurface|mountsFrozenModules|isNavItemOnSurface)\(/m);
    }
  });

  it('every page-level surface check reads the session surface, not the build surface', () => {
    const files = ['App.tsx', 'components/layout/AppShell.tsx', 'components/layout/LeftSidebar.tsx', 'components/layout/Header.tsx', 'engage/MarketingEntry.tsx'];
    for (const file of files) expect(src(file), file).not.toMatch(/getProductSurface\(\)/);
  });
});
