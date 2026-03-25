import { describe, it, expect } from 'vitest';
import { dashboardRouter } from '../../routes/dashboard.js';

describe('dashboard router', () => {
  it('registers GET /command-center', () => {
    const paths = dashboardRouter.stack
      .map((layer) => {
        const r = (layer as { route?: { path: string } }).route;
        return r?.path;
      })
      .filter(Boolean);
    expect(paths).toContain('/command-center');
  });
});
