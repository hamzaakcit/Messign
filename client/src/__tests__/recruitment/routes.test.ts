import { describe, it, expect } from 'vitest';
import { ROUTES } from '@/lib/routes';

describe('recruitment ROUTES', () => {
  it('defines stable subpaths under recruitment', () => {
    expect(ROUTES.RECRUITMENT).toBe('/recruitment');
    expect(ROUTES.RECRUITMENT_PIPELINE).toBe('/recruitment/pipeline');
    expect(ROUTES.RECRUITMENT_CANDIDATES).toBe('/recruitment/candidates');
    expect(ROUTES.RECRUITMENT_INTERVIEWS).toBe('/recruitment/interviews');
    expect(ROUTES.RECRUITMENT_DASHBOARD).toBe('/recruitment/dashboard');
  });
});
