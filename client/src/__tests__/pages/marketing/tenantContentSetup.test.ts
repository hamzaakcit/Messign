import { describe, expect, it } from 'vitest';
import { floristUsesMessignProduct, TENANT_CONTENT_SETUPS } from '@/pages/marketing/lib/tenantContentSetup';

describe('tenant content setup', () => {
  it('keeps Messign product names off the florist sheet', () => {
    expect(floristUsesMessignProduct()).toBe(false);
    const florist = TENANT_CONTENT_SETUPS.find((setup) => setup.orgKey === 'florist');
    expect(florist?.publishAllowed).toBe(false);
    expect(florist?.productTruth).toHaveLength(3);
    const bookstore = TENANT_CONTENT_SETUPS.find((setup) => setup.orgKey === 'bookstore');
    expect(bookstore?.brandName).toBe('Kitapyurdu');
    expect(bookstore?.publishAllowed).toBe(false);
    expect(bookstore?.productTruth).toHaveLength(3);
  });
});
